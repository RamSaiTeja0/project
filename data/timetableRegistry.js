/**
 * Multi-timetable registry.
 *
 * Holds every loaded timetable — exactly one primary, the rest reference —
 * and hands the whole set to the availability engine so that BUSY is decided
 * globally rather than from the primary alone.
 *
 * Startup order:
 *   1. data/timetable-source.json           -> the primary timetable
 *   2. data/timetables/*.json (if present)  -> reference timetables
 *
 * Nothing here writes to disk. Registering, replacing and setting the primary
 * all mutate in-memory state only, and only on an explicit call — the
 * availability path never touches them.
 */
const fs = require('fs');
const path = require('path');

const { normalize } = require('./normalizer');
const { validate } = require('./validator');
const { createView } = require('./availabilityEngine');

const DEFAULT_SOURCE_PATH = path.join(__dirname, 'timetable-source.json');
const REFERENCE_DIR = path.join(__dirname, 'timetables');

let sequence = 0;
function nextId(prefix) {
    sequence += 1;
    return `${prefix}-${sequence}`;
}

function slugify(value, fallback) {
    const slug = String(value || '').trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug || fallback;
}

/**
 * Normalize + validate one source into a registry entry.
 * Throws if validation produced errors, so a bad timetable never enters the set.
 */
function buildTimetable(source, options = {}) {
    const normalized = normalize(source);
    const report = validate(normalized);

    if (!report.ok) {
        const detail = report.errors.map(e => e.message).join('\n  - ');
        const error = new Error(`Timetable validation failed:\n  - ${detail}`);
        error.code = 'VALIDATION_FAILED';
        error.report = report;
        throw error;
    }

    const meta = normalized.meta;
    const name = options.name || meta.primaryClass || meta.branch || 'Timetable';

    return {
        id: options.id || slugify(name, nextId('timetable')),
        name,
        branch: options.branch || meta.branch || null,
        semester: options.semester || meta.semester || null,
        section: options.section || meta.section || null,
        isPrimary: Boolean(options.isPrimary),
        source: options.source || 'source-file',
        meta,
        faculty: normalized.faculty,
        cells: normalized.cells,
        report
    };
}

// ---------------------------------------------------------------- state
let timetables = [];
let view = null;

function rebuild() {
    view = createView(timetables);
    return view;
}

function ensurePrimary() {
    if (timetables.length === 0) return;
    if (!timetables.some(t => t.isPrimary)) timetables[0].isPrimary = true;
}

/** Register a timetable. Replaces an existing one with the same id. */
function register(source, options = {}) {
    const entry = buildTimetable(source, options);

    const existingIndex = timetables.findIndex(t => t.id === entry.id);
    if (existingIndex >= 0) {
        // Re-registering the same id replaces it — it never doubles the roster
        // or makes a faculty appear twice in a busy list.
        entry.isPrimary = options.isPrimary !== undefined
            ? Boolean(options.isPrimary)
            : timetables[existingIndex].isPrimary;
        timetables[existingIndex] = entry;
    } else {
        timetables.push(entry);
    }

    if (entry.isPrimary) {
        timetables.forEach(t => { t.isPrimary = t.id === entry.id; });
    }
    ensurePrimary();
    rebuild();
    return entry;
}

function unregister(id) {
    const before = timetables.length;
    const wasPrimary = timetables.some(t => t.id === id && t.isPrimary);
    timetables = timetables.filter(t => t.id !== id);
    if (timetables.length === before) return false;
    if (timetables.length === 0) {
        throw new Error('Cannot remove the last timetable');
    }
    if (wasPrimary) ensurePrimary();
    rebuild();
    return true;
}

function setPrimary(id) {
    if (!timetables.some(t => t.id === id)) return false;
    timetables.forEach(t => { t.isPrimary = t.id === id; });
    rebuild();
    return true;
}

/** Replace the whole set with a single primary timetable. */
function reset(source, options = {}) {
    timetables = [];
    register(source, { ...options, isPrimary: true });
    return view;
}

function loadReferenceDirectory(dir = REFERENCE_DIR) {
    const loaded = [];
    if (!fs.existsSync(dir)) return loaded;

    fs.readdirSync(dir)
        .filter(file => file.toLowerCase().endsWith('.json'))
        .sort()
        .forEach(file => {
            const full = path.join(dir, file);
            try {
                const source = JSON.parse(fs.readFileSync(full, 'utf8'));
                loaded.push(register(source, {
                    id: slugify(path.basename(file, '.json'), null) || undefined,
                    source: `file:${file}`,
                    isPrimary: false
                }));
            } catch (err) {
                // A broken reference file must not take the app down; the
                // primary timetable keeps working and the problem is logged.
                console.error(`[timetables] Skipped reference timetable ${file}: ${err.message}`);
            }
        });

    return loaded;
}

function loadFromDisk(sourcePath = DEFAULT_SOURCE_PATH, referenceDir = REFERENCE_DIR) {
    timetables = [];
    const primarySource = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    register(primarySource, {
        source: `file:${path.basename(sourcePath)}`,
        isPrimary: true
    });
    loadReferenceDirectory(referenceDir);
    return view;
}

loadFromDisk();

module.exports = {
    buildTimetable,
    register,
    unregister,
    setPrimary,
    reset,
    loadFromDisk,
    loadReferenceDirectory,
    DEFAULT_SOURCE_PATH,
    REFERENCE_DIR,
    list() { return timetables.map(t => ({ ...t, cells: undefined, faculty: undefined })); },
    get view() { return view; }
};
