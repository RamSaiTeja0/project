require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configure the database connection using the environment variable
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Neon
});

const schemaPath = path.join(__dirname, 'schema.sql');

// Initialize database with schema if it's empty
async function initDB() {
    if (!process.env.DATABASE_URL) {
        console.warn("WARNING: DATABASE_URL is not set in .env file.");
        return;
    }

    try {
        const client = await pool.connect();
        
        // Check if the users table exists
        const res = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'users'
            );
        `);
        
        if (!res.rows[0].exists) {
            console.log("Initializing Postgres database from schema...");
            const schema = fs.readFileSync(schemaPath, 'utf-8');
            await client.query(schema);
            console.log("Database initialized with demo data.");
        } else {
            console.log("Postgres database already exists.");
        }
        
        client.release();
    } catch (err) {
        console.error("Error initializing database:", err);
    }
}

initDB();

module.exports = pool;
