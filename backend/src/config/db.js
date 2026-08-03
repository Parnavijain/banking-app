// Single shared connection pool. `pg` reuses connections instead of
// opening a new one per query — critical for performance.
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle DB client', err);
});

module.exports = pool;
