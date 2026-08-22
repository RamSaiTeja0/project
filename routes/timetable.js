const express = require('express');
const router = express.Router();
const db = require('../database/database');
const { requireAuth, requireHOS } = require('../middleware/auth');

// Get all branches (for dropdowns)
router.get('/branches', requireAuth, (req, res) => {
    try {
        const branches = db.prepare('SELECT id, branch_name, year, section FROM branches').all();
        res.json(branches);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Get timetable for a specific branch
router.get('/:branch_id', requireAuth, (req, res) => {
    try {
        const timetable = db.prepare(`
            SELECT t.id, t.day, t.period, t.start_time, t.end_time, t.room,
                   s.subject_code, s.subject_name,
                   u.full_name as faculty_name, u.id as faculty_id
            FROM timetable t
            JOIN subjects s ON t.subject_id = s.id
            JOIN users u ON t.faculty_id = u.id
            WHERE t.branch_id = ?
            ORDER BY 
              CASE t.day 
                WHEN 'Monday' THEN 1 
                WHEN 'Tuesday' THEN 2 
                WHEN 'Wednesday' THEN 3 
                WHEN 'Thursday' THEN 4 
                WHEN 'Friday' THEN 5 
                WHEN 'Saturday' THEN 6 
              END, t.period ASC
        `).all(req.params.branch_id);
        
        res.json(timetable);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Add a new period to the timetable (HOS only)
router.post('/', requireHOS, (req, res) => {
    const { branch_id, day, period, start_time, end_time, subject_id, faculty_id, room } = req.body;
    
    try {
        const stmt = db.prepare(`
            INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(branch_id, day, period, start_time, end_time, subject_id, faculty_id, room);
        res.json({ message: 'Period added', id: info.lastInsertRowid });
    } catch (err) {
        res.status(500).json({ error: 'Database error or conflict' });
    }
});

// Update a period (HOS only)
router.put('/:id', requireHOS, (req, res) => {
    const { subject_id, faculty_id, room } = req.body;
    
    try {
        const stmt = db.prepare(`
            UPDATE timetable SET subject_id = ?, faculty_id = ?, room = ?
            WHERE id = ?
        `);
        stmt.run(subject_id, faculty_id, room, req.params.id);
        res.json({ message: 'Period updated' });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
