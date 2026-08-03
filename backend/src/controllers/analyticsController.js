// Analytics endpoints. All aggregations happen in SQL — the DB is much
// better at this than JavaScript, and returning ~30 rows instead of thousands
// keeps the frontend snappy.
const pool = require('../config/db');

// Verify the caller owns the account before returning any of its data.
async function assertOwnership(userId, accountId) {
  const r = await pool.query(
    'SELECT 1 FROM accounts WHERE id = $1 AND user_id = $2',
    [accountId, userId]
  );
  if (r.rowCount === 0) {
    const err = new Error('You do not own this account');
    err.status = 403;
    err.publicMessage = 'You do not own this account';
    throw err;
  }
}

// GET /api/analytics/summary?accountId=123&days=30
// Returns totals, category breakdown (outgoing only), monthly buckets,
// and top counterparties. All from a single request.
async function getSummary(req, res, next) {
  const accountId = Number(req.query.accountId);
  const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return res.status(400).json({ error: 'accountId required' });
  }

  try {
    await assertOwnership(req.user.sub, accountId);

    // Totals (money in / out / net) over the window.
    const totalsQ = pool.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE sender_account_id   = $1), 0)::float AS out_total,
         COALESCE(SUM(amount) FILTER (WHERE receiver_account_id = $1), 0)::float AS in_total,
         COUNT(*) FILTER (WHERE sender_account_id   = $1) AS out_count,
         COUNT(*) FILTER (WHERE receiver_account_id = $1) AS in_count
       FROM transactions
       WHERE (sender_account_id = $1 OR receiver_account_id = $1)
         AND created_at >= NOW() - ($2 || ' days')::interval`,
      [accountId, String(days)]
    );

    // Spend by category — outgoing only. Categorization is per-transaction.
    const byCategoryQ = pool.query(
      `SELECT COALESCE(category, 'other') AS category,
              SUM(amount)::float AS total,
              COUNT(*) AS count
       FROM transactions
       WHERE sender_account_id = $1
         AND created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY category
       ORDER BY total DESC`,
      [accountId, String(days)]
    );

    // Monthly bucketed net flow. date_trunc gives us consistent bucket
    // boundaries; COALESCE handles months with zero activity in JS.
    const byMonthQ = pool.query(
      `SELECT
         date_trunc('month', created_at) AS bucket,
         COALESCE(SUM(amount) FILTER (WHERE receiver_account_id = $1), 0)::float AS in_total,
         COALESCE(SUM(amount) FILTER (WHERE sender_account_id   = $1), 0)::float AS out_total
       FROM transactions
       WHERE (sender_account_id = $1 OR receiver_account_id = $1)
         AND created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY bucket
       ORDER BY bucket ASC`,
      [accountId, String(days)]
    );

    // Top 5 counterparties by total dollars exchanged (either direction).
    const topPartnersQ = pool.query(
      `SELECT
         other_account.account_number AS account_number,
         u.full_name AS name,
         SUM(t.amount)::float AS total,
         COUNT(*) AS count
       FROM transactions t
       JOIN accounts other_account
         ON other_account.id = CASE
              WHEN t.sender_account_id = $1 THEN t.receiver_account_id
              ELSE t.sender_account_id
            END
       JOIN users u ON u.id = other_account.user_id
       WHERE (t.sender_account_id = $1 OR t.receiver_account_id = $1)
         AND t.created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY other_account.account_number, u.full_name
       ORDER BY total DESC
       LIMIT 5`,
      [accountId, String(days)]
    );

    const [totals, byCategory, byMonth, topPartners] = await Promise.all([
      totalsQ, byCategoryQ, byMonthQ, topPartnersQ,
    ]);

    const t = totals.rows[0];
    res.json({
      window: { days },
      totals: {
        in:  t.in_total,
        out: t.out_total,
        net: t.in_total - t.out_total,
        inCount:  Number(t.in_count),
        outCount: Number(t.out_count),
      },
      byCategory: byCategory.rows,
      byMonth: byMonth.rows.map((r) => ({
        bucket: r.bucket,
        in:  r.in_total,
        out: r.out_total,
      })),
      topPartners: topPartners.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary };
