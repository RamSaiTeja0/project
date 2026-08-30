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

---

## Availability Lookup (Phase 1)

The core TecSubstitution flow — *click a timetable cell, see who is FREE at that
day + period* — is served by a dedicated, **read-only** module. It assigns
nothing, saves nothing and modifies no timetable or faculty data.

### Data model

`data/timetable-source.json` is the structured source of truth (JSON today; a
CSV / Excel / document importer can feed the same normalizer later). It holds a
faculty roster plus one compact grid per class — exactly the shape a spreadsheet
or an extracted table produces:

```json
{ "period": 5, "spanTo": 7, "subject": "Android Programming Lab",
  "faculty": "Prof. Kiran", "room": "Lab 2" }
```

`data/timetableStore.js` normalizes every class grid into flat records, one per
faculty × day × period, and indexes them by `day|period`:

```json
{ "faculty": "Dr. Ravi", "day": "Monday", "period": 2, "class": "CSE-A",
  "subject": "Python Programming", "room": "Room 101", "status": "BUSY" }

{ "faculty": "Prof. Kiran", "day": "Monday", "period": 2, "class": null,
  "subject": null, "room": null, "status": "FREE" }
```

Merged lab cells (`spanTo`) mark every period they span as BUSY. The store
refuses to load a source that double-books a faculty member, references an
unknown faculty name, or uses a period outside the declared range — bad data
fails at startup instead of silently reporting someone as FREE.

### API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/availability` | Core query — `{ day, period }` in, FREE faculty out |
| `GET` | `/api/availability?day=Monday&period=2` | Same query over GET, for quick checks |
| `GET` | `/api/availability/timetable` | The primary timetable grid the frontend renders |
| `GET` | `/api/availability/meta` | Days, periods, period timings, faculty roster |
| `GET` | `/api/availability/slot/:day/:period` | Full FREE/BUSY breakdown for one slot |

The request may carry the whole clicked cell; only `day` and `period` are
required. An optional `faculty` / `excludeFaculty` drops the cell's own faculty
from the results.

```bash
curl -X POST http://localhost:3000/api/availability \
  -H 'Content-Type: application/json' \
  -d '{"day":"Monday","period":2,"class":"CSE-A","subject":"Python Programming","faculty":"Dr. Ravi"}'
```

```json
{
  "day": "Monday",
  "period": 2,
  "availableFaculty": ["Dr. Smith", "Dr. Anitha", "Prof. Kiran", "Dr. Suresh",
                       "Dr. Deepa", "Prof. Naveen", "Dr. Latha"],
  "busy": [
    { "faculty": "Dr. Ravi",    "class": "CSE-A", "subject": "Python Programming" },
    { "faculty": "Prof. Priya", "class": "CSE-B", "subject": "Industrial Management & Entrepreneurship" },
    { "faculty": "Prof. Arun",  "class": "ECE-A", "subject": "DBMS" }
  ]
}
```

Days accept `Monday` / `monday` / `MON`; periods accept `2`, `"2"` or `"P2"`.
Invalid input returns `400` with the valid values listed.

### Tests

```bash
npm run test:availability
```

Covers the store (normalization, merged labs, conflict detection, immutability)
and the HTTP API (all 42 day + period slots, error handling, and a check that no
call mutated any data).
