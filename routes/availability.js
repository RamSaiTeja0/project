/**
 * Availability API — read-only.
 *
 * Given a day + period (taken from a clicked primary-timetable cell), returns
 * the faculty who are FREE at that exact slot. Nothing here writes to the
 * timetable, the faculty roster, or any other store: no substitute is assigned
 * and no selection is persisted.
 */
const express = require('express');
const router = express.Router();
const timetableStore = require('../data/timetableStore');

/** Resolve + validate a day/period pair against the loaded timetable. */
function resolveSlot(store, rawDay, rawPeriod) {
    const day = store.normalizeDay(rawDay);
    if (!day) {
        return { error: `Unknown or missing day "${rawDay == null ? '' : rawDay}". Valid days: ${store.getDays().join(', ')}` };
    }

    const period = store.normalizePeriod(rawPeriod);
    if (period == null) {
        return { error: `Unknown or missing period "${rawPeriod == null ? '' : rawPeriod}". Valid periods: ${store.getPeriods().join(', ')}` };
    }

    return { day, period };
}

/** Shared handler for both POST /api/availability and GET /api/availability. */
function handleAvailability(rawDay, rawPeriod, rawExclude, res) {
    const store = timetableStore.current;
    const slot = resolveSlot(store, rawDay, rawPeriod);

    if (slot.error) {
        return res.status(400).json({ error: slot.error });
    }

    const { day, period } = slot;
    const exclude = rawExclude ? String(rawExclude).trim() : null;
    const available = store.getAvailableFaculty(day, period, exclude);
    const busy = store.getSlot(day, period).busy;

    res.json({
        day,
        period,
        // Primary contract: plain names, for direct display in the frontend.
        availableFaculty: available.map(f => f.faculty),
        // Supplementary detail so the UI can show ids and why someone is unavailable.
        available,
        busy: busy.map(r => ({
            faculty: r.faculty,
            facultyId: r.facultyId,
            class: r.class,
            subject: r.subject,
            room: r.room
        })),
        excluded: exclude || null
    });
}

// Timetable metadata: days, periods, faculty roster, class list.
router.get('/meta', (req, res) => {
    const store = timetableStore.current;
    res.json({
        ...store.getMeta(),
        faculty: store.getFaculty()
    });
});

// The primary timetable grid that the frontend renders and the user clicks.
router.get('/timetable', (req, res) => {
    res.json(timetableStore.current.getPrimaryTimetable());
});

// Full FREE/BUSY breakdown for one slot — used for verification and debugging.
router.get('/slot/:day/:period', (req, res) => {
    const store = timetableStore.current;
    const slot = resolveSlot(store, req.params.day, req.params.period);
    if (slot.error) {
        return res.status(400).json({ error: slot.error });
    }
    const detail = store.getSlot(slot.day, slot.period);
    res.json({
        day: slot.day,
        period: slot.period,
        free: detail.free.map(r => ({ faculty: r.faculty, facultyId: r.facultyId, status: r.status })),
        busy: detail.busy.map(r => ({
            faculty: r.faculty,
            facultyId: r.facultyId,
            status: r.status,
            class: r.class,
            subject: r.subject,
            room: r.room
        }))
    });
});

// Core endpoint. Body carries the clicked cell's metadata; only day + period matter.
router.post('/', (req, res) => {
    const body = req.body || {};
    handleAvailability(body.day, body.period, body.excludeFaculty || body.faculty, res);
});

// Same query over GET, for quick browser/curl checks.
router.get('/', (req, res) => {
    handleAvailability(req.query.day, req.query.period, req.query.excludeFaculty || req.query.faculty, res);
});

// Keep unknown sub-paths under /api/availability as JSON rather than the SPA fallback.
router.use((req, res) => {
    res.status(404).json({ error: `Unknown availability endpoint: ${req.method} ${req.originalUrl}` });
});

module.exports = router;
