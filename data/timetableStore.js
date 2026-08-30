/**
 * Timetable store — facade over the multi-timetable registry.
 *
 *   sources -> normalizer -> validator -> registry -> availability engine
 *
 * `current` is a view across EVERY loaded timetable, so availability is global:
 * a faculty is BUSY if they appear in any timetable at that day + period.
 *
 * `build(source)` still returns the same query interface for a single source —
 * it is the one-timetable case of the very same engine, which is what the
 * Phase 1 and Phase 3 store-logic tests exercise.
 *
 * This module never mutates any source file and exposes no write operations.
 * `reload()` swaps the in-memory set; it writes nothing to disk.
 */
const registry = require('./timetableRegistry');
const { createView } = require('./availabilityEngine');

/**
 * Build a queryable view over a single timetable source.
 * Throws a descriptive Error listing every validation error, so bad data fails
 * loudly instead of silently reporting someone as FREE.
 */
function build(source, options = {}) {
    const timetable = registry.buildTimetable(source, { ...options, isPrimary: true });
    return createView([timetable]);
}

module.exports = {
    build,
    registry,
    DEFAULT_SOURCE_PATH: registry.DEFAULT_SOURCE_PATH,

    loadFromFile(sourcePath) {
        return sourcePath
            ? build(JSON.parse(require('fs').readFileSync(sourcePath, 'utf8')))
            : registry.loadFromDisk();
    },

    /**
     * Replace the loaded set with a single primary timetable (used by the
     * importers and by tests). In-memory only. If validation throws, the
     * previously loaded timetables are left untouched.
     */
    reload(source, options = {}) {
        return source ? registry.reset(source, options) : registry.loadFromDisk();
    },

    get current() { return registry.view; }
};
