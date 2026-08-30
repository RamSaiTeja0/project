/**
 * Phase 4 tests: multi-timetable availability engine.
 *
 * The engine is exercised directly (no Express, no browser) via
 * availabilityEngine.createView / timetableRegistry, then through the HTTP API.
 *
 * Usage: node tests/phase4_multi_timetable_test.js
 */
const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const { createView } = require('../data/availabilityEngine');
const registry = require('../data/timetableRegistry');
const fixture = require('../data/fixtures/multi-timetable.json');

const PORT = process.env.TEST_PORT || 3196;
const BASE = `http://localhost:${PORT}`;

let passed = 0;
function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

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
                try { parsed = JSON.parse(data); } catch (e) { /* html */ }
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
        const tick = n => request('GET', '/api/timetables')
            .then(resolve)
            .catch(err => { if (n <= 0) return reject(err); setTimeout(() => tick(n - 1), 250); });
        tick(attempts);
    });
}

/** Build a detached view over the fixture — no registry, no server. */
function fixtureView(extra = []) {
    const build = (source, opts) => registry.buildTimetable(source, opts);
    return createView([
        build(fixture.primary, { id: 'pri', name: 'PRI-A', isPrimary: true }),
        build(fixture.references[0], { id: 'ref-b', name: 'REF-B' }),
        build(fixture.references[1], { id: 'ref-c', name: 'REF-C' }),
        ...extra
    ]);
}

const namesOf = list => list.map(x => x.faculty || x).sort();

// ------------------------------------------------------ engine (no Express)
function engineTests() {
    console.log('\n[1] Availability engine — global across all timetables');

    const view = fixtureView();

    check('3 timetables load with exactly one primary', () => {
        const list = view.getTimetables();
        assert.strictEqual(list.length, 3);
        assert.strictEqual(list.filter(t => t.isPrimary).length, 1);
        assert.strictEqual(view.getPrimaryId(), 'pri');
    });

    check('faculty from every timetable merge into one canonical roster', () => {
        const roster = view.getFaculty();
        assert.strictEqual(roster.length, 7, 'primary 3 + ref-b 4 + ref-c 4, deduped by name');
        assert.deepStrictEqual(roster.map(f => f.name).sort(), [
            'Mr. Ch.Sai Kishore', 'Mrs.A.Sravanthi', 'Mrs.K.Anitha', 'Ms. B.Kusuma',
            'Ms.G.Sandhya Rani', 'Ms.Harathi', 'Sri B.Gopala Rao'
        ]);
        // Ms.Harathi is one identity, not one per timetable.
        assert.strictEqual(roster.filter(f => f.name === 'Ms.Harathi').length, 1);
    });

    // ---- case 1: busy in the PRIMARY timetable ----
    check('[1] faculty busy in the primary timetable is not available', () => {
        const free = namesOf(view.getAvailableFaculty('Monday', 1));
        assert.ok(!free.includes('Ms. B.Kusuma'), 'Kusuma teaches PRI-A Monday P1');
    });

    // ---- case 2: busy ONLY in a reference timetable ----
    check('[2] faculty busy only in a reference timetable is not available', () => {
        const slot = view.getSlot('Monday', 2);
        const sandhya = slot.busy.find(b => b.faculty === 'Ms.G.Sandhya Rani');
        assert.ok(sandhya, 'Sandhya Rani teaches REF-B Monday P2 and must be BUSY');
        assert.strictEqual(sandhya.timetableId, 'ref-b');
        // She appears nowhere in the primary timetable at that slot.
        const free = namesOf(view.getAvailableFaculty('Monday', 2));
        assert.ok(!free.includes('Ms.G.Sandhya Rani'));
    });

    // ---- case 3: busy in MULTIPLE timetables ----
    check('[3] faculty busy in two timetables is BUSY once, with both sources', () => {
        const conflicted = fixtureView([
            registry.buildTimetable({
                meta: { primaryClass: 'REF-D', days: ['Monday'], periods: [1, 2, 3, 4] },
                faculty: [{ id: 'F-SAN', name: 'Ms.G.Sandhya Rani' }],
                classes: [{ class: 'REF-D', rows: { Monday: [
                    { period: 2, subject: 'EXTRA', faculty: 'Ms.G.Sandhya Rani' }] } }]
            }, { id: 'ref-d', name: 'REF-D' })
        ]);
        const busy = conflicted.getSlot('Monday', 2).busy;
        const sandhya = busy.filter(b => b.faculty === 'Ms.G.Sandhya Rani');
        assert.strictEqual(sandhya.length, 1, 'one record per faculty, not one per timetable');
        assert.deepStrictEqual(sandhya[0].sources.map(s => s.timetableId).sort(), ['ref-b', 'ref-d']);
        const conflict = conflicted.getReport().warnings.find(w => w.code === 'CROSS_TIMETABLE_CONFLICT');
        assert.ok(conflict, 'a cross-timetable clash is reported as a warning');
        assert.match(conflict.message, /Ms\.G\.Sandhya Rani/);
    });

    // ---- case 4: free everywhere ----
    check('[4] faculty free in every timetable is available', () => {
        const free = namesOf(view.getAvailableFaculty('Monday', 2));
        assert.deepStrictEqual(free, [
            'Mr. Ch.Sai Kishore', 'Mrs.A.Sravanthi', 'Ms.Harathi', 'Sri B.Gopala Rao'
        ]);
    });

    // ---- case 5: several busy at the same period ----
    check('[5] three faculty busy at Monday P2 across three timetables', () => {
        const slot = view.getSlot('Monday', 2);
        assert.deepStrictEqual(namesOf(slot.busy),
            ['Mrs.K.Anitha', 'Ms. B.Kusuma', 'Ms.G.Sandhya Rani']);
        assert.deepStrictEqual(
            slot.busy.map(b => b.timetableId).sort(), ['pri', 'ref-b', 'ref-c']);
        assert.strictEqual(slot.busy.length + slot.free.length, 7);
    });

    // ---- case 6: merged labs ----
    check('[6] a merged lab marks its faculty busy on every period it spans', () => {
        [2, 3, 4].forEach(period => {
            const busy = namesOf(view.getSlot('Tuesday', period).busy);
            assert.ok(busy.includes('Ms.Harathi'), `Harathi must be BUSY Tuesday P${period}`);
        });
        const cells = view.getPrimaryTimetable().cells
            .filter(c => c.day === 'Tuesday' && c.period >= 2);
        assert.strictEqual(cells.length, 3);
        assert.strictEqual(new Set(cells.map(c => c.spanId)).size, 1);
        cells.forEach((c, i) => assert.strictEqual(c.period, i + 2, 'each period stays its own cell'));
    });

    // ---- case 7: different classes at the same period ----
    check('[7] different classes at the same period are all counted', () => {
        const slot = view.getSlot('Monday', 3);
        const classes = slot.busy.map(b => b.class).sort();
        assert.deepStrictEqual(classes, ['PRI-A', 'REF-B', 'REF-C']);
    });

    // ---- case 8: unresolved faculty ----
    check('[8] an unresolved cell marks nobody busy and is reported', () => {
        // PRI-A Monday P4 = TPC with no faculty mapping.
        const slot = view.getSlot('Monday', 4);
        const busy = namesOf(slot.busy);
        // Only REF-C's PROJECT (Sai Kishore) is busy — the unresolved TPC adds nobody.
        assert.deepStrictEqual(busy, ['Mr. Ch.Sai Kishore']);
        assert.strictEqual(slot.free.length, 6);
        const report = view.getReport();
        assert.ok(report.summary.unresolvedSubjects.includes('TPC'));
        assert.ok(report.warnings.some(w => w.code === 'UNRESOLVED_FACULTY'));
    });

    // ---- cases 9 & 10: invalid inputs ----
    check('[9][10] invalid day and invalid period resolve to null', () => {
        assert.strictEqual(view.normalizeDay('Funday'), null);
        assert.strictEqual(view.normalizeDay('Sunday'), null, 'not in this timetable');
        assert.strictEqual(view.normalizePeriod(9), null);
        assert.strictEqual(view.normalizePeriod('lunch'), null);
        assert.strictEqual(view.getSlot('Funday', 1), null);
        assert.strictEqual(view.getAvailableFaculty('Monday', 99), null);
        // Valid forms still normalize.
        assert.strictEqual(view.normalizeDay('mon'), 'Monday');
        assert.strictEqual(view.normalizePeriod('P3'), 3);
    });

    // ---- case 11: empty timetable ----
    check('[11] an empty timetable is rejected and the engine needs at least one', () => {
        assert.throws(() => registry.buildTimetable({
            meta: { primaryClass: 'X', days: ['Monday'], periods: [1] },
            faculty: [{ id: 'F1', name: 'A' }],
            classes: []
        }), /no cells/i);
        assert.throws(() => createView([]), /at least one timetable/i);
    });

    // ---- case 12: no mutation ----
    check('[12] querying does not mutate engine state', () => {
        const before = JSON.stringify(view.getSlot('Monday', 2));
        const slot = view.getSlot('Monday', 2);
        slot.busy.length = 0;
        slot.free.push({ faculty: 'Injected' });
        view.getAvailableFaculty('Monday', 2);
        view.getRecords()[0].status = 'TAMPERED';
        assert.strictEqual(JSON.stringify(view.getSlot('Monday', 2)), before);
        assert.notStrictEqual(view.getRecords()[0].status, 'TAMPERED');
    });

    // ---- case 13: the primary faculty is never wrongly offered ----
    check('[13] the faculty teaching the clicked primary slot is never available', () => {
        view.getDays().forEach(day => {
            view.getPeriods().forEach(period => {
                const cell = view.getPrimaryTimetable().cells
                    .find(c => c.day === day && c.period === period);
                if (!cell || !cell.faculty) return;
                const free = namesOf(view.getAvailableFaculty(day, period));
                assert.ok(!free.includes(cell.faculty),
                    `${day} P${period}: ${cell.faculty} teaches here and must not be listed free`);
            });
        });
    });

    // ---- case 14: duplicate loading ----
    check('[14] loading the same timetable twice does not duplicate availability', () => {
        const doubled = createView([
            registry.buildTimetable(fixture.primary, { id: 'pri', name: 'PRI-A', isPrimary: true }),
            registry.buildTimetable(fixture.references[0], { id: 'ref-b', name: 'REF-B' }),
            registry.buildTimetable(fixture.references[0], { id: 'ref-b-copy', name: 'REF-B copy' })
        ]);
        assert.strictEqual(doubled.getFaculty().length, 6, 'roster stays deduped by name');
        const busy = doubled.getSlot('Monday', 2).busy;
        assert.strictEqual(busy.filter(b => b.faculty === 'Ms.G.Sandhya Rani').length, 1);
        assert.strictEqual(busy.length + doubled.getSlot('Monday', 2).free.length, 6);
    });

    // ---- case 15: every timetable considered ----
    check('[15] removing a reference timetable changes the result', () => {
        const withoutRefC = createView([
            registry.buildTimetable(fixture.primary, { id: 'pri', isPrimary: true }),
            registry.buildTimetable(fixture.references[0], { id: 'ref-b' })
        ]);
        // Mrs.K.Anitha is busy Monday P2 only via REF-C.
        assert.ok(!namesOf(view.getAvailableFaculty('Monday', 2)).includes('Mrs.K.Anitha'));
        assert.ok(namesOf(withoutRefC.getAvailableFaculty('Monday', 2)).includes('Mrs.K.Anitha'),
            'without REF-C she is free again — so REF-C was genuinely being consulted');
    });

    check('THE RULE: teaching anywhere at a slot excludes you from that slot', () => {
        view.getDays().forEach(day => {
            view.getPeriods().forEach(period => {
                const free = new Set(namesOf(view.getAvailableFaculty(day, period)));
                view.getCells()
                    .filter(c => c.day === day && c.period === period && c.faculty)
                    .forEach(c => {
                        assert.ok(!free.has(c.faculty),
                            `${c.faculty} teaches ${c.subject} in ${c.timetableName} at ${day} P${period} but was listed FREE`);
                    });
            });
        });
    });
}

// ------------------------------------------------------------- registry
function registryTests() {
    console.log('\n[2] Registry');

    registry.reset(fixture.primary, { id: 'pri', name: 'PRI-A' });
    check('reset leaves exactly one primary timetable', () => {
        assert.strictEqual(registry.view.getTimetables().length, 1);
        assert.strictEqual(registry.view.getPrimaryId(), 'pri');
    });

    registry.register(fixture.references[0], { id: 'ref-b', name: 'REF-B' });
    registry.register(fixture.references[1], { id: 'ref-c', name: 'REF-C' });
    check('references register without stealing primary status', () => {
        const list = registry.view.getTimetables();
        assert.strictEqual(list.length, 3);
        assert.strictEqual(list.filter(t => t.isPrimary).length, 1);
        assert.strictEqual(registry.view.getPrimaryId(), 'pri');
    });

    check('re-registering the same id replaces rather than duplicates', () => {
        registry.register(fixture.references[0], { id: 'ref-b', name: 'REF-B again' });
        assert.strictEqual(registry.view.getTimetables().length, 3);
        assert.strictEqual(registry.view.getFaculty().length, 7);
    });

    check('setPrimary moves the flag and never leaves two primaries', () => {
        assert.strictEqual(registry.setPrimary('ref-c'), true);
        const list = registry.view.getTimetables();
        assert.strictEqual(list.filter(t => t.isPrimary).length, 1);
        assert.strictEqual(registry.view.getPrimaryId(), 'ref-c');
        assert.strictEqual(registry.view.getPrimaryTimetable().class, 'REF-C');
        registry.setPrimary('pri');
    });

    check('setPrimary on an unknown id is rejected', () => {
        assert.strictEqual(registry.setPrimary('nope'), false);
        assert.strictEqual(registry.view.getPrimaryId(), 'pri');
    });

    check('a timetable can be removed, but never the last one', () => {
        assert.strictEqual(registry.unregister('ref-c'), true);
        assert.strictEqual(registry.view.getTimetables().length, 2);
        assert.strictEqual(registry.unregister('nope'), false);
        registry.unregister('ref-b');
        assert.throws(() => registry.unregister('pri'), /last timetable/i);
    });

    check('an invalid timetable never enters the registry', () => {
        const before = registry.view.getTimetables().length;
        assert.throws(() => registry.register({
            meta: { primaryClass: 'BAD', days: ['Monday'], periods: [1] },
            faculty: [{ id: 'F1', name: 'A' }],
            classes: [{ class: 'BAD', rows: { Monday: [{ period: 1, subject: 'X', faculty: 'Ghost' }] } }]
        }, { id: 'bad' }), /not in the faculty roster/i);
        assert.strictEqual(registry.view.getTimetables().length, before);
    });

    // Restore the real dataset for the HTTP phase.
    registry.loadFromDisk();
    check('loadFromDisk restores the real DCME primary timetable', () => {
        assert.strictEqual(registry.view.getPrimaryTimetable().class, 'DCME-V');
        assert.strictEqual(registry.view.getPrimaryTimetable().cells.length, 42);
    });
}

// ----------------------------------------------------------------- HTTP
async function apiTests() {
    console.log('\n[3] Timetable + availability API');

    const list = await request('GET', '/api/timetables');
    check('GET /api/timetables lists the loaded set', () => {
        assert.strictEqual(list.status, 200);
        assert.strictEqual(list.body.count, 1);
        assert.strictEqual(list.body.primaryId, 'dcme-v');
        assert.strictEqual(list.body.timetables[0].isPrimary, true);
    });

    const one = await request('GET', '/api/timetables/dcme-v');
    check('GET /api/timetables/:id returns one timetable with its cells', () => {
        assert.strictEqual(one.status, 200);
        assert.strictEqual(one.body.cells.length, 42);
        assert.strictEqual(one.body.meta.primaryClass, 'DCME-V');
    });

    const missing = await request('GET', '/api/timetables/nope');
    check('an unknown id returns 404 JSON', () => {
        assert.strictEqual(missing.status, 404);
        assert.strictEqual(missing.body.code, 'NOT_FOUND');
    });

    // Baseline before adding a reference timetable.
    const before = await request('POST', '/api/availability', { day: 'Monday', period: 3 });
    check('baseline: Monday P3 with one timetable', () => {
        assert.strictEqual(before.body.timetablesChecked, 1);
        assert.ok(before.body.availableFaculty.includes('Ms.Harathi'),
            'Harathi is free at Monday P3 in the primary timetable alone');
    });

    // Register a reference timetable that makes Ms.Harathi busy at Monday P3.
    const reference = {
        meta: {
            primaryClass: 'DCME-IV', branch: 'DCME', semester: 'C23 — IV SEM',
            days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            periods: [1, 2, 3, 4, 5, 6, 7]
        },
        faculty: [{ id: 'FAC003', name: 'Ms.Harathi' }],
        subjectFaculty: { 'ANDROID PROG': 'Ms.Harathi' },
        classes: [{ class: 'DCME-IV', rows: { Monday: [{ period: 3, subject: 'ANDROID PROG' }] } }]
    };

    const registered = await request('POST', '/api/timetables',
        { source: reference, id: 'dcme-iv', name: 'DCME-IV' });
    check('POST /api/timetables registers a reference timetable', () => {
        assert.strictEqual(registered.status, 200);
        assert.strictEqual(registered.body.count, 2);
        assert.strictEqual(registered.body.primaryId, 'dcme-v', 'primary is unchanged');
        assert.strictEqual(registered.body.timetable.isPrimary, false);
    });

    const after = await request('POST', '/api/availability', { day: 'Monday', period: 3 });
    check('THE RULE over HTTP: Ms.Harathi is now BUSY via the reference timetable', () => {
        assert.strictEqual(after.body.timetablesChecked, 2);
        assert.ok(!after.body.availableFaculty.includes('Ms.Harathi'),
            'she teaches DCME-IV Monday P3, so she must not be offered');
        const busy = after.body.busy.find(b => b.faculty === 'Ms.Harathi');
        assert.ok(busy, 'she must appear as busy');
        assert.strictEqual(busy.timetableId, 'dcme-iv');
        assert.strictEqual(busy.subject, 'ANDROID PROG');
        // She was free here a moment ago with only the primary loaded.
        assert.strictEqual(before.body.availableFaculty.length - after.body.availableFaculty.length, 1);
    });

    check('the primary faculty is still excluded at that slot', () => {
        // Monday P3 in DCME-V is ANDROID PROG / Ms.Harathi — same person, both reasons.
        assert.ok(!after.body.availableFaculty.includes('Ms.Harathi'));
    });

    const primarySwap = await request('POST', '/api/timetables/primary', { id: 'dcme-iv' });
    check('POST /api/timetables/primary switches the displayed timetable', () => {
        assert.strictEqual(primarySwap.status, 200);
        assert.strictEqual(primarySwap.body.primaryId, 'dcme-iv');
    });

    const grid = await request('GET', '/api/availability/timetable');
    check('the grid now serves the new primary, references still counted', () => {
        assert.strictEqual(grid.body.class, 'DCME-IV');
        assert.strictEqual(grid.body.timetableCount, 2);
        assert.strictEqual(grid.body.referenceTimetables[0].id, 'dcme-v');
    });

    await request('POST', '/api/timetables/primary', { id: 'dcme-v' });

    const badPrimary = await request('POST', '/api/timetables/primary', { id: 'ghost' });
    check('setting an unknown primary is rejected', () => {
        assert.strictEqual(badPrimary.status, 404);
    });

    const badRegister = await request('POST', '/api/timetables', {
        source: {
            meta: { primaryClass: 'BAD', days: ['Monday'], periods: [1] },
            faculty: [{ id: 'F1', name: 'A' }],
            classes: [{ class: 'BAD', rows: { Monday: [{ period: 1, subject: 'X', faculty: 'Ghost' }] } }]
        }, id: 'bad'
    });
    check('an invalid timetable is rejected with 422 and does not register', () => {
        assert.strictEqual(badRegister.status, 422);
        assert.match(badRegister.body.error, /not in the faculty roster/i);
    });

    const stillTwo = await request('GET', '/api/timetables');
    check('the loaded set is unchanged after a failed registration', () => {
        assert.strictEqual(stillTwo.body.count, 2);
    });

    return after;
}

async function readOnlyTests() {
    console.log('\n[4] Availability stays read-only');

    const before = await request('GET', '/api/timetables');
    const gridBefore = await request('GET', '/api/availability/timetable');

    const meta = await request('GET', '/api/availability/meta');
    for (const day of meta.body.days) {
        for (const period of meta.body.periods) {
            await request('POST', '/api/availability', { day, period });
            await request('GET', `/api/availability/slot/${day}/${period}`);
        }
    }

    const after = await request('GET', '/api/timetables');
    const gridAfter = await request('GET', '/api/availability/timetable');

    check('84 availability calls changed no timetable data', () => {
        assert.deepStrictEqual(after.body, before.body);
        assert.deepStrictEqual(gridAfter.body, gridBefore.body);
    });

    const del = await request('DELETE', '/api/timetables/dcme-iv');
    check('DELETE removes a reference timetable and restores the baseline', () => {
        assert.strictEqual(del.status, 200);
        assert.strictEqual(del.body.count, 1);
    });

    const lastOne = await request('DELETE', '/api/timetables/dcme-v');
    check('the last timetable cannot be deleted', () => {
        assert.strictEqual(lastOne.status, 409);
        assert.strictEqual(lastOne.body.code, 'LAST_TIMETABLE');
    });
}

async function main() {
    console.log('TecSubstitution — Phase 4 multi-timetable engine tests');

    engineTests();
    registryTests();

    const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverLog = '';
    server.stdout.on('data', d => serverLog += d);
    server.stderr.on('data', d => serverLog += d);

    try {
        await waitForServer();
        await apiTests();
        await readOnlyTests();
    } catch (err) {
        console.error('\nServer output:\n' + serverLog);
        throw err;
    } finally {
        server.kill();
    }

    console.log(`\n🎉 All ${passed} Phase 4 checks passed.`);
}

main().catch(err => {
    console.error('\n✗ FAILED:', err.message);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    process.exit(1);
});
