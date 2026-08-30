/**
 * Timetable management API (minimal, REST-like).
 *
 *   GET    /api/timetables         list every loaded timetable
 *   GET    /api/timetables/:id     one timetable, with its cells
 *   POST   /api/timetables         register one (JSON source, or CSV/XLSX upload)
 *   POST   /api/timetables/primary { id } — mark exactly one as primary
 *   DELETE /api/timetables/:id     remove a timetable (never the last one)
 *
 * Registering and setting the primary are explicit, user-initiated writes to
 * in-memory state. Nothing is written to disk, and the availability endpoint
 * stays read-only.
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();

const registry = require('../data/timetableRegistry');
const importer = require('../data/import');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

function summary() {
    const view = registry.view;
    return {
        primaryId: view.getPrimaryId(),
        count: view.getTimetables().length,
        facultyCount: view.getFaculty().length,
        timetables: view.getTimetables()
    };
}

router.get('/', (req, res) => res.json(summary()));

// Declared before /:id so "primary" is never read as an id.
router.post('/primary', express.json(), (req, res) => {
    const id = req.body && req.body.id;
    if (!id) return res.status(400).json({ error: 'Body must contain { "id": "<timetable id>" }', code: 'NO_ID' });
    if (!registry.setPrimary(id)) {
        return res.status(404).json({ error: `No timetable with id "${id}"`, code: 'NOT_FOUND' });
    }
    res.json({ message: `Primary timetable is now "${id}"`, ...summary() });
});

router.post('/', upload.single('timetable'), async (req, res) => {
    try {
        let source;
        let sourceLabel;

        if (req.file) {
            const parsed = await importer.parseFile(req.file.buffer, req.file.originalname, {
                mimeType: req.file.mimetype
            });
            source = parsed.source;
            sourceLabel = `upload:${req.file.originalname}`;
        } else {
            const body = req.body || {};
            source = body.source;
            sourceLabel = body.sourceLabel || 'api';
            if (!source || typeof source !== 'object') {
                return res.status(400).json({
                    error: 'Provide a timetable file in the "timetable" field, or a JSON body with a "source" object.',
                    code: 'NO_SOURCE'
                });
            }
        }

        const options = {
            id: (req.body && req.body.id) || undefined,
            name: (req.body && req.body.name) || undefined,
            branch: (req.body && req.body.branch) || undefined,
            semester: (req.body && req.body.semester) || undefined,
            section: (req.body && req.body.section) || undefined,
            source: sourceLabel,
            // Reference by default: registering a timetable must never silently
            // steal primary status from the one on screen.
            isPrimary: String((req.body && req.body.isPrimary) || 'false') === 'true'
        };

        const entry = registry.register(source, options);
        res.json({
            message: `Timetable "${entry.id}" registered`,
            timetable: {
                id: entry.id, name: entry.name, branch: entry.branch,
                semester: entry.semester, section: entry.section,
                isPrimary: entry.isPrimary, source: entry.source,
                cellCount: entry.cells.length, facultyCount: entry.faculty.length
            },
            report: entry.report,
            ...summary()
        });
    } catch (err) {
        const status = err.code === 'VALIDATION_FAILED' ? 422 : 400;
        res.status(status).json({
            error: err.message,
            code: err.code || 'REGISTER_FAILED',
            report: err.report || null
        });
    }
});

router.get('/:id', (req, res) => {
    const timetable = registry.view.getTimetable(req.params.id);
    if (!timetable) {
        return res.status(404).json({ error: `No timetable with id "${req.params.id}"`, code: 'NOT_FOUND' });
    }
    res.json(timetable);
});

router.delete('/:id', (req, res) => {
    try {
        if (!registry.unregister(req.params.id)) {
            return res.status(404).json({ error: `No timetable with id "${req.params.id}"`, code: 'NOT_FOUND' });
        }
        res.json({ message: `Timetable "${req.params.id}" removed`, ...summary() });
    } catch (err) {
        res.status(409).json({ error: err.message, code: 'LAST_TIMETABLE' });
    }
});

router.use((req, res) => {
    res.status(404).json({ error: `Unknown timetables endpoint: ${req.method} ${req.originalUrl}` });
});

module.exports = router;
