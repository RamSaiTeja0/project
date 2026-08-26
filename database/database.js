require('dotenv').config();
const fs = require('fs');
const path = require('path');

let dbDriver = null;
let isPostgres = false;

// Check if PostgreSQL (Neon) is configured in .env
if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().startsWith('postgres')) {
    try {
        const { Pool } = require('pg');
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL.trim(),
            ssl: { rejectUnauthorized: false }
        });

        pool.on('error', (err) => {
            console.error('Unexpected error on Postgres database client:', err);
        });

        isPostgres = true;
        dbDriver = pool;
        console.log('Using PostgreSQL (Neon Database)');
    } catch (e) {
        console.warn('Failed to load pg driver, falling back to local SQLite.', e);
        isPostgres = false;
    }
}

// Fallback to Built-in SQLite (Node 22+)
if (!isPostgres) {
    console.log('No PostgreSQL connection string found. Using Local SQLite Database.');
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = path.join(__dirname, 'scheduler.db');
    const sqliteDb = new DatabaseSync(dbPath);

    // Provide a Postgres-compatible query interface
    dbDriver = {
        async query(sql, params = []) {
            try {
                // Convert $1, $2, ... placeholders to ?
                let sqliteSql = sql.replace(/\$\d+/g, '?');

                const trimmed = sqliteSql.trim().toUpperCase();
                const stmt = sqliteDb.prepare(sqliteSql);

                if (trimmed.startsWith('SELECT') || trimmed.includes('RETURNING')) {
                    const rows = stmt.all(...params);
                    return { rows };
                } else {
                    const info = stmt.run(...params);
                    return { rows: [], rowCount: info.changes };
                }
            } catch (err) {
                console.error('SQLite Query Error:', err.message, 'SQL:', sql);
                throw err;
            }
        }
    };
}

// Initialize Database Schema and Demo Data
async function initDB() {
    try {
        if (isPostgres) {
            const client = await dbDriver.connect();
            const res = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'users'
                );
            `);

            if (!res.rows[0].exists) {
                console.log('Initializing Postgres schema and demo data...');
                const schemaPath = path.join(__dirname, 'schema.sql');
                const schema = fs.readFileSync(schemaPath, 'utf-8');
                await client.query(schema);
                console.log('Postgres Database ready.');
            } else {
                console.log('Postgres database tables verified.');
            }
            client.release();
        } else {
            // Check if users table exists in SQLite
            const res = await dbDriver.query(`
                SELECT name FROM sqlite_master WHERE type='table' AND name='users';
            `);

            if (res.rows.length === 0) {
                console.log('Initializing Local SQLite schema and demo data...');
                const sqliteSchema = `
                    DROP TABLE IF EXISTS substitutions;
                    DROP TABLE IF EXISTS timetable;
                    DROP TABLE IF EXISTS subjects;
                    DROP TABLE IF EXISTS branches;
                    DROP TABLE IF EXISTS users;

                    CREATE TABLE users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        faculty_id TEXT UNIQUE NOT NULL,
                        full_name TEXT NOT NULL,
                        email TEXT UNIQUE NOT NULL,
                        phone TEXT,
                        department TEXT NOT NULL,
                        password_hash TEXT NOT NULL,
                        role TEXT CHECK(role IN ('hos', 'faculty')) NOT NULL
                    );

                    CREATE TABLE branches (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        department TEXT NOT NULL,
                        branch_name TEXT NOT NULL,
                        year TEXT NOT NULL,
                        section TEXT NOT NULL,
                        hos_id INTEGER REFERENCES users(id) ON DELETE SET NULL
                    );

                    CREATE TABLE subjects (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        subject_code TEXT UNIQUE NOT NULL,
                        subject_name TEXT NOT NULL,
                        department TEXT NOT NULL
                    );

                    CREATE TABLE timetable (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
                        day TEXT CHECK(day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')) NOT NULL,
                        period INTEGER NOT NULL,
                        start_time TEXT,
                        end_time TEXT,
                        subject_id INTEGER NOT NULL REFERENCES subjects(id),
                        faculty_id INTEGER NOT NULL REFERENCES users(id),
                        room TEXT
                    );

                    CREATE TABLE substitutions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timetable_id INTEGER NOT NULL REFERENCES timetable(id) ON DELETE CASCADE,
                        date TEXT NOT NULL,
                        original_faculty_id INTEGER NOT NULL REFERENCES users(id),
                        substitute_faculty_id INTEGER NOT NULL REFERENCES users(id),
                        status TEXT DEFAULT 'assigned',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    INSERT INTO users (faculty_id, full_name, email, phone, department, password_hash, role) VALUES
                    ('HOS001', 'Dr. Smith', 'smith@college.edu', '1234567890', 'CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'hos'),
                    ('FAC001', 'Dr. Ravi', 'ravi@college.edu', '0987654321', 'CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
                    ('FAC002', 'Dr. Anitha', 'anitha@college.edu', '1112223333', 'CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
                    ('FAC003', 'Prof. Kiran', 'kiran@college.edu', '4445556666', 'CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty'),
                    ('FAC004', 'Prof. Priya', 'priya@college.edu', '7778889999', 'CSE', '$2a$10$mzgNO7vjCvc5p1aQ7Xl4HuDRGyCzFl5cI7S0tUHo6r.SuDQD7rjB2', 'faculty');

                    INSERT INTO branches (department, branch_name, year, section, hos_id) VALUES
                    ('CSE', 'CSE-A', 'III Year', 'A', 1),
                    ('CSE', 'CSE-B', 'III Year', 'B', 1);

                    INSERT INTO subjects (subject_code, subject_name, department) VALUES
                    ('CS301', 'DBMS', 'CSE'),
                    ('CS302', 'OS', 'CSE'),
                    ('CS303', 'CN', 'CSE'),
                    ('CS304', 'Java', 'CSE');

                    INSERT INTO timetable (branch_id, day, period, start_time, end_time, subject_id, faculty_id, room) VALUES
                    (1, 'Monday', 1, '09:00', '10:00', 1, 2, 'Room 101'),
                    (1, 'Monday', 2, '10:00', '11:00', 2, 5, 'Room 101'),
                    (1, 'Monday', 3, '11:00', '12:00', 3, 4, 'Room 101'),
                    (1, 'Tuesday', 1, '09:00', '10:00', 4, 2, 'Room 101'),
                    (1, 'Tuesday', 2, '10:00', '11:00', 1, 5, 'Room 101'),
                    (2, 'Monday', 1, '09:00', '10:00', 2, 5, 'Room 102'),
                    (2, 'Monday', 2, '10:00', '11:00', 3, 4, 'Room 102');
                `;

                // Split statements and execute
                const statements = sqliteSchema
                    .split(';')
                    .map(s => s.trim())
                    .filter(s => s.length > 0);

                for (const stmt of statements) {
                    await dbDriver.query(stmt);
                }
                console.log('SQLite Database ready with demo data.');
            } else {
                console.log('SQLite database tables verified.');
            }
        }
    } catch (err) {
        console.error('Error initializing database:', err);
    }
}

initDB();

module.exports = dbDriver;
