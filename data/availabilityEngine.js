/**
 * Availability engine — pure, framework-free.
 *
 * Given a set of normalized timetables (one marked primary), it answers:
 * "who is FREE at this exact day + period?" — where BUSY means the faculty
 * appears in ANY loaded timetable at that slot, not just the primary one.
 *
 * A faculty is identified by their canonical name, so the same person appearing
 * in three timetables is one identity, counted once.
 *
 * Cells with unresolved faculty (`faculty: null`) mark nobody BUSY: we do not
 * know who is teaching them, and guessing would corrupt every result.
 *
 * No Express, no DOM, no I/O — `createView` takes plain objects and is directly
 * unit-testable.
 */

const { normalizeDayName, normalizePeriodNumber } = require('./normalizer');

function slotKey(day, period) { return `${day}|${period}`; }
function facultyKey(name, day, period) { return `${String(name).toUpperCase()}|${day}|${period}`; }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

/**
 * Build a queryable view over one or more normalized timetables.
 *
 * @param {Array} timetables  entries of the shape produced by
 *        timetableRegistry.buildTimetable(): { id, name, isPrimary, meta,
 *        faculty, cells, report, ... }
 * @returns query interface (the same surface a single-timetable store exposes)
 */
function createView(timetables) {
    const list = Array.isArray(timetables) ? timetables.filter(Boolean) : [];
    if (list.length === 0) {
        throw new Error('Availability engine needs at least one timetable');
    }

    const primary = list.find(t => t.isPrimary) || list[0];

    // ---- canonical faculty roster (deduped by name across timetables) -------
    const rosterByName = new Map();
    list.forEach(timetable => {
        (timetable.faculty || []).forEach(member => {
            const key = member.name.toUpperCase();
            if (!rosterByName.has(key)) {
                rosterByName.set(key, {
                    id: member.id,
                    name: member.name,
                    department: member.department || '',
                    timetables: [timetable.id]
                });
            } else {
                const existing = rosterByName.get(key);
                if (!existing.timetables.includes(timetable.id)) {
                    existing.timetables.push(timetable.id);
                }
            }
        });
    });
    const roster = [...rosterByName.values()];

    // ---- global BUSY index: faculty x day x period -> every source slot -----
    const busyIndex = new Map();
    const allCells = [];

    list.forEach(timetable => {
        (timetable.cells || []).forEach(cell => {
            const tagged = { ...cell, timetableId: timetable.id, timetableName: timetable.name };
            allCells.push(tagged);
            if (!cell.faculty) return; // unresolved marks nobody busy

            const key = facultyKey(cell.faculty, cell.day, cell.period);
            if (!busyIndex.has(key)) busyIndex.set(key, []);
            busyIndex.get(key).push(tagged);
        });
    });

    // ---- days / periods: the primary defines the grid -----------------------
    const days = (primary.meta && primary.meta.days) ? primary.meta.days.slice() : [];
    const periods = (primary.meta && primary.meta.periods) ? primary.meta.periods.slice() : [];

    // ---- one faculty teaching in two different timetables at once ----------
    // Within a single timetable this is a validation error; across separately
    // loaded timetables it means BUSY, and is surfaced as a warning.
    const crossConflicts = [];
    busyIndex.forEach(sources => {
        const timetableIds = [...new Set(sources.map(s => s.timetableId))];
        if (timetableIds.length > 1) {
            const first = sources[0];
            crossConflicts.push({
                code: 'CROSS_TIMETABLE_CONFLICT',
                message: `${first.faculty} is scheduled in ${timetableIds.length} timetables at ${first.day} P${first.period} (${sources.map(s => `${s.timetableName}: ${s.subject}`).join(', ')})`,
                context: {
                    faculty: first.faculty, day: first.day, period: first.period,
                    timetables: timetableIds
                }
            });
        }
    });

    function slotRecords(day, period) {
        const busy = [];
        const free = [];

        roster.forEach(member => {
            const sources = busyIndex.get(facultyKey(member.name, day, period)) || [];
            if (sources.length > 0) {
                // One record per faculty regardless of how many timetables
                // list them — loading a timetable twice cannot duplicate them.
                const first = sources[0];
                busy.push({
                    faculty: member.name,
                    facultyId: member.id,
                    day, period,
                    status: 'BUSY',
                    class: first.class,
                    subject: first.subject,
                    room: first.room,
                    spanId: first.spanId,
                    isMerged: Boolean(first.isMerged),
                    span: first.span || null,
                    timetableId: first.timetableId,
                    timetableName: first.timetableName,
                    sources: sources.map(s => ({
                        timetableId: s.timetableId,
                        timetableName: s.timetableName,
                        class: s.class,
                        subject: s.subject,
                        room: s.room
                    }))
                });
            } else {
                free.push({
                    faculty: member.name,
                    facultyId: member.id,
                    day, period,
                    status: 'FREE',
                    class: null, subject: null, room: null,
                    spanId: null, isMerged: false, span: null,
                    timetableId: null, timetableName: null,
                    sources: []
                });
            }
        });

        return { busy, free };
    }

    // Precompute every slot on the primary grid.
    const bySlot = new Map();
    days.forEach(day => periods.forEach(period => {
        bySlot.set(slotKey(day, period), slotRecords(day, period));
    }));

    const records = [];
    bySlot.forEach(slot => { records.push(...slot.busy, ...slot.free); });

    // ---- primary timetable grid (what the UI renders) ----------------------
    // A timetable source may hold several classes; the grid shows only the one
    // named as primaryClass, otherwise later classes overwrite its cells.
    const primaryClassName = primary.meta.primaryClass;
    const primaryByCoordinate = new Map();
    (primary.cells || [])
        .filter(c => !primaryClassName || c.class === primaryClassName)
        .forEach(c => primaryByCoordinate.set(slotKey(c.day, c.period), c));

    const primaryCells = [];
    days.forEach(day => periods.forEach(period => {
        const cell = primaryByCoordinate.get(slotKey(day, period));
        const timing = (primary.meta.periodTimings || {})[String(period)] || {};
        primaryCells.push(cell
            ? { ...cell, status: 'BUSY' }
            : {
                day, period,
                startTime: timing.start || null,
                endTime: timing.end || null,
                class: primaryClassName || null,
                subject: null, faculty: null, facultyId: null,
                facultyResolution: 'unresolved',
                room: null, spanId: null, isMerged: false, span: null,
                source: 'derived-free', status: 'FREE'
            });
    }));

    // ---- merged validation report across every loaded timetable ------------
    const mergedReport = {
        ok: list.every(t => t.report.ok),
        errors: list.flatMap(t => (t.report.errors || [])
            .map(e => ({ ...e, timetableId: t.id }))),
        warnings: list.flatMap(t => (t.report.warnings || [])
            .map(w => ({ ...w, timetableId: t.id })))
            .concat(crossConflicts),
        summary: {
            timetables: list.length,
            primary: primary.id,
            cells: allCells.length,
            faculty: roster.length,
            days: days.length,
            periods: periods.length,
            unresolvedCells: allCells.filter(c => c.facultyResolution === 'unresolved').length,
            unresolvedSubjects: [...new Set(allCells
                .filter(c => c.facultyResolution === 'unresolved').map(c => c.subject))],
            crossTimetableConflicts: crossConflicts.length
        }
    };

    return {
        // ---- timetable set ----
        getTimetables() {
            return list.map(t => ({
                id: t.id, name: t.name,
                branch: t.branch, semester: t.semester, section: t.section,
                isPrimary: Boolean(t.isPrimary), source: t.source,
                cellCount: (t.cells || []).length,
                facultyCount: (t.faculty || []).length
            }));
        },
        getTimetable(id) {
            const found = list.find(t => t.id === id);
            return found ? clone(found) : null;
        },
        getPrimaryId() { return primary.id; },

        // ---- metadata ----
        getMeta() {
            return {
                ...clone(primary.meta),
                facultyCount: roster.length,
                timetableCount: list.length,
                primaryTimetableId: primary.id
            };
        },
        getFaculty() { return roster.map(f => ({ ...f })); },
        getDays() { return days.slice(); },
        getPeriods() { return periods.slice(); },
        getReport() { return clone(mergedReport); },

        normalizeDay(input) { return normalizeDayName(input, days); },
        normalizePeriod(input) { return normalizePeriodNumber(input, periods); },

        // ---- queries ----
        getRecords() { return clone(records); },
        getCells() { return clone(allCells); },

        getSlot(day, period) {
            const slot = bySlot.get(slotKey(day, period));
            if (!slot) return null;
            return { busy: clone(slot.busy), free: clone(slot.free) };
        },

        /**
         * Faculty FREE at this day + period across EVERY loaded timetable.
         * `exclude` (name) additionally drops the clicked cell's own faculty.
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
                id: primary.id,
                class: primary.meta.primaryClass,
                institution: primary.meta.institution,
                branch: primary.meta.branch,
                semester: primary.meta.semester,
                shift: primary.meta.shift,
                academicYear: primary.meta.academicYear,
                effectiveFrom: primary.meta.effectiveFrom,
                days: days.slice(),
                periods: periods.slice(),
                periodTimings: clone(primary.meta.periodTimings),
                breaks: clone(primary.meta.breaks),
                cells: clone(primaryCells),
                timetableCount: list.length,
                referenceTimetables: list.filter(t => !t.isPrimary)
                    .map(t => ({ id: t.id, name: t.name }))
            };
        }
    };
}

module.exports = { createView };
