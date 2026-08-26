const express = require('express');
const router = express.Router();
const pool = require('../database/database');
const { requireAuth, requireHOS } = require('../middleware/auth');

// Get all branches (for dropdowns)
router.get('/branches', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, branch_name, year, section FROM branches');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Get timetable for a specific branch
router.get('/:branch_id', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.id, t.day, t.period, t.start_time, t.end_time, t.room,
                   s.subject_code, s.subject_name,
                   u.full_name as faculty_name, u.id as faculty_id, u.phone as faculty_phone
            FROM timetable t
            JOIN subjects s ON t.subject_id = s.id
            JOIN users u ON t.faculty_id = u.id
            WHERE t.branch_id = $1
            ORDER BY 
              CASE t.day 
                WHEN 'Monday' THEN 1 
                WHEN 'Tuesday' THEN 2 
                WHEN 'Wednesday' THEN 3 
                WHEN 'Thursday' THEN 4 
                WHEN 'Friday' THEN 5 
                WHEN 'Saturday' THEN 6 
              END, t.period ASC
        `, [req.params.branch_id]);

        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Add a new period to the timetable (HOS only)
router.post('/', requireHOS, async (req, res) => {
    const { branch_id, day, period, start_time, end_time, subject_id, faculty_id, room } = req.body;

    try {
        const result = await pool.query(`
            INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
        `, [branch_id, day, period, start_time, end_time, subject_id, faculty_id, room]);

        res.json({ message: 'Period added', id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: 'Database error or conflict' });
    }
});

// Update a period (HOS only)
router.put('/:id', requireHOS, async (req, res) => {
    const { subject_id, faculty_id, room } = req.body;

    try {
        await pool.query(`
            UPDATE timetable SET subject_id = $1, faculty_id = $2, room = $3
            WHERE id = $4
        `, [subject_id, faculty_id, room, req.params.id]);

        res.json({ message: 'Period updated' });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
