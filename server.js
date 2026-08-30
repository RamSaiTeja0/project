const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./database/database'); // In-Memory Temporary Database Engine

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Explicit Public Landing / Home page routes
app.get(['/', '/home', '/home.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Existing Login / Dashboard / App routes
app.get(['/login', '/dashboard', '/app', '/portal'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Primary timetable + faculty availability finder (read-only view)
app.get(['/tecsubstitution', '/timetable'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tecsubstitution.html'));
});

// Serve static assets
app.use('/public', express.static(path.join(__dirname, 'public'), { index: false }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use(express.static(__dirname, { index: false }));

// Session Configuration
app.use(session({
    secret: 'super_secret_faculty_scheduler_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Routes
const authRoutes = require('./routes/auth');
const timetableRoutes = require('./routes/timetable');
const substitutionsRoutes = require('./routes/substitutions');
const availabilityRoutes = require('./routes/availability');
const importRoutes = require('./routes/import');

app.use('/api/auth', authRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/substitutions', substitutionsRoutes);
// Read-only faculty availability lookup (day + period -> FREE faculty).
app.use('/api/availability', availabilityRoutes);
// Timetable import (CSV / Excel / image adapter) -> normalize -> validate.
app.use('/api/import', importRoutes);

// Fallback to serve index.html for unknown routes (SPA like behavior)
app.get('*', (req, res) => {
    // If requesting demo_2 specifically
    if (req.path.includes('demo_2')) {
        return res.sendFile(path.join(__dirname, 'demo_2.html'));
    }
    // If requesting root or home
    if (req.path === '/' || req.path === '/home') {
        return res.sendFile(path.join(__dirname, 'public', 'home.html'));
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is currently busy. Reconnecting...`);
    } else {
        console.error('Server error:', err);
    }
});
