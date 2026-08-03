// Verifies the JWT and confirms the session is still active (not revoked).
// The DB check makes JWTs revocable at the cost of one query per request.
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Revocation check. Tokens without jti (legacy) are rejected — force re-login.
  if (!payload.jti) {
    return res.status(401).json({ error: 'Token missing jti — please sign in again' });
  }
  try {
    const r = await pool.query(
      `SELECT revoked_at FROM sessions WHERE jti = $1 AND user_id = $2`,
      [payload.jti, payload.sub]
    );
    if (r.rowCount === 0) {
      return res.status(401).json({ error: 'Session not found — please sign in again' });
    }
    if (r.rows[0].revoked_at) {
      return res.status(401).json({ error: 'Session revoked' });
    }
    // Touch last_seen. Async, no await — best-effort.
    pool.query(`UPDATE sessions SET last_seen_at = NOW() WHERE jti = $1`, [payload.jti])
      .catch(() => {});
  } catch (err) {
    return next(err);
  }

  req.user = payload;
  next();
}

module.exports = { authenticate };
