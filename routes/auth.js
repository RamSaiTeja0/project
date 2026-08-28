const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../database/database');
const { requireAuth } = require('../middleware/auth');

// Empty users list (All users must register through database)
const DEMO_USERS = [];

// Login API
router.post('/login', async (req, res) => {
    const { faculty_id, password } = req.body;
    
    if (!faculty_id || !password) {
        return res.status(400).json({ error: 'Faculty ID and password required' });
    }

    const cleanFacultyId = String(faculty_id).trim().toUpperCase();
    const cleanPassword = String(password).trim();

    try {
        const result = await pool.query('SELECT * FROM users WHERE UPPER(TRIM(faculty_id)) = $1', [cleanFacultyId]);
        const user = result.rows && result.rows[0];

        if (!user) {
            return res.status(401).json({ error: `No account found for ID "${cleanFacultyId}". Please click 'Create Account' to register.` });
        }

        // Verify password against database hash
        const isMatch = user.password_hash ? bcrypt.compareSync(cleanPassword, user.password_hash) : false;

        if (isMatch) {
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
            return res.status(401).json({ error: 'Invalid password. Please try again.' });
        }
    } catch (err) {
        console.error('Login database error:', err);
        return res.status(500).json({ error: 'Database error during login' });
    }
});

// Register / Sign Up API
router.post('/register', async (req, res) => {
    const { faculty_id, full_name, email, phone, department, role, password } = req.body;

    if (!faculty_id || !full_name || !password) {
        return res.status(400).json({ error: 'Faculty ID, Full Name, and Password are required.' });
    }

    const cleanFacultyId = String(faculty_id).trim().toUpperCase();
    const cleanFullName = String(full_name).trim();
    const cleanEmail = email ? String(email).trim() : `${cleanFacultyId.toLowerCase()}@college.edu`;
    const cleanPhone = phone ? String(phone).trim() : '9876543210';
    const cleanDept = department ? String(department).trim() : 'CSE';
    const cleanRole = (role && role.toLowerCase() === 'hos') ? 'hos' : 'faculty';
    const cleanPassword = String(password).trim();

    try {
        // 1. Strict Duplicate Check on Faculty/HOS ID (Case-Insensitive)
        const existingId = await pool.query('SELECT * FROM users WHERE UPPER(TRIM(faculty_id)) = $1', [cleanFacultyId]);
        if (existingId.rows && existingId.rows.length > 0) {
            return res.status(400).json({ 
                error: `⚠️ ID "${cleanFacultyId}" already exists! Another account with the same ID cannot be created (applies to Faculty and HOS).` 
            });
        }

        const demoExistingId = DEMO_USERS.find(u => u.faculty_id && u.faculty_id.toUpperCase() === cleanFacultyId);
        if (demoExistingId) {
            return res.status(400).json({ 
                error: `⚠️ ID "${cleanFacultyId}" already exists! Another account with the same ID cannot be created (applies to Faculty and HOS).` 
            });
        }

        // 2. Duplicate Check on Full Name (Case-Insensitive)
        const existingName = await pool.query('SELECT * FROM users WHERE UPPER(TRIM(full_name)) = $1', [cleanFullName.toUpperCase()]);
        if (existingName.rows && existingName.rows.length > 0) {
            return res.status(400).json({ 
                error: `⚠️ An account with the name "${cleanFullName}" already exists! Please use a unique name or sign in.` 
            });
        }

        const password_hash = bcrypt.hashSync(cleanPassword, 10);
        
        await pool.query(
            `INSERT INTO users (faculty_id, full_name, email, phone, department, role, password_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [cleanFacultyId, cleanFullName, cleanEmail, cleanPhone, cleanDept, cleanRole, password_hash]
        );

        // Retrieve created user from database
        const userRes = await pool.query(
            `SELECT id, faculty_id, full_name, role FROM users WHERE UPPER(TRIM(faculty_id)) = $1`,
            [cleanFacultyId]
        );

        const newUser = (userRes.rows && userRes.rows[0]) ? userRes.rows[0] : {
            id: Date.now(),
            faculty_id: cleanFacultyId,
            full_name: cleanFullName,
            role: cleanRole
        };

        DEMO_USERS.push({
            id: newUser.id,
            faculty_id: cleanFacultyId,
            full_name: cleanFullName,
            email: cleanEmail,
            phone: cleanPhone,
            department: cleanDept,
            role: cleanRole,
            password_hash
        });

        req.session.userId = newUser.id;
        req.session.faculty_id = newUser.faculty_id;
        req.session.role = newUser.role;
        req.session.full_name = newUser.full_name;

        return res.json({
            message: 'Registration successful! Account saved to database.',
            user: {
                id: newUser.id,
                faculty_id: newUser.faculty_id,
                full_name: newUser.full_name,
                role: newUser.role
            }
        });
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ error: 'Database registration error: ' + err.message });
    }
});

// Logout API
router.post('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy();
    }
    res.json({ message: 'Logged out successfully' });
});

// Current User Info API
router.get('/me', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            id: req.session.userId,
            faculty_id: req.session.faculty_id,
            role: req.session.role,
            full_name: req.session.full_name
        });
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

module.exports = router;

