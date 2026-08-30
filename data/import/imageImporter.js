/**
 * Image timetable importer — ADAPTER ONLY. Extraction is NOT implemented.
 *
 * This file defines the boundary a future vision/extraction backend plugs into.
 * It deliberately does not extract anything: the previous OCR implementation
 * produced unreliable grids, and a wrong cell here silently produces wrong
 * availability results. Reporting "not implemented" is correct; guessing is not.
 *
 * To add extraction later, implement a backend with this contract:
 *
 *   async extract(buffer, mimeType, options) -> {
 *     source: <timetable source object, same shape as data/timetable-source.json>,
 *     confidence?: number,
 *     issues?: Array<{severity, code, message, context}>
 *   }
 *
 * and register it with `setExtractionBackend(backend)`. Nothing downstream —
 * normalizer, validator, store, availability API, frontend — needs to change,
 * because the backend returns the same source object the JSON file provides.
 */

const FORMAT = 'image';

let extractionBackend = null;

/** Register a vision/extraction backend. Pass null to unregister. */
function setExtractionBackend(backend) {
    if (backend != null && typeof backend.extract !== 'function') {
        throw new Error('An image extraction backend must expose an async extract(buffer, mimeType, options) method');
    }
    extractionBackend = backend;
}

function hasExtractionBackend() {
    return extractionBackend != null;
}

async function parse(input, options = {}) {
    if (!extractionBackend) {
        const error = new Error(
            'Image timetable extraction is not implemented. The adapter is in place, but no ' +
            'extraction backend is registered, so no timetable can be produced from an image yet. ' +
            'Import the timetable as CSV or Excel, or register a backend via ' +
            'imageImporter.setExtractionBackend().');
        error.code = 'IMAGE_EXTRACTION_NOT_IMPLEMENTED';
        error.format = FORMAT;
        throw error;
    }

    const result = await extractionBackend.extract(input, options.mimeType || null, options);
    if (!result || typeof result !== 'object' || !result.source) {
        const error = new Error('Image extraction backend returned no timetable source');
        error.code = 'IMAGE_EXTRACTION_FAILED';
        throw error;
    }

    return {
        source: result.source,
        format: FORMAT,
        rowCount: null,
        confidence: typeof result.confidence === 'number' ? result.confidence : null,
        issues: Array.isArray(result.issues) ? result.issues : []
    };
}

module.exports = { parse, setExtractionBackend, hasExtractionBackend, FORMAT };
