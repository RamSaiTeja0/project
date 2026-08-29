# TecSubtitution — Smart Faculty Timetable & Substitution Management

A full-stack Node.js/Express college web application that simplifies academic scheduling, faculty substitutions, timetable management, and AI-assisted timetable digitization.

## Features
- **100% Dynamic Timetable Table Generation**:
  - Upload **Excel (`.xlsx`, `.xls`)**, **CSV (`.csv`)**, **PDF (`.pdf`)**, or **Photos (`.png`, `.jpg`)** to instantly generate your timetable table.
  - Understands the **visual table structure**: day rows, period columns, period timings, break columns, empty/free cells, and multi-period merged cells (e.g. Labs occupying P1–P3 or P5–P7).
  - Works with any schedule: 5, 6, 7, 8, 9 periods, custom timings, and flexible days.
  - Zero hardcoding: the uploaded file is always the 100% source of truth.
- **In-Memory Temporary Database**:
  - Zero configuration or external database server required.
  - Ready immediately with seeded faculty, branches, and timetable periods.
- **HOS Role**: Manage official timetables, live-edit cells, and import schedules.
- **Faculty Role**: View timetables, request substitutes, and view assigned duties.
- **Substitute Availability Logic**: Strictly checks the official timetable to only return faculty who are *FREE* on the requested day and period.

## Architecture
- **Frontend**: HTML/CSS/Vanilla JavaScript (integrated with existing `demo_2.html` design)
- **Backend**: Node.js, Express.js
- **Database Engine**: In-Memory Temporary Database
- **Authentication**: `express-session`, `bcryptjs`
- **Vision / OCR**: Gemini AI Vision API + Client-Side SheetJS, PDF.js, and Tesseract Spatial Layout Analysis

## Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Start the Server**:
   ```bash
   npm start
   ```
3. **Access the App**:
   Open your browser and navigate to `http://localhost:3000`

## Demo Login Credentials

**HOS (Head of Section - CSE):**
- Faculty ID: `HOS001`
- Password: `password123`
- *Permissions: Can view and edit the official timetable, upload timetable files.*

**Faculty (CSE):**
- Faculty ID: `FAC001` (Dr. Ravi)
- Faculty ID: `FAC002` (Dr. Anitha)
- Faculty ID: `FAC003` (Prof. Kiran)
- Faculty ID: `FAC004` (Prof. Priya)
- Password (for all demo faculty): `password123`
- *Permissions: Can view timetable, request substitutes, mark duties attended.*

## Testing Dynamic Upload & Timetable Generation
1. Log in as `HOS001` (or click Quick Login).
2. Go to the **Upload Paper Sheet** tab (or use the quick upload banner at the top of **My Schedule**).
3. Drop an Excel, CSV, PDF, or Photo of a timetable, or choose a 1-click department preset.
4. The system analyzes the table geometry, detects the day rows, period columns, timings, breaks, and merged lab spans.
5. The generated table is immediately rendered in the Weekly Schedule and Extracted Grid with live inline editing enabled!
