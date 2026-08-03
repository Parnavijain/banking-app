const pool = require('../config/db');
const { SUPPORTED, isSupported } = require('../services/fxService');

async function getMyAccounts(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, account_number, balance, currency, status, created_at
       FROM accounts WHERE user_id = $1 ORDER BY created_at ASC`,
      [req.user.sub]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
}

// POST /api/accounts — open a new wallet in a supported currency
async function openAccount(req, res, next) {
  const currency = String(req.body?.currency || '').toUpperCase();
  if (!isSupported(currency)) {
    return res.status(400).json({ error: `Unsupported currency. Try: ${SUPPORTED.join(', ')}` });
  }
  try {
    // One wallet per currency per user, to keep the UI predictable.
    const existing = await pool.query(
      `SELECT 1 FROM accounts WHERE user_id = $1 AND currency = $2`,
      [req.user.sub, currency]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: `You already have a ${currency} wallet` });
    }
    const accountNumber = String(Math.floor(100000000000 + Math.random() * 900000000000));
    const result = await pool.query(
      `INSERT INTO accounts (user_id, account_number, balance, currency)
       VALUES ($1, $2, 0.00, $3)
       RETURNING id, account_number, balance, currency, created_at`,
      [req.user.sub, accountNumber, currency]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
}

// GET /api/fx-rates — public reference rates
async function getFxRates(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT from_currency, to_currency, rate::float, updated_at
       FROM fx_rates ORDER BY from_currency, to_currency`
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

// ADMIN — GET /api/admin/accounts
async function getAllAccounts(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT a.id, a.account_number, a.balance, a.currency, a.status, a.created_at,
              u.id AS user_id, u.email, u.full_name
       FROM accounts a
       JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { next(err); }
}

module.exports = { getMyAccounts, openAccount, getFxRates, getAllAccounts };
