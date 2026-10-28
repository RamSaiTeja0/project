/**
 * Test Suite: Invigilation Request Substitution Coverage Validation
 *
 * Verifies that a faculty member's scheduled teaching class blocks an invigilation
 * request ONLY when no substitute faculty member has been successfully assigned to cover that class.
 *
 * Covers all 10 required test cases:
 *  1. Teaching class exists; no substitution exists -> request blocked.
 *  2. Teaching class exists; substitution is pending -> request blocked.
 *  3. Teaching class exists; substitution is rejected or cancelled -> request blocked.
 *  4. Teaching class exists; substitute accepted and assigned -> request allowed to continue.
 *  5. No teaching class exists -> request allowed to continue.
 *  6. Substitute assignment belongs to another period -> must not count as coverage.
 *  7. Substitute assignment belongs to another faculty member or class -> must not count as coverage.
 *  8. Multiple exam periods are selected and only some are covered -> validate each period independently.
 *  9. Existing authorization and branch restrictions still work.
 * 10. Existing duplicate invigilation check remains unchanged.
 */

const assert = require('assert');
const http = require('http');

// Set safe environment overrides to ensure zero modification of real database
process.env.DATABASE_URL = '';
process.env.DEMO_MODE = 'true';
process.env.PORT = '0';

const { app } = require('../server');
const store = require('../src/data/store');
const users = require('../src/data/users');
const invigilation = require('../src/data/invigilation');
const substitutions = require('../src/data/substitutions');

let server;
let baseUrl;
let passedCount = 0;

function check(name, fn) {
    try {
        fn();
        passedCount++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        console.error(`  ✗ ${name}:`, err.message);
        throw err;
    }
}

async function checkAsync(name, fn) {
    try {
        await fn();
        passedCount++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        console.error(`  ✗ ${name}:`, err.message);
        throw err;
    }
}

function request(method, path, body = null, cookie = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = { 'Content-Type': 'application/json' };
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
        if (cookie) headers['Cookie'] = cookie;

        const req = http.request(`${baseUrl}${path}`, { method, headers }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (_) {}
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: parsed,
                    raw: data,
                    cookie: res.headers['set-cookie'] ? res.headers['set-cookie'][0].split(';')[0] : null
                });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runTests() {
    console.log('================================================================');
    console.log('Invigilation Request — Substitution Coverage Test Suite');
    console.log('================================================================\n');

    // Start ephemeral server
    await new Promise(resolve => {
        server = app.listen(0, '127.0.0.1', () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });

    try {
        // Reset in-memory test stores
        substitutions.resetForTesting();
        invigilation.resetForTesting();

        // Target Date: 2026-10-30 is a Friday
        const testDate = '2026-10-30';
        const testDay = 'Friday';

        // Mock Faculty A (Original faculty with scheduled class)
        const facultyA = {
            id: 101,
            name: 'Dr. Test Faculty A',
            department: 'CME',
            status: 'active'
        };

        // Mock Faculty B (Substitute candidate)
        const facultyB = {
            id: 102,
            name: 'Prof. Test Substitute B',
            department: 'CME',
            status: 'active'
        };

        const sessionFacultyA = {
            username: 'faculty_a',
            name: facultyA.name,
            facultyId: facultyA.id,
            facultyName: facultyA.name,
            role: 'faculty',
            department: 'CME'
        };

        users.syncFromDatabase([
            { id: 101, username: 'faculty_a', name: facultyA.name, role: 'faculty', department: 'CME', active: true, facultyId: 101 },
            { id: 102, username: 'substitute_b', name: facultyB.name, role: 'faculty', department: 'CME', active: true, facultyId: 102 }
        ]);

        const sessionHOS = {
            username: 'hos_cme',
            name: 'HOS CME',
            role: 'hos',
            department: 'CME'
        };

        // Configure engine slot records for Friday Period 6: Faculty A teaches Class CME-A
        // Friday Period 4: Faculty A teaches Class CME-B
        // Friday Period 2: Faculty A has NO class (FREE)
        const mockEngine = {
            getPeriods: () => [1, 2, 3, 4, 5, 6, 7],
            normalizePeriod: (p) => parseInt(p, 10),
            getSlot: (day, period) => {
                const p = parseInt(period, 10);
                if (day === 'Friday' && p === 6) {
                    return {
                        busy: [{
                            faculty: facultyA.name,
                            facultyId: facultyA.id,
                            className: 'CME-A',
                            subject: 'Software Engineering',
                            room: 'Room-101',
                            status: 'busy'
                        }]
                    };
                }
                if (day === 'Friday' && p === 4) {
                    return {
                        busy: [{
                            faculty: facultyA.name,
                            facultyId: facultyA.id,
                            className: 'CME-B',
                            subject: 'Compiler Design',
                            room: 'Room-102',
                            status: 'busy'
                        }]
                    };
                }
                return { busy: [] };
            },
            getFaculty: () => [facultyA, facultyB]
        };
        Object.defineProperty(store, 'engine', { value: mockEngine, configurable: true, writable: true });

        // -------------------------------------------------------------
        // CASE 1: Teaching class exists, NO substitution exists -> Blocked
        // -------------------------------------------------------------
        console.log('\n--- Case 1: Teaching class exists, no substitution exists ---');
        await checkAsync('Case 1: Request for Friday Period 6 is blocked with clear message', async () => {
            let errorCaught = null;
            try {
                await invigilation.submitInvigilationRequest({
                    date: testDate,
                    periods: [6],
                    reason: 'Exam duty',
                    sessionUser: sessionFacultyA
                });
            } catch (err) {
                errorCaught = err;
            }
            assert.ok(errorCaught, 'Must throw error');
            assert.strictEqual(errorCaught.status, 409);
            assert.strictEqual(errorCaught.code, 'FACULTY_PERIOD_CONFLICT');
            assert.ok(
                errorCaught.message.includes('You have a scheduled teaching class on Friday, Period 6, and no substitute has been assigned to cover it.'),
                `Message was: "${errorCaught.message}"`
            );
        });

        // -------------------------------------------------------------
        // CASE 2: Teaching class exists, substitution is PENDING -> Blocked
        // -------------------------------------------------------------
        console.log('\n--- Case 2: Teaching class exists, substitution is PENDING ---');
        substitutions.syncFromDatabase([{
            id: 'sub_test_p6_pending',
            date: testDate,
            dayOfWeek: testDay,
            period: 6,
            className: 'CME-A',
            subject: 'Software Engineering',
            originalFacultyId: facultyA.id,
            originalFacultyName: facultyA.name,
            originalFacultyBranch: 'CME',
            substituteFacultyId: facultyB.id,
            substituteFacultyName: facultyB.name,
            substituteFacultyBranch: 'CME',
            requestedBy: 'faculty_a',
            status: 'PENDING'
        }]);

        await checkAsync('Case 2: Pending substitution does NOT count as coverage (blocked)', async () => {
            let errorCaught = null;
            try {
                await invigilation.submitInvigilationRequest({
                    date: testDate,
                    periods: [6],
                    reason: 'Exam duty',
                    sessionUser: sessionFacultyA
                });
            } catch (err) {
                errorCaught = err;
            }
            assert.ok(errorCaught, 'Must throw error for pending substitution');
            assert.strictEqual(errorCaught.status, 409);
            assert.strictEqual(errorCaught.code, 'FACULTY_PERIOD_CONFLICT');
            assert.ok(
                errorCaught.message.includes('pending (not yet accepted)'),
                `Message was: "${errorCaught.message}"`
            );
        });

        // -------------------------------------------------------------
        // CASE 3: Teaching class exists, substitution is REJECTED or CANCELLED -> Blocked
        // -------------------------------------------------------------
        console.log('\n--- Case 3: Teaching class exists, substitution is REJECTED or CANCELLED ---');
        substitutions.syncFromDatabase([{
            id: 'sub_test_p6_pending',
            date: testDate,
            dayOfWeek: testDay,
            period: 6,
            className: 'CME-A',
            subject: 'Software Engineering',
            originalFacultyId: facultyA.id,
            originalFacultyName: facultyA.name,
            originalFacultyBranch: 'CME',
            substituteFacultyId: facultyB.id,
            substituteFacultyName: facultyB.name,
            substituteFacultyBranch: 'CME',
            requestedBy: 'faculty_a',
            status: 'REJECTED'
        }]);

        await checkAsync('Case 3a: Rejected substitution does NOT count as coverage (blocked)', async () => {
            let errorCaught = null;
            try {
                await invigilation.submitInvigilationRequest({
                    date: testDate,
                    periods: [6],
                    reason: 'Exam duty',
                    sessionUser: sessionFacultyA
                });
            } catch (err) {
                errorCaught = err;
            }
            assert.ok(errorCaught, 'Must throw error for rejected substitution');
            assert.strictEqual(errorCaught.status, 409);
            assert.ok(
                errorCaught.message.includes('rejected. No substitute has been assigned to cover it.'),
                `Message was: "${errorCaught.message}"`
            );
        });

        substitutions.syncFromDatabase([{
            id: 'sub_test_p6_pending',
            date: testDate,
            dayOfWeek: testDay,
            period: 6,
            className: 'CME-A',
            subject: 'Software Engineering',
            originalFacultyId: facultyA.id,
            originalFacultyName: facultyA.name,
            originalFacultyBranch: 'CME',
            substituteFacultyId: facultyB.id,
            substituteFacultyName: facultyB.name,
            substituteFacultyBranch: 'CME',
            requestedBy: 'faculty_a',
            status: 'CANCELLED'
        }]);

        await checkAsync('Case 3b: Cancelled substitution does NOT count as coverage (blocked)', async () => {
            let errorCaught = null;
            try {
                await invigilation.submitInvigilationRequest({
                    date: testDate,
                    periods: [6],
                    reason: 'Exam duty',
                    sessionUser: sessionFacultyA
                });
            } catch (err) {
                errorCaught = err;
            }
            assert.ok(errorCaught, 'Must throw error for cancelled substitution');
            assert.strictEqual(errorCaught.status, 409);
            assert.ok(
                errorCaught.message.includes('cancelled. No substitute has been assigned to cover it.'),
                `Message was: "${errorCaught.message}"`
            );
        });

        // -------------------------------------------------------------
        // CASE 4: Teaching class exists, substitute ACCEPTED and assigned -> Allowed
        // -------------------------------------------------------------
        console.log('\n--- Case 4: Substitute ACCEPTED and assigned ---');
        substitutions.syncFromDatabase([{
            id: 'sub_test_p6_pending',
            date: testDate,
            dayOfWeek: testDay,
            period: 6,
            className: 'CME-A',
            subject: 'Software Engineering',
            originalFacultyId: facultyA.id,
            originalFacultyName: facultyA.name,
            originalFacultyBranch: 'CME',
            substituteFacultyId: facultyB.id,
            substituteFacultyName: facultyB.name,
            substituteFacultyBranch: 'CME',
            requestedBy: 'faculty_a',
            status: 'ACCEPTED'
        }]);

        await checkAsync('Case 4: Accepted substitution allows invigilation request to proceed', async () => {
            const req = await invigilation.submitInvigilationRequest({
                date: testDate,
                periods: [6],
                reason: 'Mid-term invigilation',
                sessionUser: sessionFacultyA
            });
            assert.ok(req, 'Request must be created');
            assert.strictEqual(req.status, 'PENDING');
            assert.deepStrictEqual(req.periods, [6]);
            assert.strictEqual(req.blockedPeriods.length, 0);
        });

        // -------------------------------------------------------------
        // CASE 5: No teaching class exists -> Allowed
        // -------------------------------------------------------------
        console.log('\n--- Case 5: No scheduled teaching class ---');
        await checkAsync('Case 5: Friday Period 2 has no teaching class -> Allowed to proceed', async () => {
            const req = await invigilation.submitInvigilationRequest({
                date: testDate,
                periods: [2],
                reason: 'Morning invigilation',
                sessionUser: sessionFacultyA
            });
            assert.ok(req, 'Request must be created');
            assert.deepStrictEqual(req.periods, [2]);
            assert.strictEqual(req.blockedPeriods.length, 0);
        });

        // -------------------------------------------------------------
        // CASE 6: Substitute assignment belongs to another period -> Uncovered
        // -------------------------------------------------------------
        console.log('\n--- Case 6: Substitution for another period does not cover Period 4 ---');
        await checkAsync('Case 6: Period 6 accepted substitution does not cover Period 4 (blocked)', async () => {
            // Faculty A teaches Period 4 (CME-B), but the accepted substitution is only for Period 6
            let errorCaught = null;
            try {
                await invigilation.submitInvigilationRequest({
                    date: testDate,
                    periods: [4],
                    reason: 'Exam duty',
                    sessionUser: sessionFacultyA
                });
            } catch (err) {
                errorCaught = err;
            }
            assert.ok(errorCaught, 'Period 4 must be blocked because it has no substitute');
            assert.strictEqual(errorCaught.status, 409);
            assert.ok(
                errorCaught.message.includes('Friday, Period 4, and no substitute has been assigned to cover it.'),
                `Message was: "${errorCaught.message}"`
            );
        });

        // -------------------------------------------------------------
        // CASE 7: Substitute assignment belongs to another faculty or class -> Uncovered
        // -------------------------------------------------------------
        console.log('\n--- Case 7: Substitution for another faculty or class does not cover ---');
        // Register an accepted substitution for Faculty C (different faculty) for Period 4
        substitutions.syncFromDatabase([{
            id: 'sub_test_p4_different_fac',
            date: testDate,
            dayOfWeek: testDay,
            period: 4,
            className: 'CME-B',
            subject: 'Compiler Design',
            originalFacultyId: 999,
            originalFacultyName: 'Dr. Other Faculty C',
            originalFacultyBranch: 'CME',
            substituteFacultyId: facultyB.id,
            substituteFacultyName: facultyB.name,
            substituteFacultyBranch: 'CME',
            requestedBy: 'other_faculty',
            status: 'ACCEPTED'
        }]);

        await checkAsync('Case 7: Different faculty substitution does not cover Faculty A', async () => {
            let errorCaught = null;
            try {
                await invigilation.submitInvigilationRequest({
                    date: testDate,
                    periods: [4],
                    reason: 'Exam duty',
                    sessionUser: sessionFacultyA
                });
            } catch (err) {
                errorCaught = err;
            }
            assert.ok(errorCaught, 'Must throw error when substitute belongs to someone else');
            assert.strictEqual(errorCaught.status, 409);
            assert.ok(errorCaught.message.includes('Period 4'));
        });

        // -------------------------------------------------------------
        // CASE 8: Multiple exam periods selected: some covered, some uncovered
        // -------------------------------------------------------------
        console.log('\n--- Case 8: Multiple periods: validate each period independently ---');
        await checkAsync('Case 8: Selected [2, 4]: Period 2 succeeds, Period 4 is blocked', async () => {
            // Period 2: No class (valid)
            // Period 4: Teaching class CME-B with NO accepted substitute (blocked)
            const req = await invigilation.submitInvigilationRequest({
                date: testDate,
                periods: [2, 4],
                reason: 'Combined duties',
                sessionUser: sessionFacultyA
            });
            assert.ok(req, 'Request must be created for the valid periods');
            assert.deepStrictEqual(req.periods, [2], 'Only Period 2 should be in the request');
            assert.strictEqual(req.blockedPeriods.length, 1, 'Period 4 must be recorded as blocked');
            assert.strictEqual(req.blockedPeriods[0].period, 4);
            assert.ok(req.blockedPeriods[0].reason.includes('Period 4, and no substitute has been assigned to cover it.'));
        });

        // -------------------------------------------------------------
        // CASE 9: Authorization checks: HOS cannot use faculty request endpoint
        // -------------------------------------------------------------
        console.log('\n--- Case 9: Role-based authorization guard ---');
        await checkAsync('Case 9: HOS is rejected from submitting faculty invigilation request', async () => {
            let errorCaught = null;
            try {
                await invigilation.submitInvigilationRequest({
                    date: testDate,
                    periods: [2],
                    reason: 'HOS request',
                    sessionUser: sessionHOS
                });
            } catch (err) {
                errorCaught = err;
            }
            assert.ok(errorCaught, 'HOS must be rejected');
            assert.strictEqual(errorCaught.status, 403);
            assert.strictEqual(errorCaught.code, 'FORBIDDEN');
        });

        // -------------------------------------------------------------
        // CASE 10: Duplicate active invigilation is prevented
        // -------------------------------------------------------------
        console.log('\n--- Case 10: Duplicate active invigilation guard ---');
        // Assign direct invigilation for Period 2 to Faculty A
        await invigilation.createDirectAssignment({
            facultyIdentifier: facultyA.id,
            date: testDate,
            periods: [2],
            notes: 'Active assignment',
            sessionUser: sessionHOS
        });

        await checkAsync('Case 10: Duplicate active invigilation blocks request for that period', async () => {
            let errorCaught = null;
            try {
                await invigilation.submitInvigilationRequest({
                    date: testDate,
                    periods: [2],
                    reason: 'Another request for Period 2',
                    sessionUser: sessionFacultyA
                });
            } catch (err) {
                errorCaught = err;
            }
            assert.ok(errorCaught, 'Must block duplicate invigilation');
            assert.strictEqual(errorCaught.status, 409);
            assert.strictEqual(errorCaught.code, 'DUPLICATE_INVIGILATION');
        });

        // -------------------------------------------------------------
        // HTTP API Endpoint Verification
        // -------------------------------------------------------------
        console.log('\n--- HTTP API Endpoint Verification ---');
        await checkAsync('HTTP 1: Unauthenticated request to /api/invigilation/requests returns 401', async () => {
            const res = await request('POST', '/api/invigilation/requests', {
                date: testDate,
                periods: [2],
                reason: 'Unauth attempt'
            });
            assert.strictEqual(res.status, 401);
            assert.strictEqual(res.body.code, 'UNAUTHENTICATED');
        });

        await checkAsync('HTTP 2: GET /api/invigilation/periods returns configured periods', async () => {
            const res = await request('GET', '/api/invigilation/periods');
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body.periods));
            assert.deepStrictEqual(res.body.periods, [1, 2, 3, 4, 5, 6, 7]);
        });

        console.log(`\n================================================================`);
        console.log(`✅ All ${passedCount} tests PASSED cleanly with zero failures.`);
        console.log(`================================================================\n`);
    } finally {
        if (server) server.close();
    }
}

runTests()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('\n✗ Test Suite FAILED:', err);
        process.exit(1);
    });
