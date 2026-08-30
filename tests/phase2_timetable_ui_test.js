/**
 * Phase 2 tests: primary timetable page + click -> availability flow.
 *
 * Verifies the page and its script are served, that the page exposes the DOM
 * hooks and states the UI depends on, and that the exact request the frontend
 * sends for a clicked cell returns the correct faculty list — including the
 * empty, invalid and unreachable cases.
 *
 * Usage: node tests/phase2_timetable_ui_test.js
 */
const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { build } = require('../data/timetableStore');

const PORT = process.env.TEST_PORT || 3198;
const BASE = `http://localhost:${PORT}`;

let passed = 0;
function check(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

function request(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request(`${BASE}${urlPath}`, {
            method,
            headers: payload
                ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
                : {}
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (e) { /* html or empty */ }
                resolve({ status: res.statusCode, body: parsed, raw: data });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function waitForServer(attempts = 40) {
    return new Promise((resolve, reject) => {
        const tick = n => {
            request('GET', '/api/availability/meta')
                .then(resolve)
                .catch(err => {
                    if (n <= 0) return reject(err);
                    setTimeout(() => tick(n - 1), 250);
                });
        };
        tick(attempts);
    });
}

/** Exactly what public/js/tecsubstitution.js posts when a cell is clicked. */
function clickPayload(cell) {
    return {
        day: cell.day,
        period: cell.period,
        class: cell.class,
        subject: cell.subject,
        faculty: cell.faculty,
        room: cell.room
    };
}

async function pageTests() {
    console.log('\n[1] Primary timetable page is served');

    const pretty = await request('GET', '/tecsubstitution');
    const direct = await request('GET', '/tecsubstitution.html');
    check('/tecsubstitution and /tecsubstitution.html both serve the page', () => {
        assert.strictEqual(pretty.status, 200);
        assert.strictEqual(direct.status, 200);
        assert.ok(pretty.raw.includes('TecSubstitution'));
        assert.strictEqual(pretty.raw, direct.raw);
    });

    check('page contains the timetable and result-panel hooks', () => {
        ['timetableHead', 'timetableBody', 'resultPanel', 'classChip', 'timetableState']
            .forEach(id => assert.ok(pretty.raw.includes(`id="${id}"`), `missing #${id}`));
        assert.ok(pretty.raw.includes('/js/tecsubstitution.js'), 'page must load its script');
    });

    check('page states that nothing is assigned or saved', () => {
        assert.match(pretty.raw, /Nothing is assigned or saved/i);
    });

    const script = await request('GET', '/js/tecsubstitution.js');
    check('page script is served', () => {
        assert.strictEqual(script.status, 200);
        assert.ok(script.raw.length > 0);
    });

    check('script posts to /api/availability and handles every result state', () => {
        assert.ok(script.raw.includes("'/api/availability'"), 'must call the Phase 1 endpoint');
        assert.ok(script.raw.includes("method: 'POST'"));
        assert.ok(script.raw.includes('availableFaculty'), 'must read availableFaculty');
        assert.ok(script.raw.includes('No faculty available for this period.'),
            'must carry the required empty-state message');
        assert.ok(script.raw.includes('Could not reach the server'), 'must handle network failure');
    });

    check('script contains no assignment or persistence calls', () => {
        [
            '/api/substitutions/assign',
            '/api/substitutions/status',
            'localStorage',
            'sessionStorage'
        ].forEach(forbidden => {
            assert.ok(!script.raw.includes(forbidden), `script must not use ${forbidden}`);
        });
        // The page's only POSTs are the availability lookup and the explicit,
        // user-confirmed timetable import. Nothing else writes.
        const writeVerbs = script.raw.match(/method:\s*'(POST|PUT|PATCH|DELETE)'/g) || [];
        assert.strictEqual(writeVerbs.length, 2, `expected 2 POSTs, found ${writeVerbs.length}`);
        assert.ok(script.raw.includes('IMPORT_PREVIEW_URL'), 'import preview endpoint');
        assert.ok(script.raw.includes('IMPORT_COMMIT_URL'), 'import commit endpoint');
    });
}

async function clickFlowTests() {
    console.log('\n[2] Clicked cell -> availability');

    const tt = await request('GET', '/api/availability/timetable');
    const cells = tt.body.cells;

    check('every rendered cell carries full metadata', () => {
        assert.strictEqual(cells.length, 42);
        cells.forEach(c => {
            assert.ok(c.day && c.period, 'cell needs day + period');
            assert.ok('class' in c && 'subject' in c && 'faculty' in c && 'room' in c,
                'cell needs class/subject/faculty/room keys');
        });
    });

    // Five distinct cells across different days, periods and faculty.
    const picks = [
        { day: 'Monday',    period: 2 },
        { day: 'Tuesday',   period: 7 },
        { day: 'Wednesday', period: 5 },
        { day: 'Thursday',  period: 1 },
        { day: 'Friday',    period: 4 },
        { day: 'Saturday',  period: 6 }
    ];
    // Every picked cell has a resolved faculty, so the cell owner must never
    // appear in its own availability list.

    const results = [];
    for (const pick of picks) {
        const cell = cells.find(c => c.day === pick.day && c.period === pick.period);
        assert.ok(cell, `no cell for ${pick.day} P${pick.period}`);
        const res = await request('POST', '/api/availability', clickPayload(cell));
        results.push({ cell, res });
    }

    check(`clicking ${picks.length} different cells sends the right day + period`, () => {
        results.forEach(({ cell, res }) => {
            assert.strictEqual(res.status, 200, `${cell.day} P${cell.period} -> ${res.status}`);
            assert.strictEqual(res.body.day, cell.day);
            assert.strictEqual(res.body.period, cell.period);
        });
    });

    check('each click returns a usable faculty list', () => {
        results.forEach(({ cell, res }) => {
            assert.ok(Array.isArray(res.body.availableFaculty));
            assert.ok(res.body.availableFaculty.length > 0,
                `${cell.day} P${cell.period} returned no faculty`);
            // The cell's own faculty is never offered as available.
            assert.ok(!res.body.availableFaculty.includes(cell.faculty));
            // Nobody appears as both free and busy.
            const both = res.body.availableFaculty.filter(f => res.body.busy.some(b => b.faculty === f));
            assert.strictEqual(both.length, 0);
        });
    });

    check('a period with multiple available faculty lists them all', () => {
        const monday = results[0].res.body;
        assert.ok(monday.availableFaculty.length >= 2,
            'Monday P2 should have several free faculty');
        assert.deepStrictEqual(monday.availableFaculty.slice().sort(), [
            'Sri B.Gopala Rao', 'Ms.G.Sandhya Rani', 'Ms.Harathi',
            'Mrs.A.Sravanthi', 'Mrs.K.Anitha', 'Mr. Ch.Sai Kishore'
        ].sort());
    });
}

async function errorPathTests() {
    console.log('\n[3] Error and empty paths');

    const badDay = await request('POST', '/api/availability', { day: 'Noneday', period: 2 });
    check('invalid day returns 400 with a message the UI can show', () => {
        assert.strictEqual(badDay.status, 400);
        assert.ok(badDay.body.error && badDay.body.error.length > 0);
    });

    const badPeriod = await request('POST', '/api/availability', { day: 'Monday', period: 42 });
    check('invalid period returns 400 with a message the UI can show', () => {
        assert.strictEqual(badPeriod.status, 400);
        assert.ok(badPeriod.body.error && badPeriod.body.error.length > 0);
    });

    // A genuinely empty result: build a timetable where every faculty is teaching
    // at the slot. This is the response the UI must render as
    // "No faculty available for this period."
    check('a fully-booked slot yields an empty availableFaculty list', () => {
        const store = build({
            meta: { primaryClass: 'X', days: ['Monday'], periods: [1] },
            faculty: [{ id: 'F1', name: 'Ravi' }, { id: 'F2', name: 'Kiran' }],
            classes: [
                { class: 'X', rows: { Monday: [{ period: 1, subject: 'A', faculty: 'Ravi' }] } },
                { class: 'Y', rows: { Monday: [{ period: 1, subject: 'B', faculty: 'Kiran' }] } }
            ]
        });
        assert.deepStrictEqual(store.getAvailableFaculty('Monday', 1), []);
        assert.strictEqual(store.getSlot('Monday', 1).busy.length, 2);
    });

    const excluded = await request('POST', '/api/availability',
        { day: 'Monday', period: 2, excludeFaculty: 'Ms.Harathi' });
    check('excluding a free faculty removes exactly that name', () => {
        assert.strictEqual(excluded.status, 200);
        assert.ok(!excluded.body.availableFaculty.includes('Ms.Harathi'));
        assert.strictEqual(excluded.body.availableFaculty.length, 5);
    });

    const unreachable = await new Promise(resolve => {
        const req = http.request('http://localhost:59999/api/availability', { method: 'POST' }, () => {});
        req.on('error', err => resolve(err));
        req.end();
    });
    check('an unreachable server surfaces a network error (UI shows the retry state)', () => {
        assert.ok(unreachable instanceof Error);
        assert.strictEqual(unreachable.code, 'ECONNREFUSED');
    });
}

async function regressionTests() {
    console.log('\n[4] Existing pages and APIs still work');

    const pages = ['/', '/home', '/login', '/dashboard', '/index.html', '/demo_2.html'];
    const responses = {};
    for (const p of pages) responses[p] = await request('GET', p);

    check('all pre-existing pages still return 200', () => {
        pages.forEach(p => assert.strictEqual(responses[p].status, 200, `${p} -> ${responses[p].status}`));
    });

    check('home page keeps its existing content and gains the timetable link', () => {
        const home = responses['/home'].raw;
        assert.ok(home.includes('TecSubtitution'), 'branding preserved');
        assert.ok(home.includes('Smart Faculty Scheduling'), 'hero preserved');
        assert.ok(home.includes('id="how-it-works"'), 'sections preserved');
        assert.ok(home.includes('/tecsubstitution'), 'timetable link added');
    });

    check('dashboard keeps the existing OCR/upload UI layers', () => {
        const dash = responses['/dashboard'].raw;
        ['validationSummaryContainer', 'extractedGridContainer', 'rawOcrDetails', 'normalizedDetails']
            .forEach(id => assert.ok(dash.includes(id), `missing ${id}`));
    });

    const phase1 = await request('POST', '/api/availability', { day: 'Monday', period: 2 });
    check('the Phase 1 API is unchanged', () => {
        assert.strictEqual(phase1.status, 200);
        assert.strictEqual(phase1.body.availableFaculty.length, 6);
    });
}

async function main() {
    console.log('TecSubstitution — Phase 2 timetable UI tests');

    const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverLog = '';
    server.stdout.on('data', d => serverLog += d);
    server.stderr.on('data', d => serverLog += d);

    try {
        await waitForServer();
        await pageTests();
        await clickFlowTests();
        await errorPathTests();
        await regressionTests();
    } catch (err) {
        console.error('\nServer output:\n' + serverLog);
        throw err;
    } finally {
        server.kill();
    }

    console.log(`\n🎉 All ${passed} Phase 2 checks passed.`);
}

main().catch(err => {
    console.error('\n✗ FAILED:', err.message);
    process.exit(1);
});
