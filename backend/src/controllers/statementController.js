const path = require('path');
const fs = require('fs');
const pool = require('../config/db');

// POST /api/statements  { accountId, startDate, endDate }
async function createStatement(req, res, next) {
  const { accountId, startDate, endDate } = req.body || {};
  if (!accountId || !startDate || !endDate) {
    return res.status(400).json({ error: 'accountId, startDate, endDate required' });
  }
  try {
    const own = await pool.query(
      'SELECT 1 FROM accounts WHERE id = $1 AND user_id = $2',
      [accountId, req.user.sub]
    );
    if (own.rowCount === 0) return res.status(403).json({ error: 'You do not own this account' });

    const r = await pool.query(
      `INSERT INTO statement_requests (user_id, account_id, start_date, end_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id, status, requested_at`,
      [req.user.sub, accountId, startDate, endDate]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
}

// GET /api/statements
async function listStatements(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT s.id, s.account_id, a.account_number,
              s.start_date, s.end_date, s.status,
              s.requested_at, s.completed_at, s.error
       FROM statement_requests s
       JOIN accounts a ON a.id = s.account_id
       WHERE s.user_id = $1
       ORDER BY s.requested_at DESC LIMIT 50`,
      [req.user.sub]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

// GET /api/statements/:id/download
async function downloadStatement(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT file_path, status FROM statement_requests
       WHERE id = $1 AND user_id = $2`,
      [Number(req.params.id), req.user.sub]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    if (r.rows[0].status !== 'ready') {
      return res.status(409).json({ error: 'Not ready yet' });
    }
    const filePath = r.rows[0].file_path;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File missing' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
}

module.exports = { createStatement, listStatements, downloadStatement };
