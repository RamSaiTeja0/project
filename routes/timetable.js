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

// Helper to filter out pure non-timetable noise headers/footers
function isNoiseText(text) {
    if (!text) return true;
    const s = String(text).trim().toLowerCase();
    if (/^(time|timing|timings|period|periods|p\d|hour|hours|sno|slno|sl\.\s*no|total|wef|w\.e\.f|signature|principal|hod)$/i.test(s)) return true;
    return /college\s*name|department\s*of|academic\s*year\s*20|curriculum|prepared\s*by|verified\s*by|principal\s*signature|hod\s*signature|head\s*of\s*department|class\s*in-charge|staff\s*directory|phone\s*no|mobile\s*no|email\s*id|abbreviation\s*list|teacher\s*legend/i.test(s);
}

router.post('/extract-ai', upload.single('timetable_image'), async (req, res) => {
    try {
        const file = req.file || (req.files && req.files[0]);
        if (!file) {
            return res.status(400).json({ error: 'No image or document file uploaded' });
        }

        console.log(`[UPLOAD] Received timetable image: "${file.originalname || 'image'}" (${file.size} bytes, ${file.mimetype})`);

        const apiKey = req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            console.warn('[IMAGE/PDF PROCESSING] Gemini API key not found in header or environment variables.');
            return res.status(400).json({ 
                error: 'Gemini API Key required for AI Vision extraction. Please enter your Gemini API key in the UI or configure GEMINI_API_KEY in your environment.' 
            });
        }

        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey });

        const base64Image = file.buffer.toString('base64');
        const mimeType = file.mimetype || 'image/jpeg';

        console.log('[IMAGE/PDF PROCESSING] Initializing Structure-First 2D Grid Table Vision Analyzer...');

const prompt = `You are a high-precision 2D Grid Table Structure Analyzer and Vision OCR system for institutional academic timetables.
Inspect the uploaded image directly as a physical two-dimensional grid table with spatial rows and columns.

CRITICAL ARCHITECTURAL RULES:
1. DISTINGUISH ACADEMIC PERIODS VS NON-ACADEMIC DIVIDER COLUMNS:
   - Identify every physical column in left-to-right order:
     - Day column (e.g. "Day" / "Days")
     - Special divider/break columns (e.g. "Morning Assembly" 09:40–10:00, "Interval" 11:00–11:10, "Lunch Break" 01:10–01:50, "Tea Break")
     - Academic teaching period columns: Strictly P1, P2, P3, P4, P5, P6 (or P1..PN)
   - Divider columns (Morning Assembly, Interval, Lunch Break) MUST have isBreak: true and type: "divider". They MUST NEVER be numbered as academic periods.
   - For example, if a table has Morning Assembly, then Period 1, then Interval, then Period 2, then Period 3, then Lunch Break, then Period 4, Period 5, Period 6:
     There are EXACTLY 6 academic periods (P1 to P6) and 3 divider columns.

2. PHYSICAL CELL BOUNDARIES & NO FALSE CELL MERGING:
   - In institutional timetables, adjacent cells with similar or identical text (such as "BED P 201/202 VCP/VTV/ACK/RV/SM" in P1 and P2) are separate cells because they have vertical border dividing lines between them.
   - DO NOT merge separate cells together. If Period 1 and Period 2 both contain "BED P 201/202 VCP/VTV/ACK/RV/SM", create TWO separate cell objects: one for P1 (startPeriod: 1, endPeriod: 1, isMerged: false) and one for P2 (startPeriod: 2, endPeriod: 2, isMerged: false).
   - ONLY mark a cell as merged (isMerged: true, colSpan > 1) if the physical table cell box visually spans across multiple column dividers without any separating vertical line (for example, "Lit/Science Club" spanning P4 to P6, or "ANDROID PROG LAB" spanning P5 to P7).

3. STRICT PRESERVATION OF ORIGINAL RECOGNIZED TEXT (NO HALLUCINATION):
   - You MUST extract the EXACT visible text written inside each timetable cell (e.g. "BED P 201/202 VCP/VTV/ACK/RV/SM", "BED C 202 APC", "BED P 202 ACK", "BED C 201 DPV", "PE MK", "LIB", "MUSIC SN", "CITRL/Add-on RV/SN/SM", "Lit/Science Club", "CITRL/Add-on APC/VCP/ACK/DPV", "PYTHON PROG", "ANDROID PROG LAB", etc.).
   - NEVER invent, autocomplete, hallucinate, abbreviate, or substitute timetable subjects.
   - NEVER replace institutional subject codes with generic courses (e.g. DO NOT replace "PE MK" or "BED P 202" with "Embedded Systems", "Operating Systems", etc.).
   - If a cell is genuinely blank or empty, set text: "Free", subject: "Free".

4. EXCLUDE HEADERS & FOOTER METADATA:
   - Keep college title, academic year, Principal/HOD signatures, teacher legend/abbreviations table in "metadata" / "footerNotes", NOT inside timetable cells.

Return STRICT JSON matching this schema:
{
  "title": "Institutional Timetable Title",
  "metadata": {
    "institution": "College / Institute Name",
    "department": "Department / Branch",
    "batch": "Batch / Year",
    "effectiveDate": "W.E.F Date"
  },
  "tableBoundary": { "x": 0, "y": 0, "width": 1000, "height": 800 },
  "columns": [
    { "index": 0, "type": "day", "label": "Day", "timing": "", "isBreak": false },
    { "index": 1, "type": "divider", "label": "Morning Assembly", "timing": "09:40–10:00", "isBreak": true, "beforePeriod": 1, "afterPeriod": 0 },
    { "index": 2, "type": "period", "periodNumber": 1, "label": "P1", "timing": "10:00–11:00", "isBreak": false },
    { "index": 3, "type": "divider", "label": "Interval", "timing": "11:00–11:10", "isBreak": true, "afterPeriod": 1 },
    { "index": 4, "type": "period", "periodNumber": 2, "label": "P2", "timing": "11:10–12:10", "isBreak": false },
    { "index": 5, "type": "period", "periodNumber": 3, "label": "P3", "timing": "12:10–01:10", "isBreak": false },
    { "index": 6, "type": "divider", "label": "Lunch Break", "timing": "01:10–01:50", "isBreak": true, "afterPeriod": 3 },
    { "index": 7, "type": "period", "periodNumber": 4, "label": "P4", "timing": "01:50–02:40", "isBreak": false },
    { "index": 8, "type": "period", "periodNumber": 5, "label": "P5", "timing": "02:40–03:30", "isBreak": false },
    { "index": 9, "type": "period", "periodNumber": 6, "label": "P6", "timing": "03:30–04:00", "isBreak": false }
  ],
  "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  "academicPeriodsCount": 6,
  "periods": [
    { "period": 1, "timing": "10:00–11:00" },
    { "period": 2, "timing": "11:10–12:10" },
    { "period": 3, "timing": "12:10–01:10" },
    { "period": 4, "timing": "01:50–02:40" },
    { "period": 5, "timing": "02:40–03:30" },
    { "period": 6, "timing": "03:30–04:00" }
  ],
  "breaks": [
    { "label": "Morning Assembly", "timing": "09:40–10:00", "beforePeriod": 1, "afterPeriod": 0 },
    { "label": "Interval", "timing": "11:00–11:10", "afterPeriod": 1 },
    { "label": "Lunch Break", "timing": "01:10–01:50", "afterPeriod": 3 }
  ],
  "detectedCells": [
    {
      "day": "Monday",
      "period": 1,
      "startPeriod": 1,
      "endPeriod": 1,
      "rowSpan": 1,
      "colSpan": 1,
      "text": "BED P 201/202 VCP/VTV/ACK/RV/SM",
      "subject": "BED P 201/202 VCP/VTV/ACK/RV/SM",
      "faculty": "VCP/VTV/ACK/RV/SM",
      "room": "Room 101",
      "isMerged": false,
      "confidence": 0.98,
      "bbox": { "x": 180, "y": 140, "width": 110, "height": 45 }
    }
  ],
  "mergedCells": [
    {
      "day": "Friday",
      "startPeriod": 4,
      "endPeriod": 6,
      "colSpan": 3,
      "text": "Lit/Science Club",
      "subject": "Lit/Science Club",
      "confidence": 0.96
    }
  ],
  "footerNotes": "Staff abbreviation table & notes"
}`;

        let parsed = null;
        let attempts = 0;
        let lastError = null;

        const modelNames = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

        for (const modelName of modelNames) {
            if (parsed) break;
            attempts++;
            try {
                console.log(`[IMAGE/PDF PROCESSING] Attempting Gemini model: ${modelName}...`);
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: attempts === 1 ? prompt : `${prompt}\n\nCRITICAL: Distinguish academic periods from divider columns (Morning Assembly, Interval, Lunch Break). DO NOT merge separate period cells P1 and P2.` },
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
                console.log(`[RAW EXTRACTION] Gemini Response length: ${rawJson.length} characters`);
                parsed = JSON.parse(rawJson);
            } catch (callErr) {
                console.warn(`[IMAGE/PDF PROCESSING] Model ${modelName} failed:`, callErr.message);
                lastError = callErr;
                parsed = null;
            }
        }

        if (!parsed) {
            throw new Error(lastError ? lastError.message : 'Could not parse response from AI vision model');
        }

        // ================= STRUCTURED 2D GRID NORMALIZATION =================
        let days = Array.isArray(parsed.days) && parsed.days.length > 0
            ? parsed.days.map(d => String(d).trim()).filter(d => d.length > 0 && !isNoiseText(d))
            : [];

        const rawGridCells = Array.isArray(parsed.detectedCells)
            ? parsed.detectedCells
            : (Array.isArray(parsed.gridCells) ? parsed.gridCells : (Array.isArray(parsed.cells) ? parsed.cells : (Array.isArray(parsed.schedule) ? parsed.schedule : [])));

        const seenDays = new Set(days);
        rawGridCells.forEach(item => {
            if (item && item.day && !seenDays.has(item.day) && !isNoiseText(item.day)) {
                seenDays.add(item.day);
                days.push(item.day);
            }
        });

        if (days.length === 0) {
            days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        }

        console.log('[DETECTED DAYS]', days);

        // Detect Periods dynamically from periods array, columns, and gridCells
        let periods = [];
        let maxPeriod = 1;

        if (Array.isArray(parsed.periods) && parsed.periods.length > 0) {
            parsed.periods.forEach(p => {
                const pNum = parseInt(p.period || p.periodNumber || p.number || 1);
                if (!isNaN(pNum) && pNum > maxPeriod) maxPeriod = pNum;
                periods.push({
                    period: pNum,
                    timing: p.timing ? String(p.timing).trim() : `Period ${pNum}`
                });
            });
        }

        if (Array.isArray(parsed.columns)) {
            parsed.columns.forEach(col => {
                if ((col.type === 'period' || col.periodNumber || /^P\d+$/i.test(col.label || '')) && !col.isBreak) {
                    const m = (col.label || '').match(/(\d+)/);
                    const pNum = parseInt(col.periodNumber || (m ? m[1] : 1));
                    if (!isNaN(pNum) && pNum > maxPeriod) maxPeriod = pNum;
                    if (!periods.some(p => p.period === pNum)) {
                        periods.push({
                            period: pNum,
                            timing: col.timing ? String(col.timing).trim() : `P${pNum}`
                        });
                    }
                }
            });
        }

        rawGridCells.forEach(cell => {
            if (!cell) return;
            const end = parseInt(cell.endPeriod || cell.startPeriod || cell.period || 1);
            if (!isNaN(end) && end > maxPeriod) maxPeriod = end;
        });

        for (let i = 1; i <= maxPeriod; i++) {
            if (!periods.some(p => p.period === i)) {
                periods.push({ period: i, timing: `P${i}` });
            }
        }
        periods.sort((a, b) => a.period - b.period);

        console.log('[DETECTED PERIODS]', periods.map(p => `P${p.period} (${p.timing})`));

        // Isolated Breaks / Dividers
        const rawBreaks = Array.isArray(parsed.breaks) 
            ? parsed.breaks 
            : (Array.isArray(parsed.specialSections) ? parsed.specialSections : []);
        
        const breaks = rawBreaks
            .filter(b => b && (b.label || b.name))
            .map(b => ({
                label: String(b.label || b.name).trim(),
                timing: b.timing ? String(b.timing).trim() : '',
                afterPeriod: parseInt(b.afterPeriod || 0),
                beforePeriod: parseInt(b.beforePeriod || 0)
            }));

        // Intermediate detected cells
        const intermediateCells = [];
        const detectedMerged = [];

        rawGridCells.forEach(c => {
            if (!c || !c.day) return;
            const d = c.day;
            const startP = parseInt(c.startPeriod || c.period || 1);
            const endP = parseInt(c.endPeriod || c.startPeriod || startP);
            const colSpan = parseInt(c.colSpan || (endP - startP + 1) || 1);
            const isMerged = Boolean(c.isMerged || colSpan > 1);
            let subj = String(c.subject || c.text || 'Free').trim().replace(/\s+/g, ' ');

            if (isNoiseText(subj)) {
                subj = 'Free';
            }

            const cellObj = {
                day: d,
                period: startP,
                startPeriod: startP,
                endPeriod: endP,
                rowSpan: parseInt(c.rowSpan || 1),
                colSpan: colSpan,
                text: c.text || subj,
                subject: subj,
                faculty: c.faculty ? String(c.faculty).trim() : '',
                room: c.room ? String(c.room).trim() : 'Room 101',
                isMerged: isMerged,
                confidence: typeof c.confidence === 'number' ? c.confidence : 0.95,
                needsVerification: Boolean(c.needsVerification),
                bbox: c.bbox || null
            };

            intermediateCells.push(cellObj);

            if (isMerged && colSpan > 1) {
                detectedMerged.push({
                    day: d,
                    startPeriod: startP,
                    endPeriod: endP,
                    colSpan: colSpan,
                    text: c.text || subj,
                    subject: subj,
                    confidence: cellObj.confidence
                });
            }
        });

        // Merged cells expansion into normalized individual slots (e.g. Friday P4-P6 -> P4, P5, P6)
        const normalizedSlots = [];
        days.forEach(day => {
            for (let p = 1; p <= maxPeriod; p++) {
                const cell = intermediateCells.find(c => c.day === day && p >= c.startPeriod && p <= c.endPeriod);
                if (cell) {
                    normalizedSlots.push({
                        id: `slot_${day}_${p}`,
                        day: day,
                        period: p,
                        start_time: (periods.find(item => item.period === p) || {}).timing || `P${p}`,
                        end_time: '',
                        subject_code: cell.subject,
                        subject_name: cell.subject,
                        text: cell.text,
                        faculty_name: cell.faculty || 'Assigned Faculty',
                        room: cell.room || 'Room 101',
                        isMerged: cell.isMerged,
                        originalSpan: cell.isMerged ? `P${cell.startPeriod}–P${cell.endPeriod}` : null,
                        confidence: cell.confidence,
                        needsVerification: cell.needsVerification
                    });
                } else {
                    normalizedSlots.push({
                        id: `slot_${day}_${p}`,
                        day: day,
                        period: p,
                        start_time: (periods.find(item => item.period === p) || {}).timing || `P${p}`,
                        end_time: '',
                        subject_code: 'Free',
                        subject_name: 'Free',
                        text: 'Free',
                        faculty_name: '',
                        room: '',
                        isMerged: false,
                        originalSpan: null,
                        confidence: 1.0,
                        needsVerification: false
                    });
                }
            }
        });

        console.log(`[NORMALIZATION] Generated ${normalizedSlots.length} discrete period slots across ${days.length} days (${maxPeriod} periods/day).`);

        res.json({
            success: true,
            title: parsed.title || 'Uploaded Timetable',
            metadata: parsed.metadata || {},
            tableBoundary: parsed.tableBoundary || null,
            columns: parsed.columns || [],
            days,
            periods,
            breaks,
            gridCells: intermediateCells,
            detectedCells: intermediateCells,
            schedule: intermediateCells,
            normalizedSlots: normalizedSlots,
            mergedCells: detectedMerged.length > 0 ? detectedMerged : (parsed.mergedCells || []),
            maxPeriods: maxPeriod,
            rawExtraction: parsed
        });
    } catch (err) {
        console.error('[AI TIMETABLE EXTRACTION ERROR]', err);
        res.status(500).json({ error: 'AI Extraction failed: ' + err.message });
    }
});

module.exports = router;

