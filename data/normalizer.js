/**
 * Timetable normalizer.
 *
 * Turns a structured timetable source (JSON authored by hand, or produced by
 * the CSV / Excel / image importers) into one flat normalized cell per
 * day + period coordinate.
 *
 * It never throws and never guesses: anything it cannot resolve is reported as
 * an issue for the validator to classify. In particular, a subject with no
 * faculty mapping produces `faculty: null` — never an invented name, because a
 * wrong name would silently corrupt availability results.
 *
 * Layer boundary: this module knows nothing about HTTP, files, or storage.
 */

const DAY_ALIASES = {
    MON: 'Monday', MONDAY: 'Monday',
    TUE: 'Tuesday', TUES: 'Tuesday', TUESDAY: 'Tuesday',
    WED: 'Wednesday', WEDS: 'Wednesday', WEDNESDAY: 'Wednesday',
    THU: 'Thursday', THUR: 'Thursday', THURS: 'Thursday', THURSDAY: 'Thursday',
    FRI: 'Friday', FRIDAY: 'Friday',
    SAT: 'Saturday', SATURDAY: 'Saturday',
    SUN: 'Sunday', SUNDAY: 'Sunday'
};

const DEFAULT_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_PERIODS = [1, 2, 3, 4, 5, 6, 7];

function trimOrNull(value) {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

/** Subjects are matched case- and whitespace-insensitively. */
function subjectKey(subject) {
    return String(subject || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function normalize(source) {
    const issues = [];
    const addIssue = (severity, code, message, context) =>
        issues.push({ severity, code, message, context: context || null });

    if (!source || typeof source !== 'object') {
        addIssue('error', 'MALFORMED_SOURCE', 'Timetable source must be an object');
        return { meta: null, faculty: [], cells: [], issues };
    }

    const rawMeta = source.meta || {};

    const days = Array.isArray(rawMeta.days) && rawMeta.days.length
        ? rawMeta.days.map(d => String(d).trim())
        : DEFAULT_DAYS.slice();
    const periods = Array.isArray(rawMeta.periods) && rawMeta.periods.length
        ? rawMeta.periods.map(p => parseInt(p, 10)).filter(p => !isNaN(p))
        : DEFAULT_PERIODS.slice();
    const periodTimings = rawMeta.periodTimings || {};

    const dayLookup = new Map(days.map(d => [d.toUpperCase(), d]));
    const periodSet = new Set(periods);

    // ---- faculty roster -----------------------------------------------------
    const rosterInput = Array.isArray(source.faculty) ? source.faculty : [];
    const faculty = [];
    const facultyByName = new Map();

    rosterInput.forEach(entry => {
        const name = trimOrNull(entry && (entry.name || entry.full_name));
        if (!name) {
            addIssue('error', 'FACULTY_NO_NAME', 'A faculty roster entry has no name', entry);
            return;
        }
        const key = name.toUpperCase();
        if (facultyByName.has(key)) {
            addIssue('error', 'FACULTY_DUPLICATE', `Duplicate faculty name in source data: "${name}"`, { name });
            return;
        }
        const member = {
            id: trimOrNull(entry.id || entry.faculty_id) || name,
            name,
            department: trimOrNull(entry.department) || ''
        };
        faculty.push(member);
        facultyByName.set(key, member);
    });

    if (faculty.length === 0) {
        addIssue('error', 'NO_FACULTY', 'Timetable source contains no faculty');
    }

    // ---- subject -> faculty mapping ----------------------------------------
    const subjectFaculty = new Map();
    Object.keys(source.subjectFaculty || {}).forEach(subject => {
        const name = trimOrNull(source.subjectFaculty[subject]);
        if (!name) return;
        const member = facultyByName.get(name.toUpperCase());
        if (!member) {
            addIssue('error', 'SUBJECT_MAP_UNKNOWN_FACULTY',
                `Subject "${subject}" maps to faculty "${name}" who is not in the faculty roster`,
                { subject, faculty: name });
            return;
        }
        subjectFaculty.set(subjectKey(subject), member);
    });

    // ---- expand class grids into one cell per coordinate --------------------
    const classes = Array.isArray(source.classes) ? source.classes : [];
    const cells = [];
    const seenCoordinates = new Map();

    classes.forEach(cls => {
        const className = trimOrNull(cls && (cls.class || cls.name));
        if (!className) {
            addIssue('error', 'CLASS_NO_NAME', 'A class entry is missing its "class" name', cls);
            return;
        }
        const defaultRoom = trimOrNull(cls.defaultRoom);
        const classSource = trimOrNull(cls.source) || 'source-file';
        const rows = cls.rows || {};

        Object.keys(rows).forEach(rawDay => {
            const day = dayLookup.get(String(rawDay).trim().toUpperCase());
            if (!day) {
                addIssue('error', 'INVALID_DAY',
                    `Class "${className}" references unknown day "${rawDay}"`,
                    { class: className, day: rawDay });
                return;
            }

            (rows[rawDay] || []).forEach(cell => {
                const startPeriod = parseInt(cell.period, 10);
                const endPeriod = cell.spanTo != null ? parseInt(cell.spanTo, 10) : startPeriod;

                if (!periodSet.has(startPeriod) || !periodSet.has(endPeriod)) {
                    addIssue('error', 'INVALID_PERIOD',
                        `Class "${className}" ${day}: period range ${startPeriod}-${endPeriod} is outside the declared periods [${periods.join(', ')}]`,
                        { class: className, day, period: cell.period, spanTo: cell.spanTo });
                    return;
                }
                if (endPeriod < startPeriod) {
                    addIssue('error', 'INVALID_SPAN',
                        `Class "${className}" ${day} P${startPeriod}: spanTo (${endPeriod}) is before the start period`,
                        { class: className, day, period: startPeriod, spanTo: endPeriod });
                    return;
                }

                const subject = trimOrNull(cell.subject);
                if (!subject) {
                    addIssue('error', 'MISSING_SUBJECT',
                        `Class "${className}" ${day} P${startPeriod} has no subject`,
                        { class: className, day, period: startPeriod });
                    return;
                }

                // --- resolve faculty: explicit name > subject map > unresolved ---
                let member = null;
                let resolution = 'unresolved';
                const explicitName = trimOrNull(cell.faculty);

                if (explicitName) {
                    member = facultyByName.get(explicitName.toUpperCase()) || null;
                    if (!member) {
                        addIssue('error', 'UNKNOWN_FACULTY',
                            `Class "${className}" ${day} P${startPeriod} references faculty "${explicitName}" who is not in the faculty roster`,
                            { class: className, day, period: startPeriod, faculty: explicitName });
                        return;
                    }
                    resolution = 'explicit';
                } else {
                    member = subjectFaculty.get(subjectKey(subject)) || null;
                    if (member) {
                        resolution = 'subject-map';
                    } else {
                        addIssue('warning', 'UNRESOLVED_FACULTY',
                            `Faculty mapping unresolved for "${subject}" (${className} ${day} P${startPeriod})`,
                            { class: className, day, period: startPeriod, subject });
                    }
                }

                const isMerged = endPeriod > startPeriod;
                const spanId = isMerged
                    ? `${className}|${day}|P${startPeriod}-P${endPeriod}`
                    : null;

                // A merged lab becomes one cell per period it covers: every
                // coordinate stays independently clickable, sharing a spanId.
                for (let period = startPeriod; period <= endPeriod; period++) {
                    const coordinate = `${className}|${day}|${period}`;
                    if (seenCoordinates.has(coordinate)) {
                        addIssue('error', 'DUPLICATE_COORDINATE',
                            `Duplicate timetable entry for ${className} ${day} P${period}`,
                            { class: className, day, period });
                        continue;
                    }
                    seenCoordinates.set(coordinate, true);

                    const timing = periodTimings[String(period)] || {};
                    cells.push({
                        day,
                        period,
                        startTime: trimOrNull(timing.start),
                        endTime: trimOrNull(timing.end),
                        class: className,
                        subject,
                        faculty: member ? member.name : null,
                        facultyId: member ? member.id : null,
                        facultyResolution: resolution,
                        room: trimOrNull(cell.room) || defaultRoom,
                        spanId,
                        isMerged,
                        span: isMerged ? { from: startPeriod, to: endPeriod } : null,
                        source: trimOrNull(cell.source) || classSource
                    });
                }
            });
        });
    });

    if (cells.length === 0) {
        addIssue('error', 'EMPTY_TIMETABLE', 'Timetable contains no cells');
    }

    const primaryClass = trimOrNull(rawMeta.primaryClass)
        || (classes[0] && trimOrNull(classes[0].class))
        || null;

    if (primaryClass && !cells.some(c => c.class === primaryClass)) {
        addIssue('error', 'PRIMARY_CLASS_MISSING',
            `Primary class "${primaryClass}" has no timetable cells`, { primaryClass });
    }

    return {
        meta: {
            institution: trimOrNull(rawMeta.institution),
            branch: trimOrNull(rawMeta.branch),
            semester: trimOrNull(rawMeta.semester),
            shift: trimOrNull(rawMeta.shift),
            academicYear: trimOrNull(rawMeta.academicYear),
            effectiveFrom: trimOrNull(rawMeta.effectiveFrom),
            primaryClass,
            days,
            periods,
            periodTimings,
            breaks: Array.isArray(rawMeta.breaks) ? rawMeta.breaks : [],
            classes: classes.map(c => trimOrNull(c && (c.class || c.name))).filter(Boolean)
        },
        faculty,
        cells,
        issues
    };
}

function normalizeDayName(input, allowedDays) {
    if (input == null) return null;
    const raw = String(input).trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    const days = allowedDays || DEFAULT_DAYS;
    const lookup = new Map(days.map(d => [d.toUpperCase(), d]));
    if (lookup.has(upper)) return lookup.get(upper);
    const alias = DAY_ALIASES[upper];
    return alias && lookup.has(alias.toUpperCase()) ? lookup.get(alias.toUpperCase()) : null;
}

function normalizePeriodNumber(input, allowedPeriods) {
    if (input == null) return null;
    const match = String(input).trim().match(/(\d+)/);
    if (!match) return null;
    const period = parseInt(match[1], 10);
    const allowed = allowedPeriods || DEFAULT_PERIODS;
    return allowed.includes(period) ? period : null;
}

module.exports = { normalize, normalizeDayName, normalizePeriodNumber, subjectKey, DAY_ALIASES };
