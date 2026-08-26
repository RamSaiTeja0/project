const express = require('express');
const router = express.Router();
const pool = require('../database/database');
const { requireAuth, requireFaculty } = require('../middleware/auth');

// Get available (FREE) faculty for a specific day and period
router.get('/available', requireAuth, async (req, res) => {
    const { date, day, period } = req.query;

    if (!date || !day || !period) {
        return res.status(400).json({ error: 'date, day, and period are required' });
    }

    try {
        const result = await pool.query(`
            SELECT u.id, u.faculty_id, u.full_name, u.department
            FROM users u
            WHERE u.role = 'faculty'
            AND u.id NOT IN (
                -- Busy in official timetable
                SELECT faculty_id FROM timetable WHERE day = $1 AND period = $2
            )
            AND u.id NOT IN (
                -- Already assigned as a substitute for another class on this exact date and period
                SELECT substitute_faculty_id 
                FROM substitutions s
                JOIN timetable t ON s.timetable_id = t.id
                WHERE s.date = $3 AND t.period = $4
            )
        `, [day, period, date, period]);

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error while checking availability' });
    }
});

// Assign a substitute
router.post('/assign', requireAuth, async (req, res) => {
    const { timetable_id, date, substitute_faculty_id } = req.body;
    const original_faculty_id = req.session.userId;

    if (!timetable_id || !date || !substitute_faculty_id) {
        return res.status(400).json({ error: 'timetable_id, date, and substitute_faculty_id required' });
    }

    try {
        const timetableEntryRes = await pool.query('SELECT day, period, faculty_id FROM timetable WHERE id = $1', [timetable_id]);
        const timetableEntry = timetableEntryRes.rows[0];

        if (!timetableEntry) {
            return res.status(404).json({ error: 'Timetable entry not found' });
        }

        // Permission check: either HOS or the faculty teaching this period
        if (req.session.role !== 'hos' && timetableEntry.faculty_id !== req.session.userId) {
            return res.status(403).json({ error: 'You can only request substitutes for your own classes' });
        }

        const original_faculty_id = timetableEntry.faculty_id;

        // Check if substitute has a class in the official timetable
        const isBusyTimetable = await pool.query(`
            SELECT 1 FROM timetable WHERE faculty_id = $1 AND day = $2 AND period = $3
        `, [substitute_faculty_id, timetableEntry.day, timetableEntry.period]);

        if (isBusyTimetable.rows.length > 0) {
            return res.status(400).json({ error: 'Selected faculty has a scheduled class at this time' });
        }

        // Check if substitute is already assigned as a substitute on this date & period
        const isBusySub = await pool.query(`
            SELECT 1 FROM substitutions s
            JOIN timetable t ON s.timetable_id = t.id
            WHERE s.substitute_faculty_id = $1 AND s.date = $2 AND t.period = $3
        `, [substitute_faculty_id, date, timetableEntry.period]);

        if (isBusySub.rows.length > 0) {
            return res.status(400).json({ error: 'Selected faculty is already assigned as a substitute for another class at this time' });
        }

        const result = await pool.query(`
            INSERT INTO substitutions (timetable_id, date, original_faculty_id, substitute_faculty_id, status)
            VALUES ($1, $2, $3, $4, 'assigned') RETURNING id
        `, [timetable_id, date, original_faculty_id, substitute_faculty_id]);

        res.json({ message: 'Substitute assigned successfully', id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get my substitute duties (duties assigned to me as substitute)
router.get('/my-duties', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.id, s.status, s.date, t.day, t.period, t.start_time, t.end_time, t.room,
                   sub.subject_name, b.branch_name,
                   orig.full_name as original_faculty_name
            FROM substitutions s
            JOIN timetable t ON s.timetable_id = t.id
            JOIN subjects sub ON t.subject_id = sub.id
            JOIN branches b ON t.branch_id = b.id
            JOIN users orig ON s.original_faculty_id = orig.id
            WHERE s.substitute_faculty_id = $1
            ORDER BY s.date ASC, t.period ASC
        `, [req.session.userId]);

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get my substitution requests (classes I requested someone else to take)
router.get('/my-requests', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.id, s.date, s.status, t.day, t.period, t.start_time, t.end_time, t.room,
                   sub.subject_name, b.branch_name,
                   sub_fac.full_name as substitute_faculty_name,
                   sub_fac.faculty_id as substitute_faculty_code
            FROM substitutions s
            JOIN timetable t ON s.timetable_id = t.id
            JOIN subjects sub ON t.subject_id = sub.id
            JOIN branches b ON t.branch_id = b.id
            JOIN users sub_fac ON s.substitute_faculty_id = sub_fac.id
            WHERE s.original_faculty_id = $1
            ORDER BY s.date DESC, t.period ASC
        `, [req.session.userId]);

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Update substitution status (e.g., substitute clicks checkbox when taking the class)
router.post('/status/:id', requireAuth, async (req, res) => {
    const { status } = req.body;
    const substitutionId = req.params.id;

    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    try {
        const subRes = await pool.query(`
            SELECT substitute_faculty_id FROM substitutions WHERE id = $1
        `, [substitutionId]);

        if (subRes.rows.length === 0) {
            return res.status(404).json({ error: 'Substitution duty not found' });
        }

        const duty = subRes.rows[0];
        if (req.session.role !== 'hos' && duty.substitute_faculty_id !== req.session.userId) {
            return res.status(403).json({ error: 'Only the assigned substitute teacher or HOS can update status' });
        }

        await pool.query(`
            UPDATE substitutions SET status = $1 WHERE id = $2
        `, [status, substitutionId]);

        res.json({ message: 'Duty status updated successfully', status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET substitute details for a timetable slot (for click-to-view popup)
router.get('/detail/:timetable_id', requireAuth, async (req, res) => {
    const { timetable_id } = req.params;
    const { date } = req.query; // optional date param (YYYY-MM-DD), defaults to today

    const targetDate = date || new Date().toISOString().split('T')[0];

    try {
        // Get the timetable entry + original faculty phone
        const slotRes = await pool.query(`
            SELECT t.id, t.day, t.period, t.start_time, t.end_time, t.room,
                   s.subject_name, s.subject_code,
                   u.full_name as faculty_name, u.phone as faculty_phone, u.id as faculty_id
            FROM timetable t
            JOIN subjects s ON t.subject_id = s.id
            JOIN users u ON t.faculty_id = u.id
            WHERE t.id = $1
        `, [timetable_id]);

        if (slotRes.rows.length === 0) {
            return res.status(404).json({ error: 'Timetable slot not found' });
        }

        const slot = slotRes.rows[0];

        // Check if there is a substitution assigned for this slot on the given date
        const subRes = await pool.query(`
            SELECT sub.id, sub.status, sub.date,
                   sf.full_name as substitute_name, sf.phone as substitute_phone,
                   sf.department as substitute_dept
            FROM substitutions sub
            JOIN users sf ON sub.substitute_faculty_id = sf.id
            WHERE sub.timetable_id = $1 AND sub.date = $2
            ORDER BY sub.created_at DESC
            LIMIT 1
        `, [timetable_id, targetDate]);

        res.json({
            slot,
            substitution: subRes.rows.length > 0 ? subRes.rows[0] : null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;

