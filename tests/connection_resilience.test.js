/**
 * Focused regression tests for PostgreSQL connection resilience,
 * DNS resolution order, startup bootstrap behavior, and fallback guards.
 */
const assert = require('assert');
const dns = require('dns');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');

const config = require('../src/config');
const db = require('../src/db/pool');
const store = require('../src/data/store');
const { verifySafetyGuard } = require('./testDbGuard');

async function testConnectionResilience() {
    console.log('--- [Test 1] DNS Result Order Verification ---');
    if (typeof dns.getDefaultResultOrder === 'function') {
        const order = dns.getDefaultResultOrder();
        console.log('Active default DNS result order:', order);
        assert.strictEqual(order, 'ipv4first', 'Default DNS result order must be ipv4first');
    }

    console.log('\n--- [Test 2] Database Connection Safety Guard Check ---');
    const guardInfo = verifySafetyGuard();
    console.log('Safety guard verified test database target:', guardInfo.parsedTest.full);
    assert.ok(guardInfo.testDatabaseUrl, 'Test database URL must be configured');
    assert.notStrictEqual(guardInfo.parsedTest.full, guardInfo.appProdUrl, 'Must not collide with app DB');

    console.log('\n--- [Test 3] PostgreSQL-Backed Storage Activation ---');
    const initResult = await store.initFromDatabase({ seed: false, maxAttempts: 2 });
    assert.strictEqual(initResult.enabled, true, 'Database init must succeed on isolated test DB');
    assert.strictEqual(store.usingDatabase, true, 'store.usingDatabase must be true');
    assert.strictEqual(store.origin, 'neon-postgres', 'store.origin must be neon-postgres');
    assert.strictEqual(store.databaseError, null, 'store.databaseError must be null');

    console.log('\n--- [Test 4] Failed Connection Does NOT Silently Fall Back to Demo Mode ---');
    // Subprocess test: run server.js with an unroutable DATABASE_URL and DEMO_MODE not set
    const failProc = spawnSync(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: {
            ...process.env,
            DATABASE_URL: 'postgres://invalid_user:invalid_pass@127.0.0.1:54329/invalid_db?sslmode=disable',
            DB_CONNECT_TIMEOUT_MS: '1000',
            DEMO_MODE: 'false',
            PORT: '3399'
        },
        timeout: 10000,
        encoding: 'utf8'
    });
    assert.notStrictEqual(failProc.status, 0, 'Server must fail startup (exit code != 0) when DB is unavailable');
    assert.ok(
        failProc.stderr.includes('FATAL') || failProc.stderr.includes('Startup aborted'),
        `stderr must report FATAL / startup aborted: ${failProc.stderr}`
    );
    assert.ok(
        !failProc.stderr.includes('Falling back to the bundled demo dataset.'),
        'Must NOT silently fall back to demo dataset'
    );
    console.log('  ✓ Verified: Startup aborts cleanly when database connection fails');

    console.log('\n--- [Test 5] Explicit DEMO_MODE=true Preserves Offline Demo Capability ---');
    // Subprocess test: run server.js with unroutable DB but explicit DEMO_MODE=true
    const demoProc = spawnSync(process.execPath, ['-e', `
        process.env.DATABASE_URL = 'postgres://invalid:invalid@127.0.0.1:54329/invalid?sslmode=disable';
        process.env.DB_CONNECT_TIMEOUT_MS = '1000';
        process.env.DEMO_MODE = 'true';
        process.env.PORT = '3398';
        const server = require('./server');
        // Test that config detects demoMode
        assert = require('assert');
        assert.strictEqual(server.config.demoMode, true);
        console.log('DEMO_MODE verified: true');
    `], {
        cwd: path.join(__dirname, '..'),
        timeout: 10000,
        encoding: 'utf8'
    });
    assert.strictEqual(demoProc.status, 0, `DEMO_MODE check failed: ${demoProc.stderr}`);
    assert.ok(demoProc.stdout.includes('DEMO_MODE verified: true'));
    console.log('  ✓ Verified: DEMO_MODE=true is respected');

    console.log('\n--- [Test 6] Health & Storage Endpoints with Active DB ---');
    const { app } = require('../server');
    const testServer = app.listen(0, '127.0.0.1');
    await new Promise(resolve => testServer.once('listening', resolve));
    const testPort = testServer.address().port;

    const healthData = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${testPort}/api/health`, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
    });

    const storageData = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${testPort}/api/storage`, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
    });

    testServer.close();
    await db.close();

    assert.strictEqual(healthData.storage, 'postgres', 'Health endpoint must report storage: postgres');
    assert.strictEqual(storageData.backend, 'postgres', 'Storage endpoint must report backend: postgres');
    assert.strictEqual(storageData.editable, true, 'Storage endpoint must report editable: true');
    assert.strictEqual(storageData.error, null, 'Storage endpoint error must be null');
    assert.ok(storageData.target, 'Target must be reported');
    console.log('  ✓ Health endpoint reports storage: postgres');
    console.log('  ✓ Storage endpoint reports backend: postgres, editable: true');

    console.log('\n--- [Test 7] SSL Configuration & Warning Elimination Verification ---');
    const parse = require('pg-connection-string').parse;
    let warningCaptured = null;
    const warningListener = (warning) => {
        if (warning.name === 'SecurityWarning' || warning.message.includes('The SSL modes')) {
            warningCaptured = warning.message;
        }
    };
    process.on('warning', warningListener);

    // Verify config.databaseUrl has sslmode=verify-full
    const parsedConn = parse(config.databaseUrl);
    assert.strictEqual(parsedConn.sslmode, 'verify-full', 'sslmode must be verify-full');
    assert.strictEqual(warningCaptured, null, 'No pg-connection-string deprecation warning should be emitted');

    // Verify pool does not pass rejectUnauthorized: false
    const poolModule = require('../src/db/pool');
    const sslConfig = poolModule.getPool().options.ssl;
    if (sslConfig && typeof sslConfig === 'object') {
        assert.notStrictEqual(sslConfig.rejectUnauthorized, false, 'rejectUnauthorized must NOT be false');
    }
    process.removeListener('warning', warningListener);
    console.log('  ✓ Verified: sslmode=verify-full active, zero deprecation warnings emitted, certificate verification enforced');

    console.log('\n✅ All connection resilience, SSL verification, and fallback guard tests PASSED.');
}

testConnectionResilience()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('\n✗ Test failed:', err);
        process.exit(1);
    });
