/**
 * Normalized Timetable Store (read-only).
 *
 * Takes structured timetable source data (JSON today; CSV / Excel / document
 * extraction can feed the same `build()` function later) and normalizes every
 * class grid into flat per-faculty records:
 *
 *   { faculty, day, period, class, subject, room, status: 'BUSY' | 'FREE' }
 *
 * A record exists for every faculty x day x period combination, so availability
 * is a direct index lookup rather than a scan across N separate timetables.
 *
 * This module never mutates the source file and exposes no write operations.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_SOURCE_PATH = path.join(__dirname, 'timetable-source.json');

const DAY_ALIASES = {
    MON: 'Monday', MONDAY: 'Monday',
    TUE: 'Tuesday', TUES: 'Tuesday', TUESDAY: 'Tuesday',
    WED: 'Wednesday', WEDS: 'Wednesday', WEDNESDAY: 'Wednesday',
    THU: 'Thursday', THUR: 'Thursday', THURS: 'Thursday', THURSDAY: 'Thursday',
    FRI: 'Friday', FRIDAY: 'Friday',
    SAT: 'Saturday', SATURDAY: 'Saturday',
    SUN: 'Sunday', SUNDAY: 'Sunday'
};

function slotKey(day, period) {
    return `${day}|${period}`;
}

/**
 * Build an immutable, indexed store from a source object.
 * Throws a descriptive Error if the source is inconsistent, so bad real-world
 * data fails loudly at startup instead of silently reporting someone as FREE.
 */
function build(source) {
    if (!source || typeof source !== 'object') {
        throw new Error('Timetable source must be an object');
    }

    const meta = source.meta || {};
    const days = Array.isArray(meta.days) && meta.days.length
        ? meta.days.map(d => String(d).trim())
        : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const periods = Array.isArray(meta.periods) && meta.periods.length
        ? meta.periods.map(p => parseInt(p, 10))
        : [1, 2, 3, 4, 5, 6, 7];
    const periodTimings = meta.periodTimings || {};

    const facultyList = Array.isArray(source.faculty) ? source.faculty : [];
    if (facultyList.length === 0) {
        throw new Error('Timetable source contains no faculty');
    }

    const faculty = facultyList.map(f => ({
        id: String(f.id || f.faculty_id || f.name).trim(),
        name: String(f.name || f.full_name).trim(),
        department: f.department ? String(f.department).trim() : ''
    }));

    // Case-insensitive name lookup so minor casing differences in real data still resolve.
    const facultyByName = new Map();
    faculty.forEach(f => {
        const key = f.name.toUpperCase();
        if (facultyByName.has(key)) {
            throw new Error(`Duplicate faculty name in source data: "${f.name}"`);
        }
        facultyByName.set(key, f);
    });

    const dayLookup = new Map(days.map(d => [d.toUpperCase(), d]));
    const periodSet = new Set(periods);

    // ---- Expand every class grid into BUSY records -------------------------
    const busyRecords = [];
    const classes = Array.isArray(source.classes) ? source.classes : [];

    classes.forEach(cls => {
        const className = String(cls.class || cls.name || '').trim();
        if (!className) throw new Error('A class entry is missing its "class" name');
        const defaultRoom = cls.defaultRoom ? String(cls.defaultRoom).trim() : null;
        const rows = cls.rows || {};

        Object.keys(rows).forEach(rawDay => {
            const day = dayLookup.get(String(rawDay).trim().toUpperCase());
            if (!day) {
                throw new Error(`Class "${className}" references unknown day "${rawDay}"`);
            }

            (rows[rawDay] || []).forEach(cell => {
                const startPeriod = parseInt(cell.period, 10);
                const endPeriod = cell.spanTo != null ? parseInt(cell.spanTo, 10) : startPeriod;

                if (!periodSet.has(startPeriod) || !periodSet.has(endPeriod)) {
                    throw new Error(`Class "${className}" ${day}: period range ${startPeriod}-${endPeriod} is outside the declared periods [${periods.join(', ')}]`);
                }
                if (endPeriod < startPeriod) {
                    throw new Error(`Class "${className}" ${day} P${startPeriod}: spanTo (${endPeriod}) is before the start period`);
                }

                const facultyName = String(cell.faculty || '').trim();
                const member = facultyByName.get(facultyName.toUpperCase());
                if (!member) {
                    throw new Error(`Class "${className}" ${day} P${startPeriod} references faculty "${facultyName}" who is not in the faculty roster`);
                }

                for (let p = startPeriod; p <= endPeriod; p++) {
                    busyRecords.push({
                        faculty: member.name,
                        facultyId: member.id,
                        day,
                        period: p,
                        class: className,
                        subject: cell.subject ? String(cell.subject).trim() : null,
                        room: cell.room ? String(cell.room).trim() : defaultRoom,
                        status: 'BUSY',
                        isMerged: endPeriod > startPeriod,
                        span: endPeriod > startPeriod ? { from: startPeriod, to: endPeriod } : null
                    });
                }
            });
        });
    });

    // ---- Detect double-booking (same faculty, same day+period, two classes) --
    const busyByFacultySlot = new Map();
    const conflicts = [];
    busyRecords.forEach(rec => {
        const key = `${rec.faculty}|${rec.day}|${rec.period}`;
        const existing = busyByFacultySlot.get(key);
        if (existing) {
            conflicts.push(`${rec.faculty} is booked twice on ${rec.day} P${rec.period} (${existing.class} / ${rec.class})`);
        } else {
            busyByFacultySlot.set(key, rec);
        }
    });
    if (conflicts.length > 0) {
        throw new Error(`Timetable source has faculty double-bookings:\n  - ${conflicts.join('\n  - ')}`);
    }

    // ---- Materialize the full faculty x day x period record set -------------
    const records = [];
    const bySlot = new Map();

    days.forEach(day => {
        periods.forEach(period => {
            const slot = { busy: [], free: [] };
            faculty.forEach(member => {
                const busy = busyByFacultySlot.get(`${member.name}|${day}|${period}`);
                const record = busy || {
                    faculty: member.name,
                    facultyId: member.id,
                    day,
                    period,
                    class: null,
                    subject: null,
                    room: null,
                    status: 'FREE',
                    isMerged: false,
                    span: null
                };
                records.push(record);
                (record.status === 'BUSY' ? slot.busy : slot.free).push(record);
            });
            bySlot.set(slotKey(day, period), slot);
        });
    });

    // ---- Primary timetable grid (what the frontend renders) ----------------
    const primaryClassName = meta.primaryClass
        ? String(meta.primaryClass).trim()
        : (classes[0] && String(classes[0].class).trim());

    const primaryCells = [];
    days.forEach(day => {
        periods.forEach(period => {
            const rec = busyRecords.find(r => r.class === primaryClassName && r.day === day && r.period === period);
            const timing = periodTimings[String(period)] || {};
            primaryCells.push({
                day,
                period,
                class: rec ? rec.class : primaryClassName,
                subject: rec ? rec.subject : null,
                faculty: rec ? rec.faculty : null,
                facultyId: rec ? rec.facultyId : null,
                room: rec ? rec.room : null,
                startTime: timing.start || null,
                endTime: timing.end || null,
                status: rec ? 'BUSY' : 'FREE',
                isMerged: rec ? rec.isMerged : false,
                span: rec ? rec.span : null
            });
        });
    });

    const clone = obj => (obj == null ? obj : JSON.parse(JSON.stringify(obj)));

    return {
        // ---- metadata ----
        getMeta() {
            return {
                primaryClass: primaryClassName,
                days: days.slice(),
                periods: periods.slice(),
                periodTimings: clone(periodTimings),
                classes: classes.map(c => String(c.class).trim()),
                facultyCount: faculty.length
            };
        },

        getFaculty() {
            return faculty.map(f => ({ ...f }));
        },

        getDays() { return days.slice(); },
        getPeriods() { return periods.slice(); },

        // ---- normalization helpers ----
        normalizeDay(input) {
            if (input == null) return null;
            const raw = String(input).trim();
            if (!raw) return null;
            const upper = raw.toUpperCase();
            return dayLookup.get(upper) || dayLookup.get(DAY_ALIASES[upper] ? DAY_ALIASES[upper].toUpperCase() : '') || null;
        },

        normalizePeriod(input) {
            if (input == null) return null;
            const match = String(input).trim().match(/(\d+)/);
            if (!match) return null;
            const period = parseInt(match[1], 10);
            return periodSet.has(period) ? period : null;
        },

        // ---- queries (read-only) ----
        getRecords() { return clone(records); },

        /** Every faculty's status at one day+period. */
        getSlot(day, period) {
            const slot = bySlot.get(slotKey(day, period));
            if (!slot) return null;
            return { busy: clone(slot.busy), free: clone(slot.free) };
        },

        /**
         * Core availability query.
         * Returns the faculty who are FREE at this exact day + period.
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

        /** The primary timetable grid the user clicks on. */
        getPrimaryTimetable() {
            return {
                class: primaryClassName,
                days: days.slice(),
                periods: periods.slice(),
                periodTimings: clone(periodTimings),
                cells: clone(primaryCells)
            };
        }
    };
}

function loadFromFile(sourcePath = DEFAULT_SOURCE_PATH) {
    return build(JSON.parse(fs.readFileSync(sourcePath, 'utf8')));
}

// Singleton built at startup from the default source file.
let store = loadFromFile();

module.exports = {
    build,
    loadFromFile,
    DEFAULT_SOURCE_PATH,
    /** Swap in a different source (used by tests and future importers). */
    reload(source) {
        store = source ? build(source) : loadFromFile();
        return store;
    },
    get current() { return store; }
};
