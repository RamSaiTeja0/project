/**
 * Timetable import API.
 *
 *   POST /api/import/preview  parse + validate an uploaded file, return what
 *                             WOULD be loaded. Changes nothing.
 *   POST /api/import/commit   same, then load it into the in-memory store.
 *   GET  /api/import/formats  supported formats and image-adapter status.
 *
 * Import is the only place the loaded timetable can change, and only on an
 * explicit commit. The availability API remains read-only.
 */
const express = require('express');
const multer = require('multer');
const router = express.Router();

const importer = require('../data/import');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

function describeError(err) {
    return {
        error: err.message,
        code: err.code || 'IMPORT_FAILED',
        report: err.report || null
    };
}

router.get('/formats', (req, res) => {
    res.json({
        supported: importer.SUPPORTED,
        csv: { ready: true, header: 'Day,Period,Subject,Faculty,Class,Room[,SpanTo]' },
        excel: { ready: true, note: '.xlsx only; legacy .xls must be re-saved as .xlsx' },
        image: {
            ready: importer.imageImporter.hasExtractionBackend(),
            note: 'Adapter in place; no extraction backend registered yet.'
        }
    });
});

function handleUpload(action) {
    return async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded. Send a file in the "timetable" field.', code: 'NO_FILE' });
        }
        try {
            const result = await importer[action](req.file.buffer, req.file.originalname, {
                mimeType: req.file.mimetype
            });
            res.json({
                filename: req.file.originalname,
                format: result.format,
                loaded: Boolean(result.loaded),
                meta: result.meta,
                faculty: result.faculty,
                report: result.report,
                preview: result.preview
            });
        } catch (err) {
            const status = err.code === 'VALIDATION_FAILED' ? 422 : 400;
            res.status(status).json(describeError(err));
        }
    };
}

router.post('/preview', upload.single('timetable'), handleUpload('preview'));
router.post('/commit', upload.single('timetable'), handleUpload('commit'));

router.use((req, res) => {
    res.status(404).json({ error: `Unknown import endpoint: ${req.method} ${req.originalUrl}` });
});

module.exports = router;
