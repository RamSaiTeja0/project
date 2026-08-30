/**
 * Import orchestration: file -> importer -> normalizer -> validator -> preview.
 *
 *   preview()  parses and validates, returns what WOULD be loaded. No mutation.
 *   commit()   does the same, then swaps the in-memory store if validation passes.
 *
 * If anything fails, the currently loaded timetable is left untouched.
 */
const path = require('path');

const csvImporter = require('./csvImporter');
const excelImporter = require('./excelImporter');
const imageImporter = require('./imageImporter');
const { normalize } = require('../normalizer');
const { validate } = require('../validator');
const timetableStore = require('../timetableStore');

const EXTENSIONS = {
    '.csv': csvImporter,
    '.xlsx': excelImporter,
    '.xls': excelImporter,
    '.png': imageImporter,
    '.jpg': imageImporter,
    '.jpeg': imageImporter
};

const SUPPORTED = ['CSV', 'Excel (.xlsx)', 'PNG', 'JPG', 'JPEG'];

function importerFor(filename) {
    const ext = path.extname(String(filename || '')).toLowerCase();
    const importer = EXTENSIONS[ext];
    if (!importer) {
        const error = new Error(
            `Unsupported file type "${ext || filename}". Supported: ${SUPPORTED.join(', ')}.`);
        error.code = 'UNSUPPORTED_FILE_TYPE';
        throw error;
    }
    return { importer, ext };
}

/** Group normalized cells into the day-by-day preview a user reviews. */
function buildPreview(normalized) {
    const meta = normalized.meta || {};
    const primaryClass = meta.primaryClass;
    const days = meta.days || [];
    const periods = meta.periods || [];

    const byCoordinate = new Map();
    (normalized.cells || [])
        .filter(c => !primaryClass || c.class === primaryClass)
        .forEach(c => byCoordinate.set(`${c.day}|${c.period}`, c));

    return days.map(day => ({
        day,
        periods: periods.map(period => {
            const cell = byCoordinate.get(`${day}|${period}`);
            if (!cell) {
                return { period, subject: null, faculty: null, unresolved: false, empty: true };
            }
            return {
                period,
                subject: cell.subject,
                faculty: cell.faculty,
                facultyLabel: cell.faculty || 'Faculty unresolved',
                unresolved: cell.facultyResolution === 'unresolved',
                empty: false,
                spanId: cell.spanId,
                room: cell.room,
                startTime: cell.startTime,
                endTime: cell.endTime
            };
        })
    }));
}

async function parseFile(buffer, filename, options = {}) {
    const { importer } = importerFor(filename);
    return await importer.parse(buffer, options);
}

/**
 * Parse + normalize + validate without touching the loaded timetable.
 * @returns {{format, source, report, preview, faculty, meta}}
 */
async function preview(buffer, filename, options = {}) {
    const parsed = await parseFile(buffer, filename, options);
    const normalized = normalize(parsed.source);

    // Issues raised by the importer itself (malformed rows) join the report.
    (parsed.issues || []).forEach(issue => normalized.issues.push(issue));

    const report = validate(normalized);

    return {
        format: parsed.format,
        source: parsed.source,
        report,
        preview: buildPreview(normalized),
        faculty: normalized.faculty,
        meta: normalized.meta
    };
}

/**
 * Preview, then load into the in-memory store if validation passed.
 * Never writes to disk. On failure the previous timetable stays loaded.
 */
async function commit(buffer, filename, options = {}) {
    const result = await preview(buffer, filename, options);

    if (!result.report.ok) {
        const error = new Error('Timetable import rejected: validation failed');
        error.code = 'VALIDATION_FAILED';
        error.report = result.report;
        throw error;
    }

    timetableStore.reload(result.source);
    return { ...result, loaded: true };
}

module.exports = {
    preview,
    commit,
    parseFile,
    importerFor,
    buildPreview,
    SUPPORTED,
    csvImporter,
    excelImporter,
    imageImporter
};
