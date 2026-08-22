const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'scheduler.db');
const schemaPath = path.join(__dirname, 'schema.sql');

// Open the database (creates it if it doesn't exist)
const db = new DatabaseSync(dbPath);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

// Initialize database with schema if it's empty
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
if (!tables) {
    console.log("Initializing database from schema...");
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
    console.log("Database initialized with demo data.");
} else {
    console.log("Database already exists.");
}

module.exports = db;
