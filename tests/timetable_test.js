const assert = require('assert');

function toFullSubjectName(raw) {
    if (!raw) return '';
    const clean = String(raw).trim().replace(/\s+/g, ' ');
    if (!clean || clean.toUpperCase() === 'FREE' || clean === '-') return 'Free';
    return clean;
}

function matchDayName(token) {
    if (!token) return null;
    const str = String(token).trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    if (/^(mon|monday|mo|m0n|mndy|day1|1mon|1monday)$/i.test(str) || str.startsWith('mon')) return 'Monday';
    if (/^(tue|tues|tuesday|tu|t|tuesd|day2|2tue|2tuesday)$/i.test(str) || str.startsWith('tue')) return 'Tuesday';
    if (/^(wed|wednes|wednesday|we|w|wdnsdy|day3|3wed|3wednesday)$/i.test(str) || str.startsWith('wed')) return 'Wednesday';
    if (/^(thu|thur|thurs|thursday|th|thrsdy|day4|4thu|4thursday)$/i.test(str) || str.startsWith('thu')) return 'Thursday';
    if (/^(fri|friday|fr|f|fridy|day5|5fri|5friday)$/i.test(str) || str.startsWith('fri')) return 'Friday';
    if (/^(sat|satur|saturday|sa|st|strdy|day6|6sat|6saturday)$/i.test(str) || str.startsWith('sat')) return 'Saturday';
    if (/^(sun|sunday|su|sndy|day7|7sun|7sunday)$/i.test(str) || str.startsWith('sun')) return 'Sunday';
    return null;
}

function isHeaderNoise(text) {
    if (!text) return true;
    const s = String(text).toLowerCase();
    return /college\s*name|department\s*of|academic\s*year\s*20|curriculum|prepared\s*by|verified\s*by|principal\s*signature|hod\s*signature|head\s*of\s*department|class\s*in-charge|staff\s*directory|phone\s*no|mobile\s*no|email\s*id|abbreviation\s*list|teacher\s*legend/i.test(s);
}

function cleanSubjectText(raw) {
    if (!raw) return '';
    let val = String(raw).trim()
        .replace(/^[^a-zA-Z0-9&/()+-]+|[^a-zA-Z0-9&/()+-]+$/g, '')
        .replace(/\s+/g, ' ');

    const lower = val.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/^(day|days|time|timing|period|periods|p\d|hour|hours|sno|slno|total|wef|w\.?e\.?f)$/i.test(lower)) return '';
    if (/^\d{1,2}[.:]\d{2}/.test(val)) return '';

    return toFullSubjectName(val);
}

function parseOcrSpatialGeometry(ocrData) {
    if (!ocrData || !Array.isArray(ocrData.words) || ocrData.words.length < 5) {
        return { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], periods: [], breaks: [], gridCells: [], schedule: [], normalizedSlots: [], mergedCells: [], maxPeriods: 6 };
    }

    const words = ocrData.words.filter(w => w && w.bbox && w.text && w.text.trim().length > 0);
    const ORDERED_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Step 1: Detect Day Tokens & Compute Row Geometric Pitch
    const dayWordCandidates = [];
    words.forEach(w => {
        const day = matchDayName(w.text);
        if (day && w.bbox) {
            const cy = (w.bbox.y0 + w.bbox.y1) / 2;
            const cx = (w.bbox.x0 + w.bbox.x1) / 2;
            dayWordCandidates.push({ day, cy, cx, bbox: w.bbox });
        }
    });

    const detectedDayMap = {};
    dayWordCandidates.forEach(cand => {
        if (!detectedDayMap[cand.day] || cand.cx < detectedDayMap[cand.day].cx) {
            detectedDayMap[cand.day] = cand;
        }
    });

    const detectedDayList = Object.keys(detectedDayMap).sort((a, b) => detectedDayMap[a].cy - detectedDayMap[b].cy);

    let rowPitch = 70;
    if (detectedDayList.length >= 2) {
        const pitches = [];
        for (let i = 0; i < detectedDayList.length - 1; i++) {
            const d1 = detectedDayList[i];
            const d2 = detectedDayList[i + 1];
            const idx1 = ORDERED_DAYS.indexOf(d1);
            const idx2 = ORDERED_DAYS.indexOf(d2);
            if (idx1 !== -1 && idx2 !== -1 && idx2 > idx1) {
                pitches.push((detectedDayMap[d2].cy - detectedDayMap[d1].cy) / (idx2 - idx1));
            }
        }
        if (pitches.length > 0) {
            pitches.sort((a, b) => a - b);
            rowPitch = pitches[Math.floor(pitches.length / 2)];
        }
    } else {
        const maxY = Math.max(...words.map(w => w.bbox.y1));
        const minY = Math.min(...words.map(w => w.bbox.y0));
        rowPitch = Math.max(50, Math.round((maxY - minY) / 8));
    }

    let refDay = detectedDayList[0] || 'Monday';
    let refIdx = ORDERED_DAYS.indexOf(refDay);
    if (refIdx === -1) { refDay = 'Monday'; refIdx = 0; }
    let refY = detectedDayMap[refDay] ? detectedDayMap[refDay].cy : (Math.min(...words.map(w => w.bbox.y0)) + rowPitch * 1.5);

    const rowCenters = {};
    const finalDays = detectedDayList.length >= 5 ? detectedDayList : ORDERED_DAYS;
    finalDays.forEach((day, idx) => {
        if (detectedDayMap[day]) {
            rowCenters[day] = detectedDayMap[day].cy;
        } else {
            rowCenters[day] = refY + (idx - refIdx) * rowPitch;
        }
    });

    // Step 2: Separate Header Region from Data Rows & Segment Columns
    const tableTopY = rowCenters[finalDays[0]] - rowPitch * 0.55;
    const headerRegionWords = words.filter(w => {
        if (isHeaderNoise(w.text)) return false;
        const cy = (w.bbox.y0 + w.bbox.y1) / 2;
        return cy < tableTopY && cy > (tableTopY - rowPitch * 1.8);
    });

    const detectedColumns = [];
    const detectedBreaks = [];

    // 2A: Detect Academic Periods
    headerRegionWords.forEach(w => {
        const txt = w.text.trim();
        const m = txt.match(/^(?:p|period\s*)([1-9])$/i);
        if (m) {
            const pNum = parseInt(m[1]);
            const cx = (w.bbox.x0 + w.bbox.x1) / 2;
            if (!detectedColumns.some(c => c.type === 'period' && c.periodNumber === pNum)) {
                detectedColumns.push({ type: 'period', periodNumber: pNum, label: `P${pNum}`, cx, x0: w.bbox.x0, x1: w.bbox.x1, isBreak: false });
            }
        }
    });

    if (detectedColumns.filter(c => c.type === 'period').length < 3) {
        headerRegionWords.forEach(w => {
            const txt = w.text.trim();
            const m = txt.match(/^([1-9])$/);
            if (m) {
                const pNum = parseInt(m[1]);
                const cx = (w.bbox.x0 + w.bbox.x1) / 2;
                if (!detectedColumns.some(c => c.type === 'period' && c.periodNumber === pNum)) {
                    detectedColumns.push({ type: 'period', periodNumber: pNum, label: `P${pNum}`, cx, x0: w.bbox.x0, x1: w.bbox.x1, isBreak: false });
                }
            }
        });
    }

    // 2B: Detect Special Divider Columns
    headerRegionWords.forEach(w => {
        const txt = w.text.trim().toLowerCase();
        const cx = (w.bbox.x0 + w.bbox.x1) / 2;
        if (/assembly|morning/i.test(txt) && !detectedColumns.some(c => c.label === 'Morning Assembly')) {
            detectedColumns.push({ type: 'divider', label: 'Morning Assembly', isBreak: true, beforePeriod: 1, afterPeriod: 0, cx, x0: w.bbox.x0, x1: w.bbox.x1 });
            detectedBreaks.push({ label: 'Morning Assembly', timing: '09:40–10:00', beforePeriod: 1, afterPeriod: 0 });
        } else if (/interval|recess|teabreak/i.test(txt) && !detectedColumns.some(c => c.label === 'Interval')) {
            detectedColumns.push({ type: 'divider', label: 'Interval', isBreak: true, afterPeriod: 1, cx, x0: w.bbox.x0, x1: w.bbox.x1 });
            detectedBreaks.push({ label: 'Interval', timing: '11:00–11:10', afterPeriod: 1 });
        } else if (/lunch/i.test(txt) && !detectedColumns.some(c => c.label === 'Lunch Break')) {
            detectedColumns.push({ type: 'divider', label: 'Lunch Break', isBreak: true, afterPeriod: 3, cx, x0: w.bbox.x0, x1: w.bbox.x1 });
            detectedBreaks.push({ label: 'Lunch Break', timing: '01:10–01:50', afterPeriod: 3 });
        } else if (/break/i.test(txt) && !detectedColumns.some(c => c.label === 'Break')) {
            detectedColumns.push({ type: 'divider', label: 'Break', isBreak: true, afterPeriod: 3, cx, x0: w.bbox.x0, x1: w.bbox.x1 });
            detectedBreaks.push({ label: 'Break', timing: '10:15–10:30', afterPeriod: 3 });
        }
    });

    detectedColumns.sort((a, b) => a.cx - b.cx);

    const periodCols = detectedColumns.filter(c => c.type === 'period').sort((a, b) => a.periodNumber - b.periodNumber);
    let maxP = periodCols.length > 0 ? Math.max(...periodCols.map(p => p.periodNumber)) : 6;
    if (maxP < 5) maxP = 6;

    // Step 2C: Build Strict Non-Overlapping Column Channels
    const allPhysicalCols = [...detectedColumns].sort((a, b) => a.cx - b.cx);
    for (let i = 0; i < allPhysicalCols.length; i++) {
        const col = allPhysicalCols[i];
        const prevCol = i > 0 ? allPhysicalCols[i - 1] : null;
        const nextCol = i < allPhysicalCols.length - 1 ? allPhysicalCols[i + 1] : null;

        col.left = prevCol ? (prevCol.cx + col.cx) / 2 : (col.x0 - 20);
        col.right = nextCol ? (col.cx + nextCol.cx) / 2 : (col.x1 + 20);
    }

    const academicColBounds = allPhysicalCols.filter(c => c.type === 'period').map(c => ({
        period: c.periodNumber,
        label: `P${c.periodNumber}`,
        cx: c.cx,
        x0: c.x0,
        x1: c.x1,
        left: c.left,
        right: c.right
    }));

    const dividerColBounds = allPhysicalCols.filter(c => c.type === 'divider').map(c => ({
        label: c.label,
        isBreak: true,
        cx: c.cx,
        x0: c.x0,
        x1: c.x1,
        left: c.left,
        right: c.right
    }));

    // Step 3: Map Body Words strictly by 2D Channel Containment
    const gridCells = [];
    const mergedCells = [];

    const tableBottomY = rowCenters[finalDays[finalDays.length - 1]] + rowPitch * 0.6;
    const bodyWords = words.filter(w => {
        if (isHeaderNoise(w.text)) return false;
        const cy = (w.bbox.y0 + w.bbox.y1) / 2;
        const cx = (w.bbox.x0 + w.bbox.x1) / 2;
        return cy >= tableTopY && cy <= tableBottomY && cx > (academicColBounds[0] ? academicColBounds[0].left - 40 : 100);
    });

    finalDays.forEach(day => {
        const rCy = rowCenters[day];

        const rowWords = bodyWords.filter(w => {
            const cy = (w.bbox.y0 + w.bbox.y1) / 2;
            let closestDay = finalDays[0];
            let minDist = Math.abs(rowCenters[closestDay] - cy);
            for (const d of finalDays) {
                const dist = Math.abs(rowCenters[d] - cy);
                if (dist < minDist) {
                    minDist = dist;
                    closestDay = d;
                }
            }
            return closestDay === day && minDist < rowPitch * 0.65;
        });

        const periodWords = {};
        for (let p = 1; p <= maxP; p++) periodWords[p] = [];

        const avgColWidth = academicColBounds.length > 0 ? (academicColBounds[0].right - academicColBounds[0].left) : 100;

        rowWords.forEach(w => {
            const x0 = w.bbox.x0;
            const x1 = w.bbox.x1;
            const cx = (x0 + x1) / 2;

            // Check if word falls in a divider channel (Morning Assembly, Interval, Lunch Break)
            const inDivider = dividerColBounds.some(db => cx >= db.left && cx <= db.right);
            if (inDivider) return;

            let assignedP = null;
            const isWideBox = (x1 - x0) > avgColWidth * 1.2;

            if (isWideBox) {
                // For wide merged boxes, determine starting period by left edge x0
                for (const ab of academicColBounds) {
                    if (x0 >= ab.left - 20 && x0 <= ab.right) {
                        assignedP = ab.period;
                        break;
                    }
                }
            }

            if (!assignedP) {
                for (const ab of academicColBounds) {
                    if (cx >= ab.left && cx <= ab.right) {
                        assignedP = ab.period;
                        break;
                    }
                }
            }

            if (!assignedP) {
                let minDist = Infinity;
                for (const ab of academicColBounds) {
                    const dist = Math.abs(ab.cx - cx);
                    if (dist < minDist) {
                        minDist = dist;
                        assignedP = ab.period;
                    }
                }
            }

            if (assignedP && periodWords[assignedP]) {
                periodWords[assignedP].push(w);
            }
        });

        let p = 1;
        while (p <= maxP) {
            const pW = periodWords[p] || [];
            if (pW.length === 0) {
                p++;
                continue;
            }

            pW.sort((a, b) => a.bbox.x0 - b.bbox.x0);
            let cellText = pW.map(w => w.text).join(' ').trim();
            let startPeriod = p;
            let endPeriod = p;

            const minX = Math.min(...pW.map(w => w.bbox.x0));
            const maxX = Math.max(...pW.map(w => w.bbox.x1));
            const pSpanWidth = maxX - minX;

            const currentCol = academicColBounds.find(cb => cb.period === p);
            const singleColWidth = currentCol ? (currentCol.right - currentCol.left) : 100;

            if (pSpanWidth > singleColWidth * 1.5) {
                for (let checkP = p + 1; checkP <= maxP; checkP++) {
                    const targetCb = academicColBounds.find(cb => cb.period === checkP);
                    const nextPWords = periodWords[checkP] || [];
                    if (targetCb && maxX >= targetCb.left + 20 && nextPWords.length === 0) {
                        endPeriod = checkP;
                    }
                }
            }

            const colSpan = endPeriod - startPeriod + 1;
            const clean = cleanSubjectText(cellText);
            if (clean && clean.toUpperCase() !== 'FREE' && clean !== '-') {
                const isMerged = colSpan > 1;
                if (isMerged) {
                    mergedCells.push({
                        day,
                        startPeriod,
                        endPeriod,
                        colSpan,
                        rowSpan: 1,
                        text: cellText,
                        subject: clean,
                        confidence: 0.96
                    });
                }

                gridCells.push({
                    day,
                    colIndex: startPeriod,
                    period: startPeriod,
                    startPeriod,
                    endPeriod,
                    rowSpan: 1,
                    colSpan,
                    text: cellText,
                    subject: clean,
                    room: 'Room 101',
                    faculty: '',
                    isMerged: isMerged,
                    confidence: 0.98,
                    needsVerification: false,
                    bbox: { x: minX, y: rCy - rowPitch * 0.45, width: maxX - minX, height: rowPitch * 0.9 }
                });
            }
            p = endPeriod + 1;
        }
    });

    const normalizedSlots = [];
    finalDays.forEach(day => {
        for (let p = 1; p <= maxP; p++) {
            const cell = gridCells.find(c => c.day === day && p >= c.startPeriod && p <= c.endPeriod);
            if (cell) {
                normalizedSlots.push({
                    id: `slot_${day}_${p}`,
                    day: day,
                    period: p,
                    start_time: (academicColBounds.find(cb => cb.period === p) || {}).label || `P${p}`,
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
                    start_time: `P${p}`,
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

    const defaultBreaks = [
        { label: 'Morning Assembly', timing: '09:40–10:00', beforePeriod: 1, afterPeriod: 0 },
        { label: 'Interval', timing: '11:00–11:10', afterPeriod: 1 },
        { label: 'Lunch Break', timing: '01:10–01:50', afterPeriod: 3 }
    ];

    const periods = Array.from({ length: maxP }, (_, i) => ({ period: i + 1, timing: `P${i + 1}` }));
    return {
        title: 'Uploaded Timetable',
        tableBoundary: {
            x: academicColBounds[0] ? academicColBounds[0].left - 40 : 40,
            y: tableTopY,
            width: academicColBounds[maxP - 1] ? (academicColBounds[maxP - 1].right - academicColBounds[0].left + 80) : 800,
            height: rowCenters[finalDays[finalDays.length - 1]] - tableTopY + rowPitch
        },
        columns: allPhysicalCols,
        days: finalDays,
        periods,
        breaks: detectedBreaks.length > 0 ? detectedBreaks : defaultBreaks,
        gridCells,
        detectedCells: gridCells,
        schedule: gridCells,
        normalizedSlots,
        mergedCells,
        maxPeriods: maxP
    };
}

function validateTimetableStructure(data) {
    if (!data) {
        return { isValid: false, status: 'INVALID', errors: ['No data'] };
    }

    const errors = [];
    const warnings = [];
    const days = Array.isArray(data.days) ? data.days : [];
    const cells = Array.isArray(data.gridCells) ? data.gridCells : (Array.isArray(data.schedule) ? data.schedule : []);
    const maxPeriods = data.maxPeriods || 6;

    if (days.length === 0) {
        errors.push('No academic days detected');
    } else if (days.length < 5) {
        errors.push(`Timetable extraction incomplete: Only ${days.length} days detected`);
    }

    // Anti-False Merge Check
    let falseMergeCount = 0;
    cells.forEach(c => {
        if (c.colSpan >= 4 && c.startPeriod === 1) {
            falseMergeCount++;
            errors.push(`Structural Error: Cell "${c.subject}" falsely merged across P${c.startPeriod}–P${c.endPeriod}.`);
        }
    });

    let outOfBoundsCount = 0;
    cells.forEach(c => {
        if (!c.day || !days.includes(c.day)) {
            outOfBoundsCount++;
            errors.push(`Cell "${c.subject}" mapped to invalid day: "${c.day}"`);
        }
        if (c.period < 1 || c.startPeriod < 1 || c.endPeriod > maxPeriods) {
            outOfBoundsCount++;
            errors.push(`Cell "${c.subject}" has period range (P${c.startPeriod}–P${c.endPeriod}) exceeding detected periods (P1–P${maxPeriods})`);
        }
    });

    let emptyDays = 0;
    days.forEach(day => {
        const count = cells.filter(c => c.day === day && c.subject && c.subject.toUpperCase() !== 'FREE').length;
        if (count === 0) emptyDays++;
    });
    if (emptyDays > 0) {
        errors.push(`Severe data omission: ${emptyDays} academic day(s) have zero extracted subjects.`);
    }

    const isValid = errors.length === 0;
    return {
        isValid,
        status: isValid ? 'VALID' : 'INVALID',
        summary: {
            daysCount: days.length,
            periodsCount: maxPeriods,
            totalCells: days.length * maxPeriods,
            occupiedCells: cells.length,
            mergedCount: (data.mergedCells || []).length,
            breaksCount: (data.breaks || []).length
        },
        warnings,
        errors
    };
}

console.log('Running automated structure-first timetable pipeline tests...\n');

// ================= TEST 1: Kannur Salafi B.Ed. Timetable Ground Truth (6 Days, 6 Periods, 3 Breaks, 36 Slots) =================
console.log('Test 1: Kannur Salafi B.Ed. Timetable Ground Truth Verification');
const kannurWords = [
    // Header Row: Physical columns with Assembly, Interval, Lunch Break
    { text: 'Morning Assembly', bbox: { x0: 140, y0: 80, x1: 210, y1: 120 } },
    { text: 'P1', bbox: { x0: 220, y0: 80, x1: 300, y1: 120 } },
    { text: 'Interval', bbox: { x0: 310, y0: 80, x1: 350, y1: 120 } },
    { text: 'P2', bbox: { x0: 360, y0: 80, x1: 440, y1: 120 } },
    { text: 'P3', bbox: { x0: 460, y0: 80, x1: 540, y1: 120 } },
    { text: 'Lunch Break', bbox: { x0: 550, y0: 80, x1: 600, y1: 120 } },
    { text: 'P4', bbox: { x0: 610, y0: 80, x1: 690, y1: 120 } },
    { text: 'P5', bbox: { x0: 710, y0: 80, x1: 790, y1: 120 } },
    { text: 'P6', bbox: { x0: 810, y0: 80, x1: 890, y1: 120 } },

    // Day Labels: MON..SAT (All 6 Days)
    { text: 'MON', bbox: { x0: 40, y0: 150, x1: 110, y1: 180 } },
    { text: 'TUE', bbox: { x0: 40, y0: 230, x1: 110, y1: 260 } },
    { text: 'WED', bbox: { x0: 40, y0: 310, x1: 110, y1: 340 } },
    { text: 'THU', bbox: { x0: 40, y0: 390, x1: 110, y1: 420 } },
    { text: 'FRI', bbox: { x0: 40, y0: 470, x1: 110, y1: 500 } },
    { text: 'SAT', bbox: { x0: 40, y0: 550, x1: 110, y1: 580 } },

    // Monday (P1 & P2 MUST be two separate cells with colSpan: 1)
    { text: 'BED P 201/202 VCP/VTV/ACK/RV/SM', bbox: { x0: 225, y0: 150, x1: 295, y1: 180 } }, // P1
    { text: 'BED P 201/202 VCP/VTV/ACK/RV/SM', bbox: { x0: 365, y0: 150, x1: 435, y1: 180 } }, // P2
    { text: 'BED C 202 APC', bbox: { x0: 465, y0: 150, x1: 535, y1: 180 } },                  // P3
    { text: 'BED P 202 ACK', bbox: { x0: 615, y0: 150, x1: 685, y1: 180 } },                  // P4
    { text: 'BED C 201 DPV', bbox: { x0: 715, y0: 150, x1: 785, y1: 180 } },                  // P5
    { text: 'LIB', bbox: { x0: 815, y0: 150, x1: 885, y1: 180 } },                            // P6

    // Tuesday:
    { text: 'BED P 202 ACK', bbox: { x0: 225, y0: 230, x1: 295, y1: 260 } },                  // P1
    { text: 'BED C 201 DPV', bbox: { x0: 365, y0: 230, x1: 435, y1: 260 } },                  // P2
    { text: 'BED C 202 APC', bbox: { x0: 465, y0: 230, x1: 535, y1: 260 } },                  // P3
    { text: 'BED P 201/202 VCP/VTV/ACK/RV/SM', bbox: { x0: 615, y0: 230, x1: 685, y1: 260 } }, // P4
    { text: 'PE MK', bbox: { x0: 715, y0: 230, x1: 785, y1: 260 } },                          // P5
    { text: 'LIB', bbox: { x0: 815, y0: 230, x1: 885, y1: 260 } },                            // P6

    // Wednesday:
    { text: 'BED C 201 DPV', bbox: { x0: 225, y0: 310, x1: 295, y1: 340 } },                  // P1
    { text: 'BED P 201/202 VCP/VTV/ACK/RV/SM', bbox: { x0: 365, y0: 310, x1: 435, y1: 340 } }, // P2
    { text: 'BED P 201/202 VCP/VTV/ACK/RV/SM', bbox: { x0: 465, y0: 310, x1: 535, y1: 340 } }, // P3
    { text: 'BED C 202 APC', bbox: { x0: 615, y0: 310, x1: 685, y1: 340 } },                  // P4
    { text: 'BED P 202 ACK', bbox: { x0: 715, y0: 310, x1: 785, y1: 340 } },                  // P5
    { text: 'MUSIC SN', bbox: { x0: 815, y0: 310, x1: 885, y1: 340 } },                        // P6

    // Thursday:
    { text: 'BED C 201 DPV', bbox: { x0: 225, y0: 390, x1: 295, y1: 420 } },                  // P1
    { text: 'BED P 202 ACK', bbox: { x0: 365, y0: 390, x1: 435, y1: 420 } },                  // P2
    { text: 'BED P 201/202 VCP/VTV/ACK/RV/SM', bbox: { x0: 465, y0: 390, x1: 535, y1: 420 } }, // P3
    { text: 'BED P 201/202 VCP/VTV/ACK/RV/SM', bbox: { x0: 615, y0: 390, x1: 685, y1: 420 } }, // P4
    { text: 'PE MK', bbox: { x0: 715, y0: 390, x1: 785, y1: 420 } },                          // P5
    { text: 'CITRL/Add-on RV/SN/SM', bbox: { x0: 815, y0: 390, x1: 885, y1: 420 } },          // P6

    // Friday (P4-P6 is merged "Lit/Science Club" [615..885]):
    { text: 'BED C 202 APC', bbox: { x0: 225, y0: 470, x1: 295, y1: 500 } },                  // P1
    { text: 'BED C 201 DPV', bbox: { x0: 365, y0: 470, x1: 435, y1: 500 } },                  // P2
    { text: 'BED P 201/202 VCP/VTV/ACK/RV/SM', bbox: { x0: 465, y0: 470, x1: 535, y1: 500 } }, // P3
    { text: 'Lit/Science Club', bbox: { x0: 615, y0: 470, x1: 885, y1: 500 } },                // P4-P6 merged span

    // Saturday:
    { text: 'BED C 202 APC', bbox: { x0: 225, y0: 550, x1: 295, y1: 580 } },                  // P1
    { text: 'BED C 201 DPV', bbox: { x0: 365, y0: 550, x1: 435, y1: 580 } },                  // P2
    { text: 'BED P 202 ACK', bbox: { x0: 465, y0: 550, x1: 535, y1: 580 } },                  // P3
    { text: 'BED P 201/202 VCP/VTV/ACK/RV/SM', bbox: { x0: 615, y0: 550, x1: 685, y1: 580 } }, // P4
    { text: 'BED P 201/202 VCP/VTV/ACK/RV/SM', bbox: { x0: 715, y0: 550, x1: 785, y1: 580 } }, // P5
    { text: 'CITRL/Add-on APC/VCP/ACK/DPV', bbox: { x0: 815, y0: 550, x1: 885, y1: 580 } }   // P6
];

const res1 = parseOcrSpatialGeometry({ words: kannurWords });

// Assertions:
assert.strictEqual(res1.days.length, 6, 'Must extract all 6 academic days (Mon-Sat)');
assert.strictEqual(res1.maxPeriods, 6, 'Must extract exactly 6 academic periods');
assert.strictEqual(res1.breaks.length, 3, 'Must detect exactly 3 divider/break columns (Assembly, Interval, Lunch Break)');
assert.strictEqual(res1.normalizedSlots.length, 36, 'Must generate exactly 36 normalized academic slots (6 days x 6 periods)');

// Check Monday P1 and P2 are SEPARATE cells
const monP1 = res1.gridCells.find(c => c.day === 'Monday' && c.period === 1);
const monP2 = res1.gridCells.find(c => c.day === 'Monday' && c.period === 2);
assert(monP1, 'Monday P1 must exist');
assert(monP2, 'Monday P2 must exist');
assert.strictEqual(monP1.colSpan, 1, 'Monday P1 must have colSpan: 1 (NEVER merged with P2)');
assert.strictEqual(monP2.colSpan, 1, 'Monday P2 must have colSpan: 1');
assert.strictEqual(monP1.isMerged, false, 'Monday P1 isMerged must be false');
assert.strictEqual(monP2.isMerged, false, 'Monday P2 isMerged must be false');
assert.strictEqual(monP1.subject, 'BED P 201/202 VCP/VTV/ACK/RV/SM');
assert.strictEqual(monP2.subject, 'BED P 201/202 VCP/VTV/ACK/RV/SM');

// Check Monday P3..P6
const monP3 = res1.gridCells.find(c => c.day === 'Monday' && c.period === 3);
const monP4 = res1.gridCells.find(c => c.day === 'Monday' && c.period === 4);
const monP5 = res1.gridCells.find(c => c.day === 'Monday' && c.period === 5);
const monP6 = res1.gridCells.find(c => c.day === 'Monday' && c.period === 6);
assert.strictEqual(monP3.subject, 'BED C 202 APC');
assert.strictEqual(monP4.subject, 'BED P 202 ACK');
assert.strictEqual(monP5.subject, 'BED C 201 DPV');
assert.strictEqual(monP6.subject, 'LIB');

// Check Friday P4-P6 merged span
const friP4 = res1.gridCells.find(c => c.day === 'Friday' && c.period === 4);
assert(friP4, 'Friday P4 must exist');
assert.strictEqual(friP4.colSpan, 3, 'Friday P4 must have colSpan: 3 spanning P4-P6');
assert.strictEqual(friP4.startPeriod, 4);
assert.strictEqual(friP4.endPeriod, 6);
assert.strictEqual(friP4.isMerged, true);
assert.strictEqual(friP4.subject, 'Lit/Science Club');

// Check Friday normalized slots P4, P5, P6
const friSlot4 = res1.normalizedSlots.find(s => s.day === 'Friday' && s.period === 4);
const friSlot5 = res1.normalizedSlots.find(s => s.day === 'Friday' && s.period === 5);
const friSlot6 = res1.normalizedSlots.find(s => s.day === 'Friday' && s.period === 6);
assert.strictEqual(friSlot4.subject_code, 'Lit/Science Club');
assert.strictEqual(friSlot5.subject_code, 'Lit/Science Club');
assert.strictEqual(friSlot6.subject_code, 'Lit/Science Club');
assert.strictEqual(friSlot4.isMerged, true);
assert.strictEqual(friSlot5.isMerged, true);
assert.strictEqual(friSlot6.isMerged, true);

// Validation Check:
const valResult1 = validateTimetableStructure(res1);
assert.strictEqual(valResult1.isValid, true, 'Validation must pass with 0 errors');
assert.strictEqual(valResult1.errors.length, 0, 'Zero errors expected');

console.log('✓ Test 1 Passed: Kannur Salafi B.Ed. Ground Truth fully matched (36 slots, 6 periods, 3 breaks, P1/P2 independent).');

// ================= TEST 2: General 7-Period Institutional Timetable (6 Days, 7 Periods, 1 Break, 42 Slots) =================
console.log('\nTest 2: General 7-Period Timetable (42 slots, break after P3, multi-period lab)');
const general7PWords = [
    // Header Row: P1..P7 + Break after P3
    { text: 'P1', bbox: { x0: 120, y0: 50, x1: 200, y1: 90 } },
    { text: 'P2', bbox: { x0: 210, y0: 50, x1: 290, y1: 90 } },
    { text: 'P3', bbox: { x0: 300, y0: 50, x1: 380, y1: 90 } },
    { text: 'Break', bbox: { x0: 390, y0: 50, x1: 440, y1: 90 } },
    { text: 'P4', bbox: { x0: 450, y0: 50, x1: 530, y1: 90 } },
    { text: 'P5', bbox: { x0: 540, y0: 50, x1: 620, y1: 90 } },
    { text: 'P6', bbox: { x0: 630, y0: 50, x1: 710, y1: 90 } },
    { text: 'P7', bbox: { x0: 720, y0: 50, x1: 800, y1: 90 } },

    // Day Labels
    { text: 'Monday', bbox: { x0: 20, y0: 120, x1: 100, y1: 150 } },
    { text: 'Tuesday', bbox: { x0: 20, y0: 180, x1: 100, y1: 210 } },
    { text: 'Wednesday', bbox: { x0: 20, y0: 240, x1: 100, y1: 270 } },
    { text: 'Thursday', bbox: { x0: 20, y0: 300, x1: 100, y1: 330 } },
    { text: 'Friday', bbox: { x0: 20, y0: 360, x1: 100, y1: 390 } },
    { text: 'Saturday', bbox: { x0: 20, y0: 420, x1: 100, y1: 450 } },

    // Monday: P1=PYTHON, P2=PYTHON (separate cells), P3=IMEP, P4=BDCC, P5-P7=ANDROID LAB (merged)
    { text: 'PYTHON PROG', bbox: { x0: 125, y0: 120, x1: 195, y1: 150 } },
    { text: 'PYTHON PROG', bbox: { x0: 215, y0: 120, x1: 285, y1: 150 } },
    { text: 'IM & EP', bbox: { x0: 305, y0: 120, x1: 375, y1: 150 } },
    { text: 'BD & CC', bbox: { x0: 455, y0: 120, x1: 525, y1: 150 } },
    { text: 'ANDROID PROG LAB', bbox: { x0: 545, y0: 120, x1: 795, y1: 150 } }, // P5-P7 merged span

    // Tuesday: P1..P7
    { text: 'BD & CC', bbox: { x0: 125, y0: 180, x1: 195, y1: 210 } },
    { text: 'IOT', bbox: { x0: 215, y0: 180, x1: 285, y1: 210 } },
    { text: 'BD & CC', bbox: { x0: 305, y0: 180, x1: 375, y1: 210 } },
    { text: 'IOT', bbox: { x0: 455, y0: 180, x1: 525, y1: 210 } },
    { text: 'ANDROID PROG', bbox: { x0: 545, y0: 180, x1: 615, y1: 210 } },
    { text: 'PYTHON PROG', bbox: { x0: 635, y0: 180, x1: 705, y1: 210 } },
    { text: 'PROJECT', bbox: { x0: 725, y0: 180, x1: 795, y1: 210 } },

    // Wednesday: P5-P7 merged LIFE SKILLS LAB
    { text: 'BD & CC', bbox: { x0: 125, y0: 240, x1: 195, y1: 270 } },
    { text: 'PYTHON PROG', bbox: { x0: 215, y0: 240, x1: 285, y1: 270 } },
    { text: 'ANDROID PROG', bbox: { x0: 305, y0: 240, x1: 375, y1: 270 } },
    { text: 'IM & EP', bbox: { x0: 455, y0: 240, x1: 525, y1: 270 } },
    { text: 'LIFE SKILLS LAB', bbox: { x0: 545, y0: 240, x1: 795, y1: 270 } },

    // Thursday
    { text: 'IM & EP', bbox: { x0: 125, y0: 300, x1: 195, y1: 330 } },
    { text: 'PYTHON PROG', bbox: { x0: 215, y0: 300, x1: 285, y1: 330 } },
    { text: 'BD & CC', bbox: { x0: 305, y0: 300, x1: 375, y1: 330 } },
    { text: 'IOT', bbox: { x0: 455, y0: 300, x1: 525, y1: 330 } },
    { text: 'ANDROID PROG', bbox: { x0: 545, y0: 300, x1: 615, y1: 330 } },
    { text: 'IM & EP', bbox: { x0: 635, y0: 300, x1: 705, y1: 330 } },
    { text: 'LIBRARY', bbox: { x0: 725, y0: 300, x1: 795, y1: 330 } },

    // Friday
    { text: 'BD & CC', bbox: { x0: 125, y0: 360, x1: 195, y1: 390 } },
    { text: 'PYTHON PROG', bbox: { x0: 215, y0: 360, x1: 285, y1: 390 } },
    { text: 'ANDROID PROG', bbox: { x0: 305, y0: 360, x1: 375, y1: 390 } },
    { text: 'IM & EP', bbox: { x0: 455, y0: 360, x1: 525, y1: 390 } },
    { text: 'IOT', bbox: { x0: 545, y0: 360, x1: 615, y1: 390 } },
    { text: 'TPC', bbox: { x0: 635, y0: 360, x1: 705, y1: 390 } },
    { text: 'PROJECT', bbox: { x0: 725, y0: 360, x1: 795, y1: 390 } },

    // Saturday
    { text: 'IOT', bbox: { x0: 125, y0: 420, x1: 195, y1: 450 } },
    { text: 'IOT', bbox: { x0: 215, y0: 420, x1: 285, y1: 450 } },
    { text: 'ANDROID PROG', bbox: { x0: 305, y0: 420, x1: 375, y1: 450 } },
    { text: 'ANDROID PROG', bbox: { x0: 455, y0: 420, x1: 525, y1: 450 } },
    { text: 'PYTHON PROG LAB', bbox: { x0: 545, y0: 420, x1: 795, y1: 450 } }
];

const res2 = parseOcrSpatialGeometry({ words: general7PWords });

assert.strictEqual(res2.days.length, 6, 'Must extract 6 days');
assert.strictEqual(res2.maxPeriods, 7, 'Must extract exactly 7 periods');
assert.strictEqual(res2.normalizedSlots.length, 42, 'Must generate exactly 42 slots (6 x 7)');

// Monday P1 and P2 separate cells
const gMonP1 = res2.gridCells.find(c => c.day === 'Monday' && c.period === 1);
const gMonP2 = res2.gridCells.find(c => c.day === 'Monday' && c.period === 2);
assert.strictEqual(gMonP1.colSpan, 1);
assert.strictEqual(gMonP2.colSpan, 1);
assert.strictEqual(gMonP1.isMerged, false);
assert.strictEqual(gMonP2.isMerged, false);

// Monday P5-P7 merged
const gMonP5 = res2.gridCells.find(c => c.day === 'Monday' && c.period === 5);
assert.strictEqual(gMonP5.colSpan, 3);
assert.strictEqual(gMonP5.isMerged, true);
assert.strictEqual(gMonP5.subject, 'ANDROID PROG LAB');

console.log('✓ Test 2 Passed: 7-Period Institutional Timetable with 42 slots passed cleanly.');

console.log('\n🎉 ALL TIMETABLE INTEGRITY & POSITIONAL MAPPING TESTS PASSED 100%!');
