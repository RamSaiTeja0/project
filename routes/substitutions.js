const express = require('express');
const router = express.Router();
const db = require('../database/database');
const { requireAuth, requireFaculty } = require('../middleware/auth');

// Get available (FREE) faculty for a specific day and period
router.get('/available', requireAuth, (req, res) => {
    const { date, day, period } = req.query;

    if (!date || !day || !period) {
        return res.status(400).json({ error: 'date, day, and period are required' });
    }

    try {
        // Find all faculty members who DO NOT have a class in the timetable for the given day and period
        // Also ensure they are not already assigned as a substitute for that date and period.
        
        const availableFaculty = db.prepare(`
            SELECT u.id, u.faculty_id, u.full_name, u.department
            FROM users u
            WHERE u.role = 'faculty'
            AND u.id NOT IN (
                -- Busy in official timetable
                SELECT faculty_id FROM timetable WHERE day = ? AND period = ?
            )
            AND u.id NOT IN (
                -- Already assigned as a substitute for another class on this exact date and period
                SELECT substitute_faculty_id 
                FROM substitutions s
                JOIN timetable t ON s.timetable_id = t.id
                WHERE s.date = ? AND t.period = ?
            )
        `).all(day, period, date, period);
        
        res.json(availableFaculty);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error while checking availability' });
    }
});

// Assign a substitute
router.post('/assign', requireAuth, (req, res) => {
    const { timetable_id, date, substitute_faculty_id } = req.body;
    const original_faculty_id = req.session.userId; // the logged in user requesting substitution

    if (!timetable_id || !date || !substitute_faculty_id) {
        return res.status(400).json({ error: 'timetable_id, date, and substitute_faculty_id required' });
    }

    try {
        // Double check if substitute is actually free
        const timetableEntry = db.prepare('SELECT day, period FROM timetable WHERE id = ?').get(timetable_id);
        if (!timetableEntry) {
            return res.status(404).json({ error: 'Timetable entry not found' });
        }

        const isBusy = db.prepare(`
            SELECT 1 FROM timetable WHERE faculty_id = ? AND day = ? AND period = ?
        `).get(substitute_faculty_id, timetableEntry.day, timetableEntry.period);

        if (isBusy) {
            return res.status(400).json({ error: 'Selected faculty is busy at this time' });
        }

        const stmt = db.prepare(`
            INSERT INTO substitutions (timetable_id, date, original_faculty_id, substitute_faculty_id, status)
            VALUES (?, ?, ?, ?, 'assigned')
        `);
        const info = stmt.run(timetable_id, date, original_faculty_id, substitute_faculty_id);
        
        res.json({ message: 'Substitute assigned successfully', id: info.lastInsertRowid });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get my substitute duties
router.get('/my-duties', requireAuth, (req, res) => {
    try {
        const duties = db.prepare(`
            SELECT s.date, t.day, t.period, t.start_time, t.end_time, t.room,
                   sub.subject_name, b.branch_name,
                   orig.full_name as original_faculty_name
            FROM substitutions s
            JOIN timetable t ON s.timetable_id = t.id
            JOIN subjects sub ON t.subject_id = sub.id
            JOIN branches b ON t.branch_id = b.id
            JOIN users orig ON s.original_faculty_id = orig.id
            WHERE s.substitute_faculty_id = ?
            ORDER BY s.date ASC, t.period ASC
        `).all(req.session.userId);
        
        res.json(duties);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
