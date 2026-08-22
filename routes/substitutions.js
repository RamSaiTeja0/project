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
        const timetableEntryRes = await pool.query('SELECT day, period FROM timetable WHERE id = $1', [timetable_id]);
        const timetableEntry = timetableEntryRes.rows[0];
        
        if (!timetableEntry) {
            return res.status(404).json({ error: 'Timetable entry not found' });
        }

        const isBusyRes = await pool.query(`
            SELECT 1 FROM timetable WHERE faculty_id = $1 AND day = $2 AND period = $3
        `, [substitute_faculty_id, timetableEntry.day, timetableEntry.period]);

        if (isBusyRes.rows.length > 0) {
            return res.status(400).json({ error: 'Selected faculty is busy at this time' });
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

// Get my substitute duties
router.get('/my-duties', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.date, t.day, t.period, t.start_time, t.end_time, t.room,
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

module.exports = router;
