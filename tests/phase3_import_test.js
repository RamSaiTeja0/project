/**
 * Phase 3 tests: real DCME timetable + import/normalize/validate pipeline.
 *
 * Layers under test:
 *   importer (csv/excel/image) -> normalizer -> validator -> store -> API
 *
 * Usage: node tests/phase3_import_test.js
 */
const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const ExcelJS = require('exceljs');

const { build } = require('../data/timetableStore');
const { normalize } = require('../data/normalizer');
const { validate } = require('../data/validator');
const importer = require('../data/import');
const realSource = require('../data/timetable-source.json');

const PORT = process.env.TEST_PORT || 3197;
const BASE = `http://localhost:${PORT}`;

let passed = 0;
function check(name, fn) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
}
async function checkAsync(name, fn) {
    await fn();
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
                try { parsed = JSON.parse(data); } catch (e) { /* html */ }
                resolve({ status: res.statusCode, body: parsed, raw: data });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

/** Minimal multipart upload so the import routes are exercised as the UI uses them. */
function uploadFile(urlPath, filename, buffer) {
    return new Promise((resolve, reject) => {
        const boundary = '----phase3boundary' + Date.now();
        const head = Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="timetable"; filename="${filename}"\r\n` +
            `Content-Type: application/octet-stream\r\n\r\n`);
        const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
        const payload = Buffer.concat([head, buffer, tail]);

        const req = http.request(`${BASE}${urlPath}`, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': payload.length
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (e) { /* non-json */ }
                resolve({ status: res.statusCode, body: parsed, raw: data });
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function waitForServer(attempts = 40) {
    return new Promise((resolve, reject) => {
        const tick = n => request('GET', '/api/availability/meta')
            .then(resolve)
            .catch(err => {
                if (n <= 0) return reject(err);
                setTimeout(() => tick(n - 1), 250);
            });
        tick(attempts);
    });
}

const store = build(realSource);
const cellAt = (day, period) =>
    store.getPrimaryTimetable().cells.find(c => c.day === day && c.period === period);

// ------------------------------------------------- [1] real timetable content
function realDataTests() {
    console.log('\n[1] Real DCME C23 V-SEM timetable');

    const meta = store.getMeta();

    check('institution metadata is preserved', () => {
        assert.strictEqual(meta.institution, 'Aditya Institute of Technology and Management');
        assert.strictEqual(meta.branch, 'DCME');
        assert.strictEqual(meta.semester, 'C23 — V SEM');
        assert.strictEqual(meta.shift, 'II SHIFT POLYTECHNIC (284)');
        assert.strictEqual(meta.academicYear, '2026-27');
        assert.strictEqual(meta.effectiveFrom, '08-06-2026');
        assert.strictEqual(meta.primaryClass, 'DCME-V');
    });

    check('7 faculty, 6 days, 7 periods, 42 coordinates', () => {
        assert.strictEqual(meta.facultyCount, 7);
        assert.strictEqual(meta.days.length, 6);
        assert.strictEqual(meta.periods.length, 7);
        assert.strictEqual(store.getPrimaryTimetable().cells.length, 42);
        assert.strictEqual(store.getRecords().length, 7 * 6 * 7);
    });

    check('period times are preserved, including the P3->P4 gap', () => {
        const t = meta.periodTimings;
        assert.deepStrictEqual(t['1'], { start: '8:00', end: '8:45' });
        assert.deepStrictEqual(t['2'], { start: '8:45', end: '9:30' });
        assert.deepStrictEqual(t['3'], { start: '9:30', end: '10:15' });
        assert.deepStrictEqual(t['4'], { start: '10:30', end: '11:15' });
        assert.deepStrictEqual(t['7'], { start: '12:45', end: '1:30' });
        // P3 ends 10:15 but P4 starts 10:30 — the break must survive.
        assert.notStrictEqual(t['3'].end, t['4'].start);
        assert.strictEqual(meta.breaks[0].afterPeriod, 3);
    });

    // ---- the specific assertions Phase 3 requires ----
    const expectations = [
        ['Monday',    1, 'PYTHON PROG',           'Ms. B.Kusuma'],
        ['Monday',    2, 'PYTHON PROG',           'Ms. B.Kusuma'],
        ['Monday',    3, 'IM & EP',               'Sri B.Gopala Rao'],
        ['Monday',    4, 'BD & CC',               'Ms.G.Sandhya Rani'],
        ['Monday',    5, 'ANDROID PROG LAB',      'Ms.Harathi'],
        ['Tuesday',   5, 'ANDROID PROG',          'Ms.Harathi'],
        ['Tuesday',   7, 'PROJECT',               'Mr. Ch.Sai Kishore'],
        ['Wednesday', 6, 'LIFE SKILLS LAB',       'Mrs.K.Anitha'],
        ['Thursday',  7, 'LIBRARY / COUNSELLING', null],
        ['Friday',    6, 'TPC',                   null],
        ['Saturday',  5, 'PYTHON PROG LAB',       'Ms. B.Kusuma'],
        ['Saturday',  7, 'PYTHON PROG LAB',       'Ms. B.Kusuma']
    ];

    expectations.forEach(([day, period, subject, faculty]) => {
        check(`${day} P${period} = ${subject} / ${faculty || 'unresolved'}`, () => {
            const cell = cellAt(day, period);
            assert.ok(cell, `no cell at ${day} P${period}`);
            assert.strictEqual(cell.subject, subject);
            assert.strictEqual(cell.faculty, faculty);
            if (faculty === null) {
                assert.strictEqual(cell.facultyResolution, 'unresolved');
            }
        });
    });

    check('Android Programming and its Lab both map to Ms.Harathi', () => {
        const androidCells = store.getCells()
            .filter(c => c.subject === 'ANDROID PROG' || c.subject === 'ANDROID PROG LAB');
        assert.ok(androidCells.length > 0);
        androidCells.forEach(c => assert.strictEqual(c.faculty, 'Ms.Harathi',
            `${c.day} P${c.period} (${c.subject}) should be Ms.Harathi`));
    });

    check('no faculty name was invented for TPC or LIBRARY / COUNSELLING', () => {
        const names = store.getFaculty().map(f => f.name);
        assert.strictEqual(names.length, 7);
        const unresolved = store.getCells().filter(c => c.facultyResolution === 'unresolved');
        assert.deepStrictEqual([...new Set(unresolved.map(c => c.subject))].sort(),
            ['LIBRARY / COUNSELLING', 'TPC']);
        // Unresolved cells must not make anyone BUSY.
        unresolved.forEach(c => {
            assert.strictEqual(store.getSlot(c.day, c.period).busy.length, 0,
                `${c.day} P${c.period} is unresolved so nobody may be marked BUSY`);
        });
    });

    check('the load report warns about both unresolved subjects', () => {
        const report = store.getReport();
        assert.strictEqual(report.ok, true);
        assert.strictEqual(report.errors.length, 0);
        assert.strictEqual(report.summary.unresolvedCells, 2);
        assert.deepStrictEqual(report.summary.unresolvedSubjects.slice().sort(),
            ['LIBRARY / COUNSELLING', 'TPC']);
        report.warnings
            .filter(w => w.code === 'UNRESOLVED_FACULTY')
            .forEach(w => assert.match(w.message, /Faculty mapping unresolved/));
    });
}

// ------------------------------------------------------- [2] merged lab spans
function mergedLabTests() {
    console.log('\n[2] Merged lab spans');

    const labs = [
        ['Monday', 'ANDROID PROG LAB', 'Ms.Harathi'],
        ['Wednesday', 'LIFE SKILLS LAB', 'Mrs.K.Anitha'],
        ['Saturday', 'PYTHON PROG LAB', 'Ms. B.Kusuma']
    ];

    labs.forEach(([day, subject, faculty]) => {
        check(`${day} P5-P7 ${subject}: 3 separate clickable coordinates sharing a spanId`, () => {
            const cells = [5, 6, 7].map(p => cellAt(day, p));
            cells.forEach((cell, i) => {
                assert.ok(cell, `${day} P${i + 5} missing`);
                assert.strictEqual(cell.subject, subject);
                assert.strictEqual(cell.faculty, faculty);
                assert.strictEqual(cell.isMerged, true);
                assert.deepStrictEqual(cell.span, { from: 5, to: 7 });
                assert.strictEqual(cell.period, i + 5, 'each cell keeps its own period');
            });
            const spanIds = new Set(cells.map(c => c.spanId));
            assert.strictEqual(spanIds.size, 1, 'the three cells share one spanId');
            assert.ok([...spanIds][0].includes('P5-P7'));
            // The lab was not collapsed into a single clickable cell.
            assert.strictEqual(cells.length, 3);
        });
    });

    check('merged labs mark the faculty BUSY on every period they span', () => {
        [5, 6, 7].forEach(p => {
            const busy = store.getSlot('Monday', p).busy.map(r => r.faculty);
            assert.ok(busy.includes('Ms.Harathi'), `Ms.Harathi must be BUSY Monday P${p}`);
        });
    });
}

// --------------------------------------------------------- [3] validation
function validationTests() {
    console.log('\n[3] Validation');

    check('duplicate day+period coordinate is rejected', () => {
        assert.throws(() => build({
            meta: { primaryClass: 'A', days: ['Monday'], periods: [1] },
            faculty: [{ id: 'F1', name: 'Ravi' }],
            classes: [{ class: 'A', rows: { Monday: [
                { period: 1, subject: 'X', faculty: 'Ravi' },
                { period: 1, subject: 'Y', faculty: 'Ravi' }
            ] } }]
        }), /Duplicate timetable entry/i);
    });

    check('a merged span overlapping a later cell is rejected as duplicate', () => {
        assert.throws(() => build({
            meta: { primaryClass: 'A', days: ['Monday'], periods: [1, 2, 3] },
            faculty: [{ id: 'F1', name: 'Ravi' }],
            classes: [{ class: 'A', rows: { Monday: [
                { period: 1, spanTo: 3, subject: 'LAB', faculty: 'Ravi' },
                { period: 2, subject: 'X', faculty: 'Ravi' }
            ] } }]
        }), /Duplicate timetable entry/i);
    });

    check('unknown faculty name is rejected, never silently accepted', () => {
        assert.throws(() => build({
            meta: { primaryClass: 'A', days: ['Monday'], periods: [1] },
            faculty: [{ id: 'F1', name: 'Ravi' }],
            classes: [{ class: 'A', rows: { Monday: [{ period: 1, subject: 'X', faculty: 'Ravii' }] } }]
        }), /not in the faculty roster/i);
    });

    check('a subject map pointing at an unknown faculty is rejected', () => {
        assert.throws(() => build({
            meta: { primaryClass: 'A', days: ['Monday'], periods: [1] },
            faculty: [{ id: 'F1', name: 'Ravi' }],
            subjectFaculty: { X: 'Ghost' },
            classes: [{ class: 'A', rows: { Monday: [{ period: 1, subject: 'X' }] } }]
        }), /not in the faculty roster/i);
    });

    check('double-booking across classes is rejected', () => {
        assert.throws(() => build({
            meta: { primaryClass: 'A', days: ['Monday'], periods: [1] },
            faculty: [{ id: 'F1', name: 'Ravi' }],
            classes: [
                { class: 'A', rows: { Monday: [{ period: 1, subject: 'X', faculty: 'Ravi' }] } },
                { class: 'B', rows: { Monday: [{ period: 1, subject: 'Y', faculty: 'Ravi' }] } }
            ]
        }), /double-booking/i);
    });

    check('missing subject is rejected, not silently turned into FREE', () => {
        assert.throws(() => build({
            meta: { primaryClass: 'A', days: ['Monday'], periods: [1] },
            faculty: [{ id: 'F1', name: 'Ravi' }],
            classes: [{ class: 'A', rows: { Monday: [{ period: 1, faculty: 'Ravi' }] } }]
        }), /has no subject/i);
    });

    check('invalid day, invalid period and empty timetable are rejected', () => {
        assert.throws(() => build({
            meta: { primaryClass: 'A', days: ['Monday'], periods: [1] },
            faculty: [{ id: 'F1', name: 'Ravi' }],
            classes: [{ class: 'A', rows: { Funday: [{ period: 1, subject: 'X', faculty: 'Ravi' }] } }]
        }), /unknown day/i);

        assert.throws(() => build({
            meta: { primaryClass: 'A', days: ['Monday'], periods: [1, 2] },
            faculty: [{ id: 'F1', name: 'Ravi' }],
            classes: [{ class: 'A', rows: { Monday: [{ period: 9, subject: 'X', faculty: 'Ravi' }] } }]
        }), /outside the declared periods/i);

        assert.throws(() => build({
            meta: { primaryClass: 'A', days: ['Monday'], periods: [1] },
            faculty: [{ id: 'F1', name: 'Ravi' }],
            classes: []
        }), /no cells/i);
    });

    check('missing periods are reported as a warning, not invented', () => {
        const report = validate(normalize({
            meta: { primaryClass: 'A', days: ['Monday'], periods: [1, 2, 3] },
            faculty: [{ id: 'F1', name: 'Ravi' }],
            classes: [{ class: 'A', rows: { Monday: [{ period: 1, subject: 'X', faculty: 'Ravi' }] } }]
        }));
        assert.strictEqual(report.ok, true);
        const missing = report.warnings.find(w => w.code === 'MISSING_PERIODS');
        assert.ok(missing, 'expected a MISSING_PERIODS warning');
        assert.deepStrictEqual(missing.context.missing, ['Monday P2', 'Monday P3']);
    });
}

// ------------------------------------------------------------- [4] importers
const CSV_FIXTURE =
    'Day,Period,Subject,Faculty,Class,Room,SpanTo\n' +
    'Monday,1,PYTHON PROG,Ms. B.Kusuma,DCME-V,,\n' +
    'Monday,2,PYTHON PROG,Ms. B.Kusuma,DCME-V,,\n' +
    'Monday,3,IM & EP,Sri B.Gopala Rao,DCME-V,,\n' +
    'Monday,4,BD & CC,Ms.G.Sandhya Rani,DCME-V,,\n' +
    'Monday,5,ANDROID PROG LAB,Ms.Harathi,DCME-V,,7\n' +
    'Tuesday,1,TPC,,DCME-V,,\n';

async function csvImportTests() {
    console.log('\n[4] CSV import');

    await checkAsync('CSV parses into the normalized structure', async () => {
        const result = await importer.preview(Buffer.from(CSV_FIXTURE), 'timetable.csv');
        assert.strictEqual(result.format, 'csv');
        assert.strictEqual(result.report.ok, true);
        // P5 spans to P7 -> 5 single cells + 3 lab cells = 8 coordinates.
        assert.strictEqual(result.report.summary.cells, 8);
        assert.strictEqual(result.meta.primaryClass, 'DCME-V');
    });

    await checkAsync('CSV preserves the merged lab as 3 coordinates with one spanId', async () => {
        const result = await importer.preview(Buffer.from(CSV_FIXTURE), 'timetable.csv');
        const monday = result.preview.find(d => d.day === 'Monday');
        [5, 6, 7].forEach(p => {
            const slot = monday.periods.find(s => s.period === p);
            assert.strictEqual(slot.subject, 'ANDROID PROG LAB');
            assert.strictEqual(slot.faculty, 'Ms.Harathi');
        });
        const spanIds = new Set([5, 6, 7].map(p => monday.periods.find(s => s.period === p).spanId));
        assert.strictEqual(spanIds.size, 1);
    });

    await checkAsync('a blank Faculty column becomes an explicit unresolved warning', async () => {
        const result = await importer.preview(Buffer.from(CSV_FIXTURE), 'timetable.csv');
        const tuesday = result.preview.find(d => d.day === 'Tuesday');
        const tpc = tuesday.periods.find(s => s.period === 1);
        assert.strictEqual(tpc.subject, 'TPC');
        assert.strictEqual(tpc.faculty, null);
        assert.strictEqual(tpc.unresolved, true);
        assert.strictEqual(tpc.facultyLabel, 'Faculty unresolved');
        assert.ok(result.report.warnings.some(w => w.code === 'UNRESOLVED_FACULTY'));
        // The roster must not have gained a phantom entry for the blank cell.
        assert.ok(!result.faculty.some(f => !f.name || f.name.trim() === ''));
    });

    await checkAsync('quoted fields with commas parse correctly', async () => {
        const csv = 'Day,Period,Subject,Faculty,Class\n' +
                    'Monday,1,"BD & CC, Unit 2","Ms.G.Sandhya Rani",DCME-V\n';
        const result = await importer.preview(Buffer.from(csv), 'q.csv');
        assert.strictEqual(result.report.ok, true);
        const slot = result.preview.find(d => d.day === 'Monday').periods.find(s => s.period === 1);
        assert.strictEqual(slot.subject, 'BD & CC, Unit 2');
        assert.strictEqual(slot.faculty, 'Ms.G.Sandhya Rani');
    });

    await checkAsync('a CSV with a bad header is rejected', async () => {
        await assert.rejects(
            () => importer.preview(Buffer.from('Foo,Bar\n1,2\n'), 'bad.csv'),
            /CSV header must include/);
    });

    await checkAsync('an empty CSV is rejected', async () => {
        await assert.rejects(() => importer.preview(Buffer.from(''), 'empty.csv'), /empty/i);
    });

    await checkAsync('an unsupported file type is rejected', async () => {
        await assert.rejects(
            () => importer.preview(Buffer.from('x'), 'notes.txt'),
            /Unsupported file type/);
    });
}

async function buildExcelFixture() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Timetable');
    sheet.addRow(['Day', 'Period', 'Subject', 'Faculty', 'Class', 'Room', 'SpanTo']);
    sheet.addRow(['Tuesday', 1, 'BD & CC', 'Ms.G.Sandhya Rani', 'DCME-V', '', '']);
    sheet.addRow(['Tuesday', 2, 'IOT', 'Mrs.A.Sravanthi', 'DCME-V', '', '']);
    sheet.addRow(['Tuesday', 5, 'PYTHON PROG LAB', 'Ms. B.Kusuma', 'DCME-V', '', 7]);
    sheet.addRow(['Tuesday', 3, 'TPC', '', 'DCME-V', '', '']);
    return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function excelImportTests() {
    console.log('\n[5] Excel import');

    const buffer = await buildExcelFixture();

    await checkAsync('.xlsx parses into the same normalized structure as CSV', async () => {
        const result = await importer.preview(buffer, 'timetable.xlsx');
        assert.strictEqual(result.format, 'excel');
        assert.strictEqual(result.report.ok, true);
        // 3 single cells + a 3-period lab = 6 coordinates.
        assert.strictEqual(result.report.summary.cells, 6);
        const tuesday = result.preview.find(d => d.day === 'Tuesday');
        assert.strictEqual(tuesday.periods.find(s => s.period === 1).subject, 'BD & CC');
        assert.strictEqual(tuesday.periods.find(s => s.period === 2).faculty, 'Mrs.A.Sravanthi');
    });

    await checkAsync('Excel preserves merged labs and unresolved faculty identically', async () => {
        const result = await importer.preview(buffer, 'timetable.xlsx');
        const tuesday = result.preview.find(d => d.day === 'Tuesday');
        [5, 6, 7].forEach(p => {
            assert.strictEqual(tuesday.periods.find(s => s.period === p).subject, 'PYTHON PROG LAB');
        });
        const tpc = tuesday.periods.find(s => s.period === 3);
        assert.strictEqual(tpc.subject, 'TPC');
        assert.strictEqual(tpc.unresolved, true);
    });

    await checkAsync('a non-Excel file sent as .xlsx is rejected clearly', async () => {
        await assert.rejects(
            () => importer.preview(Buffer.from('this is not a workbook'), 'fake.xlsx'),
            /Only \.xlsx is supported|Could not read the Excel file/);
    });
}

async function imageImportTests() {
    console.log('\n[6] Image import adapter');

    await checkAsync('image import reports NOT_IMPLEMENTED instead of faking a result', async () => {
        await assert.rejects(
            () => importer.preview(Buffer.from('fake png'), 'timetable.png'),
            err => {
                assert.strictEqual(err.code, 'IMAGE_EXTRACTION_NOT_IMPLEMENTED');
                assert.match(err.message, /not implemented/i);
                return true;
            });
        assert.strictEqual(importer.imageImporter.hasExtractionBackend(), false);
    });

    await checkAsync('a registered backend flows through the same pipeline', async () => {
        importer.imageImporter.setExtractionBackend({
            async extract() {
                return {
                    source: {
                        meta: { primaryClass: 'IMG', days: ['Monday'], periods: [1] },
                        faculty: [{ id: 'F1', name: 'Ms.Harathi' }],
                        classes: [{ class: 'IMG', rows: { Monday: [
                            { period: 1, subject: 'ANDROID PROG', faculty: 'Ms.Harathi' }] } }]
                    },
                    confidence: 0.9
                };
            }
        });
        try {
            const result = await importer.preview(Buffer.from('png'), 'tt.png');
            assert.strictEqual(result.format, 'image');
            assert.strictEqual(result.report.ok, true);
            assert.strictEqual(result.preview[0].periods[0].subject, 'ANDROID PROG');
        } finally {
            importer.imageImporter.setExtractionBackend(null);
        }
        assert.strictEqual(importer.imageImporter.hasExtractionBackend(), false);
    });

    check('the adapter rejects a backend with no extract method', () => {
        assert.throws(() => importer.imageImporter.setExtractionBackend({}), /extract/);
    });
}

// ---------------------------------------------------------------- HTTP layer
async function apiTests() {
    console.log('\n[7] API serves the real timetable');

    const tt = await request('GET', '/api/availability/timetable');
    check('GET /api/availability/timetable serves the DCME grid with metadata', () => {
        assert.strictEqual(tt.status, 200);
        assert.strictEqual(tt.body.class, 'DCME-V');
        assert.strictEqual(tt.body.institution, 'Aditya Institute of Technology and Management');
        assert.strictEqual(tt.body.cells.length, 42);
        assert.strictEqual(tt.body.breaks[0].afterPeriod, 3);
    });

    check('every one of the 42 coordinates is individually addressable', () => {
        const seen = new Set(tt.body.cells.map(c => `${c.day}|${c.period}`));
        assert.strictEqual(seen.size, 42);
        tt.body.cells.forEach(c => {
            assert.ok(c.day && c.period);
            assert.ok('subject' in c && 'faculty' in c && 'class' in c);
            assert.ok('startTime' in c && 'endTime' in c && 'spanId' in c);
        });
    });

    const formats = await request('GET', '/api/import/formats');
    check('GET /api/import/formats reports image extraction as not ready', () => {
        assert.strictEqual(formats.status, 200);
        assert.strictEqual(formats.body.csv.ready, true);
        assert.strictEqual(formats.body.excel.ready, true);
        assert.strictEqual(formats.body.image.ready, false);
    });

    // ---- clicked cells: exact day, period, subject, faculty ----
    console.log('\n[8] Clicked cell -> availability (10 real coordinates)');

    const picks = [
        ['Monday', 1], ['Monday', 2], ['Monday', 5],
        ['Tuesday', 5], ['Tuesday', 7],
        ['Wednesday', 6], ['Thursday', 7],
        ['Friday', 6], ['Saturday', 5], ['Saturday', 7]
    ];

    const results = [];
    for (const [day, period] of picks) {
        const cell = tt.body.cells.find(c => c.day === day && c.period === period);
        const res = await request('POST', '/api/availability', {
            day: cell.day, period: cell.period, class: cell.class,
            subject: cell.subject, faculty: cell.faculty, room: cell.room
        });
        results.push({ cell, res });
    }

    check('all 10 clicked cells send their exact day and period', () => {
        results.forEach(({ cell, res }) => {
            assert.strictEqual(res.status, 200, `${cell.day} P${cell.period} -> ${res.status}`);
            assert.strictEqual(res.body.day, cell.day);
            assert.strictEqual(res.body.period, cell.period);
        });
    });

    check('a BUSY slot never offers the faculty teaching it', () => {
        results.filter(r => r.cell.faculty).forEach(({ cell, res }) => {
            assert.ok(!res.body.availableFaculty.includes(cell.faculty),
                `${cell.day} P${cell.period}: ${cell.faculty} is teaching and must not be listed free`);
            assert.ok(res.body.busy.some(b => b.faculty === cell.faculty));
        });
    });

    check('an unresolved slot marks nobody busy and offers the whole roster', () => {
        const unresolved = results.filter(r => r.cell.faculty === null);
        assert.strictEqual(unresolved.length, 2, 'Thursday P7 and Friday P6');
        unresolved.forEach(({ cell, res }) => {
            assert.strictEqual(res.body.busy.length, 0, `${cell.day} P${cell.period}`);
            assert.strictEqual(res.body.availableFaculty.length, 7);
        });
    });

    check('free + busy always equals the 7-faculty roster', () => {
        results.forEach(({ cell, res }) => {
            assert.strictEqual(res.body.availableFaculty.length + res.body.busy.length, 7,
                `${cell.day} P${cell.period}`);
        });
    });

    check('Monday P2 returns the other six faculty', () => {
        const monday = results.find(r => r.cell.day === 'Monday' && r.cell.period === 2).res.body;
        assert.deepStrictEqual(monday.availableFaculty.slice().sort(), [
            'Sri B.Gopala Rao', 'Ms.G.Sandhya Rani', 'Ms.Harathi',
            'Mrs.A.Sravanthi', 'Mrs.K.Anitha', 'Mr. Ch.Sai Kishore'
        ].sort());
    });

    check('the three lab periods each resolve independently', () => {
        ['Monday'].forEach(day => {
            [5, 6, 7].forEach(period => {
                const cell = tt.body.cells.find(c => c.day === day && c.period === period);
                assert.strictEqual(cell.subject, 'ANDROID PROG LAB');
                assert.strictEqual(cell.period, period);
            });
        });
    });

    return tt;
}

async function readOnlyTests(before) {
    console.log('\n[9] Availability stays read-only');

    const meta = await request('GET', '/api/availability/meta');
    for (const day of meta.body.days) {
        for (const period of meta.body.periods) {
            await request('POST', '/api/availability', { day, period });
        }
    }

    const after = await request('GET', '/api/availability/timetable');
    check('42 availability calls changed no timetable data', () => {
        assert.deepStrictEqual(after.body, before.body);
    });
}

async function importApiTests() {
    console.log('\n[10] Import API (runs last — commit swaps the loaded timetable)');

    const preview = await uploadFile('/api/import/preview', 'tt.csv', Buffer.from(CSV_FIXTURE));
    check('POST /api/import/preview validates without loading', () => {
        assert.strictEqual(preview.status, 200);
        assert.strictEqual(preview.body.format, 'csv');
        assert.strictEqual(preview.body.loaded, false);
        assert.strictEqual(preview.body.report.ok, true);
        assert.ok(preview.body.preview.length > 0);
    });

    const unchanged = await request('GET', '/api/availability/timetable');
    check('previewing did not change the loaded timetable', () => {
        assert.strictEqual(unchanged.body.class, 'DCME-V');
        assert.strictEqual(unchanged.body.cells.length, 42);
    });

    const badImage = await uploadFile('/api/import/preview', 'tt.png', Buffer.from('not a real png'));
    check('image upload returns the not-implemented error, not a fake timetable', () => {
        assert.strictEqual(badImage.status, 400);
        assert.strictEqual(badImage.body.code, 'IMAGE_EXTRACTION_NOT_IMPLEMENTED');
    });

    const badFile = await uploadFile('/api/import/preview', 'tt.txt', Buffer.from('nope'));
    check('unsupported file type is rejected', () => {
        assert.strictEqual(badFile.status, 400);
        assert.strictEqual(badFile.body.code, 'UNSUPPORTED_FILE_TYPE');
    });

    const stillThere = await request('GET', '/api/availability/timetable');
    check('failed imports left the loaded timetable untouched', () => {
        assert.strictEqual(stillThere.body.class, 'DCME-V');
        assert.strictEqual(stillThere.body.cells.length, 42);
    });

    const commit = await uploadFile('/api/import/commit', 'tt.csv', Buffer.from(CSV_FIXTURE));
    check('POST /api/import/commit loads the imported timetable', () => {
        assert.strictEqual(commit.status, 200);
        assert.strictEqual(commit.body.loaded, true);
    });

    const swapped = await request('GET', '/api/availability/timetable');
    check('the API now serves the imported timetable through the same endpoint', () => {
        assert.strictEqual(swapped.body.class, 'DCME-V');
        const mondayP1 = swapped.body.cells.find(c => c.day === 'Monday' && c.period === 1);
        assert.strictEqual(mondayP1.subject, 'PYTHON PROG');
        // The CSV covered only Monday and Tuesday P1, so Wednesday is now empty.
        const wednesday = swapped.body.cells.find(c => c.day === 'Wednesday' && c.period === 1);
        assert.strictEqual(wednesday.subject, null);
        assert.strictEqual(wednesday.status, 'FREE');
        // TPC came across with no faculty attached.
        const tpc = swapped.body.cells.find(c => c.day === 'Tuesday' && c.period === 1);
        assert.strictEqual(tpc.subject, 'TPC');
        assert.strictEqual(tpc.faculty, null);
    });

    const afterCommit = await request('POST', '/api/availability', { day: 'Monday', period: 2 });
    check('availability works against the newly imported dataset', () => {
        assert.strictEqual(afterCommit.status, 200);
        assert.ok(!afterCommit.body.availableFaculty.includes('Ms. B.Kusuma'));
    });
}

async function main() {
    console.log('TecSubstitution — Phase 3 real-data & import tests');

    realDataTests();
    mergedLabTests();
    validationTests();
    await csvImportTests();
    await excelImportTests();
    await imageImportTests();

    const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverLog = '';
    server.stdout.on('data', d => serverLog += d);
    server.stderr.on('data', d => serverLog += d);

    try {
        await waitForServer();
        const before = await apiTests();
        await readOnlyTests(before);
        await importApiTests();
    } catch (err) {
        console.error('\nServer output:\n' + serverLog);
        throw err;
    } finally {
        server.kill();
    }

    console.log(`\n🎉 All ${passed} Phase 3 checks passed.`);
}

main().catch(err => {
    console.error('\n✗ FAILED:', err.message);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    process.exit(1);
});
