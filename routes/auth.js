const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/database');
const { requireAuth } = require('../middleware/auth');

// Login API
router.post('/login', (req, res) => {
    const { faculty_id, password } = req.body;
    
    if (!faculty_id || !password) {
        return res.status(400).json({ error: 'Faculty ID and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE faculty_id = ?').get(faculty_id);

    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    if (bcrypt.compareSync(password, user.password_hash)) {
        req.session.userId = user.id;
        req.session.faculty_id = user.faculty_id;
        req.session.role = user.role;
        req.session.full_name = user.full_name;

        return res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                faculty_id: user.faculty_id,
                full_name: user.full_name,
                role: user.role
            }
        });
    } else {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Logout API
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out successfully' });
});

// Current User Info API
router.get('/me', requireAuth, (req, res) => {
    res.json({
        id: req.session.userId,
        faculty_id: req.session.faculty_id,
        role: req.session.role,
        full_name: req.session.full_name
    });
});

module.exports = router;
