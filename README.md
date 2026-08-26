# Interactive College Faculty Duty & Substitute Scheduler

A full-stack Node.js/Express college web application that solves the problem of finding free substitute faculty for a given timetable period.

## Features
- **HOS Role**: Manage official timetables and verify faculty lists.
- **Faculty Role**: View timetables, request substitutes, and assign free faculty.
- **Substitute Availability Logic**: The backend strictly checks the official timetable to only return faculty who are *FREE* on the requested day and period.
- **OCR Demo**: Basic Tesseract.js integration for scanning paper timetables.

## Architecture
- **Frontend**: HTML/CSS/Vanilla JavaScript (integrated with existing `demo_2.html` design)
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL (Neon Serverless) via `pg`
- **Authentication**: `express-session`, `bcryptjs`

## Getting Started

1. **Prerequisites**: Ensure you have [Node.js](https://nodejs.org/) installed on your machine.
2. **Install Dependencies**:
   Open a terminal in this project directory and run:
   ```bash
   npm install
   ```
3. **Start the Server**:
   ```bash
   npm start
   ```
   The database will automatically initialize and populate with demo data on the first run.
4. **Access the App**:
   Open your browser and navigate to `http://localhost:3000`

## Demo Login Credentials

**HOS (Head of Section - CSE):**
- Faculty ID: `HOS001`
- Password: `password123`
- *Permissions: Can view and edit the official timetable.*

**Faculty (CSE):**
- Faculty ID: `FAC001` (Dr. Ravi)
- Faculty ID: `FAC002` (Dr. Anitha)
- Faculty ID: `FAC003` (Prof. Kiran)
- Faculty ID: `FAC004` (Prof. Priya)
- Password (for all demo faculty): `password123`
- *Permissions: Can view timetable, but cannot edit. Can request substitutes.*

## Testing the Substitute Flow
1. Log in as `FAC001` (Dr. Ravi).
2. Go to the **Adjust/Substitute** tab.
3. Select a date (e.g., a Monday).
4. Select a period (e.g., Monday P1).
5. The system will query the database and populate the Substitute Faculty dropdown with only the faculty members who are **free** during Monday P1.
6. Select a substitute and submit the request.
