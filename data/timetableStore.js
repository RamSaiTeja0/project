/**
 * Normalized Timetable Store (read-only).
 *
 *   source object --> normalizer --> validator --> indexed store --> API
 *
 * The store holds one normalized cell per day + period coordinate, plus a
 * materialized FREE/BUSY record for every faculty x day x period, so an
 * availability lookup is an index hit rather than a scan across timetables.
 *
 * Faculty may legitimately be `null` (unresolved) on a cell. Such a cell is
 * still rendered and still clickable, but it marks nobody BUSY — we do not know
 * who is teaching it, and guessing would corrupt availability results.
 *
 * This module never mutates the source file and exposes no write operations.
 * `reload()` swaps the in-memory dataset; it writes nothing to disk.
 */
const fs = require('fs');
const path = require('path');

const { normalize, normalizeDayName, normalizePeriodNumber } = require('./normalizer');
const { validate } = require('./validator');

const DEFAULT_SOURCE_PATH = path.join(__dirname, 'timetable-source.json');

function slotKey(day, period) {
    return `${day}|${period}`;
}

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * Build an immutable, indexed store from a source object.
 * Throws a descriptive Error listing every validation error, so bad real-world
 * data fails loudly instead of silently reporting someone as FREE.
 */
function build(source) {
    const normalized = normalize(source);
    const report = validate(normalized);

    if (!report.ok) {
        const detail = report.errors.map(e => e.message).join('\n  - ');
        throw new Error(`Timetable validation failed:\n  - ${detail}`);
    }

    const meta = normalized.meta;
    const faculty = normalized.faculty;
    const cells = normalized.cells;
    const days = meta.days;
    const periods = meta.periods;
    const primaryClassName = meta.primaryClass;

    // ---- FREE/BUSY record per faculty x day x period ------------------------
    const busyByFacultySlot = new Map();
    cells.forEach(cell => {
        if (!cell.faculty) return; // unresolved: marks nobody busy
        busyByFacultySlot.set(`${cell.faculty}|${cell.day}|${cell.period}`, cell);
    });

    const records = [];
    const bySlot = new Map();

    days.forEach(day => {
        periods.forEach(period => {
            const slot = { busy: [], free: [] };
            faculty.forEach(member => {
                const busy = busyByFacultySlot.get(`${member.name}|${day}|${period}`);
                const record = busy
                    ? {
                        faculty: member.name,
                        facultyId: member.id,
                        day, period,
                        class: busy.class,
                        subject: busy.subject,
                        room: busy.room,
                        status: 'BUSY',
                        spanId: busy.spanId,
                        isMerged: busy.isMerged,
                        span: busy.span
                    }
                    : {
                        faculty: member.name,
                        facultyId: member.id,
                        day, period,
                        class: null,
                        subject: null,
                        room: null,
                        status: 'FREE',
                        spanId: null,
                        isMerged: false,
                        span: null
                    };
                records.push(record);
                (record.status === 'BUSY' ? slot.busy : slot.free).push(record);
            });
            bySlot.set(slotKey(day, period), slot);
        });
    });

    // ---- primary timetable grid (what the frontend renders) ----------------
    const primaryByCoordinate = new Map();
    cells.filter(c => c.class === primaryClassName)
        .forEach(c => primaryByCoordinate.set(slotKey(c.day, c.period), c));

    const primaryCells = [];
    days.forEach(day => {
        periods.forEach(period => {
            const cell = primaryByCoordinate.get(slotKey(day, period));
            const timing = meta.periodTimings[String(period)] || {};
            primaryCells.push(cell
                ? { ...cell, status: 'BUSY' }
                : {
                    day, period,
                    startTime: timing.start || null,
                    endTime: timing.end || null,
                    class: primaryClassName,
                    subject: null,
                    faculty: null,
                    facultyId: null,
                    facultyResolution: 'unresolved',
                    room: null,
                    spanId: null,
                    isMerged: false,
                    span: null,
                    source: 'derived-free',
                    status: 'FREE'
                });
        });
    });

    const periodSet = new Set(periods);

    return {
        getMeta() {
            return {
                ...clone(meta),
                facultyCount: faculty.length
            };
        },

        getFaculty() { return faculty.map(f => ({ ...f })); },
        getDays() { return days.slice(); },
        getPeriods() { return periods.slice(); },

        /** The validation report this dataset loaded with (warnings included). */
        getReport() { return clone(report); },

        normalizeDay(input) { return normalizeDayName(input, days); },
        normalizePeriod(input) { return normalizePeriodNumber(input, periods); },

        getRecords() { return clone(records); },

        /** Every normalized cell, one per class/day/period coordinate. */
        getCells() { return clone(cells); },

        getSlot(day, period) {
            const slot = bySlot.get(slotKey(day, period));
            if (!slot) return null;
            return { busy: clone(slot.busy), free: clone(slot.free) };
        },

        /**
         * Core availability query: who is FREE at this exact day + period.
         * `exclude` (name) drops the faculty who owns the clicked cell.
         */
        getAvailableFaculty(day, period, exclude) {
            const slot = bySlot.get(slotKey(day, period));
            if (!slot) return null;
            const excludeName = exclude ? String(exclude).trim().toUpperCase() : null;
            return slot.free
                .filter(r => !excludeName || r.faculty.toUpperCase() !== excludeName)
                .map(r => ({ faculty: r.faculty, facultyId: r.facultyId }));
        },

        getPrimaryTimetable() {
            return {
                class: primaryClassName,
                institution: meta.institution,
                branch: meta.branch,
                semester: meta.semester,
                shift: meta.shift,
                academicYear: meta.academicYear,
                effectiveFrom: meta.effectiveFrom,
                days: days.slice(),
                periods: periods.slice(),
                periodTimings: clone(meta.periodTimings),
                breaks: clone(meta.breaks),
                cells: clone(primaryCells)
            };
        },

        // Kept for callers that only need to know the period range.
        hasPeriod(period) { return periodSet.has(period); }
    };
}

function loadFromFile(sourcePath = DEFAULT_SOURCE_PATH) {
    return build(JSON.parse(fs.readFileSync(sourcePath, 'utf8')));
}

let store = loadFromFile();

module.exports = {
    build,
    loadFromFile,
    DEFAULT_SOURCE_PATH,
    /**
     * Swap in a different dataset (used by the importers and by tests).
     * In-memory only — nothing is written to disk. If `build` throws, the
     * currently loaded store is left untouched.
     */
    reload(source) {
        const next = source ? build(source) : loadFromFile();
        store = next;
        return store;
    },
    get current() { return store; }
};
