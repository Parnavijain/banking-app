const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { z } = require('zod');
const pool = require('../config/db');
const { publish, TOPICS } = require('../config/kafka');

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2),
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// --- Token signing + session persistence -----------------------------------
// Every JWT gets a unique `jti`. We store a session row with that jti so
// revoke-token works. Auth middleware (in middleware/auth.js) checks it.
async function issueTokenForUser(user, req) {
  const jti = randomUUID();
  const expiresIn = process.env.JWT_EXPIRES_IN || '1h';
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role, jti },
    process.env.JWT_SECRET,
    { expiresIn }
  );
  const decoded = jwt.decode(token);
  await pool.query(
    `INSERT INTO sessions (jti, user_id, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, to_timestamp($5))`,
    [
      jti,
      user.id,
      (req.headers['user-agent'] || '').slice(0, 500),
      req.ip || null,
      decoded.exp,
    ]
  );
  return token;
}

function generateAccountNumber() {
  return String(Math.floor(100000000000 + Math.random() * 900000000000));
}

async function register(req, res, next) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const { email, password, fullName } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Email already registered' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, email, full_name, role`,
      [email, passwordHash, fullName]
    );
    const user = userResult.rows[0];
    const accountResult = await client.query(
      `INSERT INTO accounts (user_id, account_number, balance, currency)
       VALUES ($1, $2, 1000.00, 'USD')
       RETURNING id, account_number, balance, currency`,
      [user.id, generateAccountNumber()]
    );
    await client.query('COMMIT');
    const token = await issueTokenForUser(user, req);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
      account: accountResult.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function login(req, res, next) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { email, password } = parsed.data;
  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, full_name, role FROM users WHERE email = $1',
      [email]
    );
    if (result.rowCount === 0) {
      publish(TOPICS.USER_ACTIVITY, {
        type: 'user.login_failed', email, reason: 'unknown_email',
      }).catch(() => {});
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      publish(TOPICS.USER_ACTIVITY, {
        partitionKey: String(user.id),
        type: 'user.login_failed', actorUserId: user.id, email, reason: 'bad_password',
      }).catch(() => {});
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = await issueTokenForUser(user, req);
    publish(TOPICS.USER_ACTIVITY, {
      partitionKey: String(user.id),
      type: 'user.login',
      actorUserId: user.id,
      email: user.email,
    }).catch((e) => console.warn('activity publish failed:', e.message));
    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
    });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const result = await pool.query(
      'SELECT id, email, full_name, role, created_at FROM users WHERE id = $1',
      [req.user.sub]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    const u = result.rows[0];
    res.json({
      id: u.id, email: u.email, fullName: u.full_name, role: u.role, createdAt: u.created_at,
    });
  } catch (err) { next(err); }
}

// --- Session management --------------------------------------------------
// GET /api/auth/sessions — list my active sessions
async function listSessions(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT jti, user_agent, ip::text AS ip, issued_at, last_seen_at, expires_at,
              revoked_at,
              (jti = $2::uuid) AS is_current
       FROM sessions
       WHERE user_id = $1
       ORDER BY issued_at DESC LIMIT 50`,
      [req.user.sub, req.user.jti]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

// DELETE /api/auth/sessions/:jti — revoke a specific session
async function revokeSession(req, res, next) {
  try {
    const result = await pool.query(
      `UPDATE sessions SET revoked_at = NOW()
       WHERE jti = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING jti`,
      [req.params.jti, req.user.sub]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Session not found' });
    res.json({ revoked: result.rows[0].jti });
  } catch (err) { next(err); }
}

// POST /api/auth/logout-all — revoke every session except current
async function logoutAll(req, res, next) {
  try {
    await pool.query(
      `UPDATE sessions SET revoked_at = NOW()
       WHERE user_id = $1 AND jti <> $2 AND revoked_at IS NULL`,
      [req.user.sub, req.user.jti]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { register, login, me, listSessions, revokeSession, logoutAll };
