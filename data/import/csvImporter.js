/**
 * CSV timetable importer.
 *
 * Expected header (case-insensitive, order-independent):
 *   Day,Period,Subject,Faculty,Class,Room[,SpanTo]
 *
 * Produces a timetable *source object* — the same shape the JSON source file
 * uses — which the normalizer then turns into cells. The importer itself makes
 * no availability decisions and invents nothing: a blank Faculty column stays
 * blank and is later reported as unresolved.
 */

const FORMAT = 'csv';

/** Minimal RFC4180-style parser: handles quoted fields, embedded commas and newlines. */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    const content = String(text).replace(/^﻿/, ''); // strip BOM

    for (let i = 0; i < content.length; i++) {
        const char = content[i];

        if (inQuotes) {
            if (char === '"') {
                if (content[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') { inQuotes = true; continue; }
        if (char === ',') { row.push(field); field = ''; continue; }
        if (char === '\r') continue;
        if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
        field += char;
    }

    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(cell => String(cell).trim().length > 0));
}

function headerIndex(header) {
    const index = {};
    header.forEach((name, i) => {
        const key = String(name).trim().toLowerCase().replace(/[\s_]/g, '');
        index[key] = i;
    });
    return index;
}

/**
 * @param {Buffer|string} input  raw CSV
 * @param {object} options       { meta } extra metadata to carry onto the source
 * @returns {{source: object, format: string, rowCount: number, issues: Array}}
 */
function parse(input, options = {}) {
    const issues = [];
    const rows = parseCsv(Buffer.isBuffer(input) ? input.toString('utf8') : input);

    if (rows.length === 0) {
        const error = new Error('CSV file is empty');
        error.code = 'EMPTY_FILE';
        throw error;
    }

    const index = headerIndex(rows[0]);
    const required = ['day', 'period', 'subject'];
    const missing = required.filter(col => index[col] === undefined);
    if (missing.length > 0) {
        const error = new Error(
            `CSV header must include ${required.join(', ')} (missing: ${missing.join(', ')}). ` +
            'Expected: Day,Period,Subject,Faculty,Class,Room[,SpanTo]');
        error.code = 'BAD_HEADER';
        throw error;
    }

    const at = (row, key) => {
        const i = index[key];
        if (i === undefined) return null;
        const value = row[i];
        return value == null || String(value).trim() === '' ? null : String(value).trim();
    };

    const byClass = new Map();
    const facultyNames = new Set();
    let rowCount = 0;

    rows.slice(1).forEach((row, n) => {
        const lineNumber = n + 2;
        const day = at(row, 'day');
        const periodRaw = at(row, 'period');
        const subject = at(row, 'subject');
        const faculty = at(row, 'faculty');
        const className = at(row, 'class') || options.defaultClass || 'Imported';
        const room = at(row, 'room');
        const spanToRaw = at(row, 'spanto');

        if (!day || !periodRaw) {
            issues.push({ severity: 'error', code: 'MALFORMED_ROW',
                message: `CSV line ${lineNumber}: Day and Period are required`, context: { line: lineNumber } });
            return;
        }

        const period = parseInt(String(periodRaw).replace(/[^\d]/g, ''), 10);
        if (isNaN(period)) {
            issues.push({ severity: 'error', code: 'MALFORMED_ROW',
                message: `CSV line ${lineNumber}: Period "${periodRaw}" is not a number`, context: { line: lineNumber } });
            return;
        }

        if (!byClass.has(className)) byClass.set(className, { class: className, source: 'csv-import', rows: {} });
        const cls = byClass.get(className);
        if (!cls.rows[day]) cls.rows[day] = [];

        const cell = { period, subject };
        if (faculty) { cell.faculty = faculty; facultyNames.add(faculty); }
        if (room) cell.room = room;
        if (spanToRaw) {
            const spanTo = parseInt(String(spanToRaw).replace(/[^\d]/g, ''), 10);
            if (!isNaN(spanTo)) cell.spanTo = spanTo;
        }

        cls.rows[day].push(cell);
        rowCount++;
    });

    const classes = [...byClass.values()];
    const source = {
        meta: {
            primaryClass: options.primaryClass || (classes[0] && classes[0].class) || null,
            ...(options.meta || {})
        },
        // Roster is derived from the names present in the file; a blank Faculty
        // column is left unresolved rather than attributed to anyone.
        faculty: [...facultyNames].sort().map(name => ({ id: name, name })),
        subjectFaculty: options.subjectFaculty || {},
        classes
    };

    return { source, format: FORMAT, rowCount, issues };
}

module.exports = { parse, parseCsv, FORMAT };
