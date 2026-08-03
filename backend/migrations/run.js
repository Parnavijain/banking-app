// Simple migration runner — reads .sql files in this dir and executes them.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    console.log(`Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
    await pool.query(sql);
  }
  console.log('Migrations complete.');
  await pool.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
