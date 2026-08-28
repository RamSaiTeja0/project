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

// ================= AI VISION TIMETABLE 2D GRID EXTRACTION =================
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Helper to filter out header/footer noise from subjects
function isNoiseText(text) {
    if (!text) return true;
    const s = String(text).trim().toLowerCase();
    if (/^(day|days|time|timing|timings|period|periods|p\d|hour|hours|sno|slno|sl\.\s*no|total|room|wef|w\.e\.f|sem|semester)$/i.test(s)) return true;
    return /college|department|academic\s*year|curriculum|shift|prepared\s*by|verified\s*by|signature|principal|hod|head\s*of|class\s*in-charge|staff\s*list|faculty\s*name|phone|mobile|email|abbreviation|legend|note:|instruction/i.test(s);
}

router.post('/extract-ai', upload.single('timetable_image'), async (req, res) => {
    try {
        const file = req.file || (req.files && req.files[0]);
        if (!file) {
            return res.status(400).json({ error: 'No image or document file uploaded' });
        }

        const apiKey = req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return res.status(400).json({ 
                error: 'Gemini API Key required for AI Vision extraction. Please enter your Gemini API key in the UI or configure GEMINI_API_KEY in your environment.' 
            });
        }

        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey });

        const base64Image = file.buffer.toString('base64');
        const mimeType = file.mimetype || 'image/jpeg';

const prompt = `You are a high-precision 2D Grid Table Structure Analyzer and Vision OCR system for academic timetables.
Inspect the uploaded image directly as a physical two-dimensional grid table with rows and columns.

CRITICAL ARCHITECTURE & EXTRACTION RULES:
1. Dynamic Structure Understanding:
   - Identify Day Row Labels (e.g. Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, etc.). Extract only days physically present in the table.
   - Identify Teaching Period Columns across the header (e.g. 1 to N, or P1..PN). Extract the exact period number (1, 2, 3...) and its timing string (e.g. "08:00-08:45").
   - DO NOT hardcode 7 periods or Monday-Saturday. Adapt dynamically to whatever grid is in the image.
   - Identify dedicated Break / Interval / Lunch columns and record them in "breaks". Do NOT treat lunch/interval as a subject.
2. Complete Isolation of Grid Content:
   - Completely IGNORE all text outside the physical timetable table grid: college headers, logos, address, academic year, HOD/Principal signatures, teacher phone number lists, abbreviation/subject mapping tables at bottom.
3. Merged Cells / Multi-Period Labs:
   - When a laboratory, subject, or activity visually spans multiple period columns (e.g. across P5 to P7 in a day row):
     - Record this in "mergedCells" with "day", "startPeriod", "endPeriod", and "subject".
     - In the "cells" array, you MUST populate EVERY period covered (e.g. Period 5 = Lab, Period 6 = Lab, Period 7 = Lab).
4. Cell-Based Mapping (Day × Period):
   - For every single (Day, Period) grid intersection, extract the exact subject visible inside that cell.
   - If a cell is visually empty or marked free/dash, set subject to "Free".
   - If you are uncertain about a cell or text is partially cut/blurry, set "needsVerification": true.
5. Zero Hallucination:
   - Extract strictly what is present in the table. Do not guess or invent missing subjects.

Output STRICT JSON conforming to this schema without markdown:
{
  "title": "Document title if visible",
  "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  "periods": [
    { "period": 1, "timing": "08:00–08:45" },
    { "period": 2, "timing": "08:45–09:30" }
  ],
  "breaks": [
    { "label": "Break", "afterPeriod": 3, "timing": "10:15–10:30" }
  ],
  "cells": [
    {
      "day": "Monday",
      "period": 1,
      "startPeriod": 1,
      "endPeriod": 1,
      "subject": "PYTHON PROG",
      "needsVerification": false
    }
  ],
  "mergedCells": [
    {
      "day": "Monday",
      "startPeriod": 5,
      "endPeriod": 7,
      "subject": "ANDROID PROG LAB"
    }
  ]
}`;

        let parsed = null;
        let attempts = 0;
        let lastError = null;

        // Try gemini-2.5-flash with fallback
        const modelNames = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];

        for (const modelName of modelNames) {
            if (parsed) break;
            attempts++;
            try {
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: attempts === 1 ? prompt : `${prompt}\n\nIMPORTANT: Return ALL day rows and ALL period columns 1..N. Inspect every grid intersection.` },
                                {
                                    inlineData: {
                                        data: base64Image,
                                        mimeType: mimeType
                                    }
                                }
                            ]
                        }
                    ],
                    config: {
                        responseMimeType: 'application/json'
                    }
                });

                const rawJson = (response.text || '').trim();
                parsed = JSON.parse(rawJson);
            } catch (callErr) {
                lastError = callErr;
                parsed = null;
            }
        }

        if (!parsed) {
            throw new Error(lastError ? lastError.message : 'Could not parse response from AI vision model');
        }

        // ================= 2D GRID NORMALIZATION & VALIDATION =================
        let days = Array.isArray(parsed.days) && parsed.days.length > 0
            ? parsed.days.map(d => String(d).trim()).filter(d => d.length > 0 && !isNoiseText(d))
            : [];

        const seenDays = new Set(days);
        const rawCells = Array.isArray(parsed.cells) ? parsed.cells : (Array.isArray(parsed.schedule) ? parsed.schedule : (Array.isArray(parsed.grid) ? parsed.grid : []));
        rawCells.forEach(item => {
            if (item && item.day && !seenDays.has(item.day) && !isNoiseText(item.day)) {
                seenDays.add(item.day);
                days.push(item.day);
            }
        });
        const mergedCells = Array.isArray(parsed.mergedCells) ? parsed.mergedCells : [];
        mergedCells.forEach(item => {
            if (item && item.day && !seenDays.has(item.day) && !isNoiseText(item.day)) {
                seenDays.add(item.day);
                days.push(item.day);
            }
        });

        if (days.length === 0) {
            days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        }

        // Detect teaching periods
        let maxPeriod = 1;
        let periods = [];
        if (Array.isArray(parsed.periods) && parsed.periods.length > 0) {
            parsed.periods.forEach(p => {
                const pNum = parseInt(p.period || p.number || 1);
                if (!isNaN(pNum) && pNum > maxPeriod) maxPeriod = pNum;
                periods.push({
                    period: pNum,
                    timing: p.timing ? String(p.timing).trim() : `Period ${pNum}`
                });
            });
        }

        rawCells.forEach(cell => {
            if (!cell) return;
            const p = parseInt(cell.period || cell.endPeriod || cell.startPeriod || 1);
            if (!isNaN(p) && p > maxPeriod) maxPeriod = p;
        });

        mergedCells.forEach(cell => {
            if (!cell) return;
            const p = parseInt(cell.endPeriod || cell.startPeriod || 1);
            if (!isNaN(p) && p > maxPeriod) maxPeriod = p;
        });

        // Ensure periods covers 1..maxPeriod sequentially
        for (let i = 1; i <= maxPeriod; i++) {
            if (!periods.some(p => p.period === i)) {
                periods.push({ period: i, timing: `P${i}` });
            }
        }
        periods.sort((a, b) => a.period - b.period);

        // Build 2D Grid map [day][period]
        const gridMap = {};
        days.forEach(d => {
            gridMap[d] = {};
            for (let p = 1; p <= maxPeriod; p++) {
                gridMap[d][p] = {
                    day: d,
                    period: p,
                    startPeriod: p,
                    endPeriod: p,
                    subject: 'Free',
                    room: 'Room 101',
                    faculty: '',
                    needsVerification: false
                };
            }
        });

        // Populate cells
        rawCells.forEach(cell => {
            if (!cell || !cell.day) return;
            const d = cell.day;
            if (!gridMap[d]) return;

            const start = parseInt(cell.startPeriod || cell.period || 1);
            const end = parseInt(cell.endPeriod || cell.startPeriod || cell.period || start);
            let subj = cell.subject ? String(cell.subject).trim().replace(/\s+/g, ' ') : 'Free';

            if (isNoiseText(subj)) {
                subj = 'Free';
            }

            for (let p = start; p <= end; p++) {
                if (gridMap[d][p]) {
                    gridMap[d][p].subject = subj;
                    gridMap[d][p].startPeriod = start;
                    gridMap[d][p].endPeriod = end;
                    gridMap[d][p].needsVerification = Boolean(cell.needsVerification);
                    if (cell.room) gridMap[d][p].room = String(cell.room).trim();
                    if (cell.faculty) gridMap[d][p].faculty = String(cell.faculty).trim();
                }
            }
        });

        // Overlay mergedCells explicitly & expand across all spanned periods
        mergedCells.forEach(cell => {
            if (!cell || !cell.day || !cell.subject) return;
            const d = cell.day;
            if (!gridMap[d]) return;

            const start = parseInt(cell.startPeriod || 1);
            const end = parseInt(cell.endPeriod || start);
            let subj = String(cell.subject).trim().replace(/\s+/g, ' ');

            if (isNoiseText(subj)) {
                return;
            }

            for (let p = start; p <= end; p++) {
                if (gridMap[d][p]) {
                    gridMap[d][p].subject = subj;
                    gridMap[d][p].startPeriod = start;
                    gridMap[d][p].endPeriod = end;
                }
            }
        });

        // Flatten into normalized schedule array
        const normalizedSchedule = [];
        days.forEach(d => {
            for (let p = 1; p <= maxPeriod; p++) {
                const item = gridMap[d][p];
                if (item && item.subject && item.subject.toUpperCase() !== 'FREE' && item.subject !== '-') {
                    normalizedSchedule.push(item);
                }
            }
        });

        // Special sections (Morning Assembly, Interval, Lunch Break)
        const rawSpecial = Array.isArray(parsed.specialSections) ? parsed.specialSections : (Array.isArray(parsed.breaks) ? parsed.breaks : []);
        const specialSections = rawSpecial
            .filter(b => b && b.label && /assembly|interval|lunch|break|recess|tea/i.test(b.label))
            .map(b => ({
                label: String(b.label).trim(),
                afterPeriod: parseInt(b.afterPeriod || 0),
                timing: b.timing ? String(b.timing).trim() : ''
            }));

        res.json({
            success: true,
            title: parsed.title || 'Uploaded Timetable',
            days,
            periods,
            breaks: specialSections,
            schedule: normalizedSchedule,
            mergedCells,
            maxPeriods: maxPeriod
        });
    } catch (err) {
        console.error('AI Timetable Extraction Error:', err);
        res.status(500).json({ error: 'AI Extraction failed: ' + err.message });
    }
});

module.exports = router;
