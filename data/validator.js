/**
 * Timetable validator.
 *
 * Takes normalizer output and classifies it into a report:
 *   - errors   block loading (the timetable would be wrong or ambiguous)
 *   - warnings are surfaced to the user but do not block (chiefly unresolved
 *     faculty, which is a legitimate state the timetable must be able to hold)
 *
 * Checks that the normalizer cannot do on its own (they need the whole picture)
 * live here: double-booking across classes and missing periods.
 *
 * Layer boundary: pure functions over normalized data. No I/O.
 */

function validate(normalized) {
    const errors = [];
    const warnings = [];

    const push = issue => {
        (issue.severity === 'error' ? errors : warnings).push({
            code: issue.code,
            message: issue.message,
            context: issue.context || null
        });
    };

    (normalized.issues || []).forEach(push);

    const cells = normalized.cells || [];
    const meta = normalized.meta || {};
    const days = meta.days || [];
    const periods = meta.periods || [];

    // --- a faculty member cannot teach two classes at the same day + period ---
    // Cells with unresolved faculty are skipped: we do not know who is there,
    // so claiming a conflict (or an availability) would be a guess.
    const busyByFacultySlot = new Map();
    cells.forEach(cell => {
        if (!cell.faculty) return;
        const key = `${cell.faculty}|${cell.day}|${cell.period}`;
        const existing = busyByFacultySlot.get(key);
        if (existing) {
            errors.push({
                code: 'DOUBLE_BOOKING',
                message: `Faculty double-booking: ${cell.faculty} is booked twice on ${cell.day} P${cell.period} (${existing.class} / ${cell.class})`,
                context: { faculty: cell.faculty, day: cell.day, period: cell.period, classes: [existing.class, cell.class] }
            });
        } else {
            busyByFacultySlot.set(key, cell);
        }
    });

    // --- report coordinates the primary class does not cover ------------------
    const primaryClass = meta.primaryClass;
    if (primaryClass && days.length && periods.length) {
        const covered = new Set(
            cells.filter(c => c.class === primaryClass).map(c => `${c.day}|${c.period}`)
        );
        const missing = [];
        days.forEach(day => {
            periods.forEach(period => {
                if (!covered.has(`${day}|${period}`)) missing.push(`${day} P${period}`);
            });
        });
        if (missing.length > 0) {
            warnings.push({
                code: 'MISSING_PERIODS',
                message: `Primary class "${primaryClass}" has no entry for ${missing.length} coordinate(s): ${missing.join(', ')}`,
                context: { primaryClass, missing }
            });
        }
    }

    const unresolved = cells.filter(c => c.facultyResolution === 'unresolved');

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        summary: {
            cells: cells.length,
            faculty: (normalized.faculty || []).length,
            classes: (meta.classes || []).length,
            days: days.length,
            periods: periods.length,
            unresolvedCells: unresolved.length,
            unresolvedSubjects: [...new Set(unresolved.map(c => c.subject))],
            mergedSpans: [...new Set(cells.filter(c => c.spanId).map(c => c.spanId))].length
        }
    };
}

/** Render a validation report as the lines a preview UI shows. */
function formatReport(report) {
    const lines = [];
    report.errors.forEach(e => lines.push(`ERROR   [${e.code}] ${e.message}`));
    report.warnings.forEach(w => lines.push(`WARNING [${w.code}] ${w.message}`));
    return lines;
}

module.exports = { validate, formatReport };
