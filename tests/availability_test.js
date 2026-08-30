/**
 * Phase 1 tests: normalized timetable store + availability API.
 *
 * Runs two layers:
 *   1. Store logic (no server needed)
 *   2. HTTP API against a real server booted on a test port
 *
 * Usage: node tests/availability_test.js
 */
const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const { build } = require('../data/timetableStore');

// Store-logic tests run against the pinned demo fixture so they exercise the
// normalizer/validator independently of whichever real timetable is loaded.
// The live dataset is covered by the HTTP tests below and by the Phase 3 suite.
const store = build(require('../data/fixtures/demo-timetable.json'));

const PORT = process.env.TEST_PORT || 3199;
const BASE = `http://localhost:${PORT}`;

let passed = 0;
function check(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}

// ---------------------------------------------------------------- store tests
function storeTests() {
    console.log('\n[1] Normalized timetable store (demo fixture)');

    const meta = store.getMeta();
    const faculty = store.getFaculty();

    check('loads 10 faculty timetables into one dataset', () => {
        assert.strictEqual(faculty.length, 10, 'expected 10 faculty in the roster');
        assert.strictEqual(meta.primaryClass, 'CSE-A');
    });

    check('materializes a record for every faculty x day x period', () => {
        const records = store.getRecords();
        const expected = faculty.length * meta.days.length * meta.periods.length;
        assert.strictEqual(records.length, expected, `expected ${expected} records, got ${records.length}`);
        records.forEach(r => {
            assert.ok(r.status === 'FREE' || r.status === 'BUSY', `bad status: ${r.status}`);
            assert.ok(typeof r.faculty === 'string' && r.faculty.length > 0);
            assert.ok(meta.days.includes(r.day));
            assert.ok(meta.periods.includes(r.period));
        });
    });

    check('BUSY records carry class/subject, FREE records are null', () => {
        const busy = store.getRecords().find(r => r.status === 'BUSY');
        assert.ok(busy.class && busy.subject, 'BUSY record must have class and subject');
        const free = store.getRecords().find(r => r.status === 'FREE');
        assert.strictEqual(free.class, null);
        assert.strictEqual(free.subject, null);
        assert.strictEqual(free.room, null);
    });

    check('Monday P2 availability matches the timetable', () => {
        const slot = store.getSlot('Monday', 2);
        const busyNames = slot.busy.map(r => r.faculty).sort();
        const freeNames = slot.free.map(r => r.faculty).sort();

        assert.deepStrictEqual(busyNames, ['Dr. Ravi', 'Prof. Arun', 'Prof. Priya'].sort());
        assert.deepStrictEqual(freeNames, [
            'Dr. Smith', 'Dr. Anitha', 'Prof. Kiran', 'Dr. Suresh',
            'Dr. Deepa', 'Prof. Naveen', 'Dr. Latha'
        ].sort());
        // Busy and free together must always cover the whole roster.
        assert.strictEqual(slot.busy.length + slot.free.length, faculty.length);
    });

    check('merged lab cells mark every period they span as BUSY', () => {
        // CSE-A Monday P5-P7 is Prof. Kiran's Android Programming Lab.
        [5, 6, 7].forEach(p => {
            const rec = store.getSlot('Monday', p).busy.find(r => r.faculty === 'Prof. Kiran');
            assert.ok(rec, `Prof. Kiran should be BUSY on Monday P${p}`);
            assert.strictEqual(rec.subject, 'Android Programming Lab');
            assert.strictEqual(rec.isMerged, true);
        });
    });

    check('no faculty is ever busy in two classes at the same slot', () => {
        meta.days.forEach(day => {
            meta.periods.forEach(period => {
                const names = store.getSlot(day, period).busy.map(r => r.faculty);
                assert.strictEqual(new Set(names).size, names.length, `double-booking at ${day} P${period}`);
            });
        });
    });

    check('excluding the clicked cell faculty removes them from results', () => {
        // Dr. Anitha is FREE on Monday P2.
        const withAnitha = store.getAvailableFaculty('Monday', 2).map(f => f.faculty);
        assert.ok(withAnitha.includes('Dr. Anitha'));
        const without = store.getAvailableFaculty('Monday', 2, 'Dr. Anitha').map(f => f.faculty);
        assert.ok(!without.includes('Dr. Anitha'));
        assert.strictEqual(without.length, withAnitha.length - 1);
    });

    check('day and period inputs are normalized', () => {
        assert.strictEqual(store.normalizeDay('monday'), 'Monday');
        assert.strictEqual(store.normalizeDay('MON'), 'Monday');
        assert.strictEqual(store.normalizeDay(' Tue '), 'Tuesday');
        assert.strictEqual(store.normalizeDay('Funday'), null);
        assert.strictEqual(store.normalizePeriod('2'), 2);
        assert.strictEqual(store.normalizePeriod('P3'), 3);
        assert.strictEqual(store.normalizePeriod(4), 4);
        assert.strictEqual(store.normalizePeriod(99), null);
        assert.strictEqual(store.normalizePeriod('lunch'), null);
    });

    check('queries return copies — the store cannot be mutated by callers', () => {
        const before = store.getAvailableFaculty('Monday', 2).length;
        const slot = store.getSlot('Monday', 2);
        slot.free.length = 0;
        slot.busy.push({ faculty: 'Injected' });
        const records = store.getRecords();
        records[0].status = 'TAMPERED';
        assert.strictEqual(store.getAvailableFaculty('Monday', 2).length, before);
        assert.notStrictEqual(store.getRecords()[0].status, 'TAMPERED');
    });

    check('the primary timetable grid is complete and carries cell metadata', () => {
        const tt = store.getPrimaryTimetable();
        assert.strictEqual(tt.class, 'CSE-A');
        assert.strictEqual(tt.cells.length, meta.days.length * meta.periods.length);
        const mondayP2 = tt.cells.find(c => c.day === 'Monday' && c.period === 2);
        assert.strictEqual(mondayP2.faculty, 'Dr. Ravi');
        assert.strictEqual(mondayP2.subject, 'Python Programming');
        assert.strictEqual(mondayP2.class, 'CSE-A');
        assert.strictEqual(mondayP2.room, 'Room 101');
        assert.strictEqual(mondayP2.startTime, '08:45');
    });

    check('rejects a source that double-books a faculty member', () => {
        assert.throws(() => build({
            meta: { primaryClass: 'A', days: ['Monday'], periods: [1] },
            faculty: [{ id: 'F1', name: 'Ravi' }],
            classes: [
                { class: 'A', rows: { Monday: [{ period: 1, subject: 'X', faculty: 'Ravi' }] } },
                { class: 'B', rows: { Monday: [{ period: 1, subject: 'Y', faculty: 'Ravi' }] } }
            ]
        }), /double-booking/i);
    });

    check('rejects a source referencing an unknown faculty name', () => {
        assert.throws(() => build({
            meta: { primaryClass: 'A', days: ['Monday'], periods: [1] },
            faculty: [{ id: 'F1', name: 'Ravi' }],
            classes: [{ class: 'A', rows: { Monday: [{ period: 1, subject: 'X', faculty: 'Ravii' }] } }]
        }), /not in the faculty roster/i);
    });

    check('rejects a period outside the declared range', () => {
        assert.throws(() => build({
            meta: { primaryClass: 'A', days: ['Monday'], periods: [1, 2] },
            faculty: [{ id: 'F1', name: 'Ravi' }],
            classes: [{ class: 'A', rows: { Monday: [{ period: 9, subject: 'X', faculty: 'Ravi' }] } }]
        }), /outside the declared periods/i);
    });
}

// ----------------------------------------------------------------- http tests
function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request(`${BASE}${path}`, {
            method,
            headers: payload
                ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
                : {}
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (e) { /* non-JSON body */ }
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

async function httpTests() {
    console.log('\n[2] Availability HTTP API');

    const meta = await request('GET', '/api/availability/meta');
    check('GET /api/availability/meta returns days, periods and faculty', () => {
        assert.strictEqual(meta.status, 200);
        assert.strictEqual(meta.body.primaryClass, 'DCME-V');
        assert.strictEqual(meta.body.faculty.length, 7);
        assert.deepStrictEqual(meta.body.periods, [1, 2, 3, 4, 5, 6, 7]);
    });

    const tt = await request('GET', '/api/availability/timetable');
    check('GET /api/availability/timetable returns the full primary grid', () => {
        assert.strictEqual(tt.status, 200);
        assert.strictEqual(tt.body.cells.length, 42);
        const cell = tt.body.cells.find(c => c.day === 'Monday' && c.period === 2);
        assert.strictEqual(cell.faculty, 'Ms. B.Kusuma');
        assert.strictEqual(cell.subject, 'PYTHON PROG');
    });

    const post = await request('POST', '/api/availability', { day: 'Monday', period: 2 });
    check('POST /api/availability returns the FREE faculty for the slot', () => {
        assert.strictEqual(post.status, 200);
        assert.strictEqual(post.body.day, 'Monday');
        assert.strictEqual(post.body.period, 2);
        assert.deepStrictEqual(post.body.availableFaculty.slice().sort(), [
            'Sri B.Gopala Rao', 'Ms.G.Sandhya Rani', 'Ms.Harathi',
            'Mrs.A.Sravanthi', 'Mrs.K.Anitha', 'Mr. Ch.Sai Kishore'
        ].sort());
        assert.deepStrictEqual(post.body.busy.map(b => b.faculty).sort(), ['Ms. B.Kusuma'].sort());
    });

    const clicked = await request('POST', '/api/availability', {
        day: 'Monday', period: 2, class: 'DCME-V', subject: 'PYTHON PROG', faculty: 'Ms. B.Kusuma'
    });
    check('a full clicked-cell payload works and never returns the cell owner', () => {
        assert.strictEqual(clicked.status, 200);
        assert.ok(!clicked.body.availableFaculty.includes('Ms. B.Kusuma'));
        assert.strictEqual(clicked.body.availableFaculty.length, 6);
    });

    const getForm = await request('GET', '/api/availability?day=mon&period=P2');
    check('GET form accepts abbreviated day and P-prefixed period', () => {
        assert.strictEqual(getForm.status, 200);
        assert.deepStrictEqual(getForm.body.availableFaculty.slice().sort(),
            post.body.availableFaculty.slice().sort());
    });

    const badDay = await request('POST', '/api/availability', { day: 'Funday', period: 2 });
    const badPeriod = await request('POST', '/api/availability', { day: 'Monday', period: 99 });
    const missing = await request('POST', '/api/availability', {});
    check('invalid day/period returns 400 with a helpful message', () => {
        assert.strictEqual(badDay.status, 400);
        assert.match(badDay.body.error, /Funday/);
        assert.strictEqual(badPeriod.status, 400);
        assert.match(badPeriod.body.error, /period/i);
        assert.strictEqual(missing.status, 400);
    });

    const unknown = await request('GET', '/api/availability/does-not-exist');
    check('unknown availability sub-paths return JSON 404, not the SPA page', () => {
        assert.strictEqual(unknown.status, 404);
        assert.ok(unknown.body && unknown.body.error);
    });

    // Every day + period must answer, and free + busy must always cover the roster.
    const slotResults = [];
    for (const day of meta.body.days) {
        for (const period of meta.body.periods) {
            const r = await request('POST', '/api/availability', { day, period });
            assert.strictEqual(r.status, 200, `${day} P${period} returned ${r.status}`);
            slotResults.push({ day, period, r });
        }
    }
    check('all 42 day+period slots resolve consistently', () => {
        assert.strictEqual(slotResults.length, 42);
        slotResults.forEach(({ day, period, r }) => {
            assert.strictEqual(r.body.availableFaculty.length + r.body.busy.length, 7,
                `${day} P${period}: free+busy must equal the 7-faculty roster`);
            const overlap = r.body.availableFaculty.filter(f => r.body.busy.some(b => b.faculty === f));
            assert.strictEqual(overlap.length, 0, `${day} P${period}: faculty listed as both FREE and BUSY`);
        });
    });

    // The API must not change anything: re-read state after all the calls above.
    const metaAfter = await request('GET', '/api/availability/meta');
    const ttAfter = await request('GET', '/api/availability/timetable');
    check('the API modified no timetable or faculty data', () => {
        assert.deepStrictEqual(metaAfter.body, meta.body);
        assert.deepStrictEqual(ttAfter.body, tt.body);
    });
}

// -------------------------------------------------------------------- runner
async function main() {
    console.log('TecSubstitution — Phase 1 availability tests');

    storeTests();

    const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverLog = '';
    server.stdout.on('data', d => serverLog += d);
    server.stderr.on('data', d => serverLog += d);

    try {
        await waitForServer();
        await httpTests();
    } catch (err) {
        console.error('\nServer output:\n' + serverLog);
        throw err;
    } finally {
        server.kill();
    }

    console.log(`\n🎉 All ${passed} Phase 1 checks passed.`);
}

main().catch(err => {
    console.error('\n✗ FAILED:', err.message);
    process.exit(1);
});
