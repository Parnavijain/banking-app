// Promote an existing user to admin role.
//   node scripts/make-admin.js alice@test.com
require('dotenv').config();
const { Pool } = require('pg');

const email = process.argv[2];
if (!email) { console.error('Usage: node make-admin.js <email>'); process.exit(1); }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query(
    `UPDATE users SET role = 'admin' WHERE email = $1 RETURNING id, email, role`,
    [email]
  );
  if (r.rowCount === 0) console.log('No user with that email.');
  else console.log(`Promoted:`, r.rows[0]);
  await pool.end();
})();
