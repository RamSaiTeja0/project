/**
 * PostgreSQL connection pool (Neon).
 *
 * The database is OPTIONAL. With no DATABASE_URL the whole module reports
 * `isConfigured() === false` and the application falls back to the bundled
 * in-memory demo dataset, exactly as it behaved before this layer existed.
 *
 * The connection string is read from the environment and never logged: the
 * helpers here only ever expose the host, so a diagnostic can say where it is
 * connecting without printing the password.
 */
const { Pool } = require('pg');
const config = require('../config');

let pool = null;

function isConfigured() {
    return Boolean(config.databaseUrl);
}

/**
 * Neon requires TLS. When `sslmode` is specified in the URL (e.g. `sslmode=verify-full`),
 * pg-connection-string configures TLS directly from the connection string.
 * For unadorned non-local connection strings, TLS is enabled with full certificate
 * verification so hosted databases are never contacted in the clear.
 */
function sslFor(url) {
    if (!url) return undefined;
    if (/sslmode=disable/i.test(url)) return false;
    if (/^postgres(ql)?:\/\/[^/]*@?(localhost|127\.0\.0\.1)/i.test(url)) return false;
    if (/sslmode=/i.test(url)) {
        // Let pg / pg-connection-string handle TLS configuration from the connection string itself
        return undefined;
    }
    // Remote host with no explicit sslmode parameter: enforce secure TLS with full verification
    return true;
}

function getPool() {
    if (!isConfigured()) return null;
    if (!pool) {
        const poolOptions = {
            connectionString: config.databaseUrl,
            max: config.dbPoolMax,
            connectionTimeoutMillis: config.dbConnectTimeoutMs,
            idleTimeoutMillis: 30000
        };
        const ssl = sslFor(config.databaseUrl);
        if (ssl !== undefined) {
            poolOptions.ssl = ssl;
        }
        pool = new Pool(poolOptions);
        // An idle client dropped by the server must not take the process down.
        pool.on('error', err => console.error('[db] idle client error:', err.message));
    }
    return pool;
}

function query(text, params) {
    const p = getPool();
    if (!p) throw new Error('DATABASE_URL is not configured');
    return p.query(text, params);
}

/** Run a function inside a transaction, rolling back on any error. */
async function withTransaction(fn) {
    const p = getPool();
    if (!p) throw new Error('DATABASE_URL is not configured');
    const client = await p.connect();
    const errorHandler = err => console.error('[db] client socket error:', err.message);
    client.on('error', errorHandler);
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* the original error matters more */ }
        throw err;
    } finally {
        client.removeListener('error', errorHandler);
        client.release();
    }
}

/** Host and database name only — never the user, password or full URL. */
function describeTarget() {
    if (!isConfigured()) return null;
    try {
        const parsed = new URL(config.databaseUrl);
        return `${parsed.hostname}/${parsed.pathname.replace(/^\//, '') || 'postgres'}`;
    } catch (_) {
        return 'configured database';
    }
}

async function close() {
    if (pool) {
        const closing = pool;
        pool = null;
        await closing.end();
    }
}

module.exports = { isConfigured, getPool, query, withTransaction, describeTarget, close, resetPool: close };
