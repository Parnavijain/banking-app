// Admin controller. All routes here are guarded by requireRole('admin').
//
// Maker-checker rule: two DISTINCT admins must approve a sensitive action.
// The proposer cannot self-approve. Enforced in the SQL.
const pool = require('../config/db');

// GET /api/admin/users
async function listUsers(req, res, next) {
  try {
    const r = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.created_at,
              COUNT(a.id) AS account_count,
              COALESCE(SUM(a.balance)::float, 0) AS total_balance
       FROM users u
       LEFT JOIN accounts a ON a.user_id = u.id
       GROUP BY u.id ORDER BY u.created_at DESC`
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

// GET /api/admin/transactions?limit=100
async function listTransactions(req, res, next) {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  try {
    const r = await pool.query(
      `SELECT t.id, t.amount, t.status, t.category, t.created_at,
              t.fx_rate, t.received_amount, t.received_currency,
              sa.account_number AS sender_account,
              ra.account_number AS receiver_account,
              su.email AS sender_email, ru.email AS receiver_email,
              sa.currency AS sender_currency
       FROM transactions t
       JOIN accounts sa ON sa.id = t.sender_account_id
       JOIN accounts ra ON ra.id = t.receiver_account_id
       JOIN users su ON su.id = sa.user_id
       JOIN users ru ON ru.id = ra.user_id
       ORDER BY t.created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

// --- Maker-checker proposals ------------------------------------------------

// POST /api/admin/proposals   { action, targetAccountId, reason }
async function proposeAction(req, res, next) {
  const { action, targetAccountId, reason } = req.body || {};
  if (!['freeze_account', 'unfreeze_account'].includes(action)) {
    return res.status(400).json({ error: 'Unknown action' });
  }
  if (!Number.isInteger(targetAccountId)) {
    return res.status(400).json({ error: 'targetAccountId required' });
  }
  try {
    const acc = await pool.query('SELECT id, status FROM accounts WHERE id = $1', [targetAccountId]);
    if (acc.rowCount === 0) return res.status(404).json({ error: 'Account not found' });
    if (action === 'freeze_account' && acc.rows[0].status === 'frozen') {
      return res.status(409).json({ error: 'Account already frozen' });
    }
    if (action === 'unfreeze_account' && acc.rows[0].status === 'active') {
      return res.status(409).json({ error: 'Account is already active' });
    }
    const r = await pool.query(
      `INSERT INTO admin_proposals (action, target_type, target_id, reason, proposed_by)
       VALUES ($1, 'account', $2, $3, $4)
       RETURNING id, action, target_type, target_id, reason, proposed_by, status, created_at`,
      [action, targetAccountId, reason || null, req.user.sub]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
}

// GET /api/admin/proposals?status=pending
async function listProposals(req, res, next) {
  const status = req.query.status || 'pending';
  try {
    const r = await pool.query(
      `SELECT p.*, pu.email AS proposed_by_email,
              au.email AS approved_by_email,
              a.account_number AS target_account_number,
              a.currency AS target_currency,
              a.status AS target_status
       FROM admin_proposals p
       JOIN users pu ON pu.id = p.proposed_by
       LEFT JOIN users au ON au.id = p.approved_by
       LEFT JOIN accounts a ON a.id = p.target_id
       WHERE p.status = $1
       ORDER BY p.created_at DESC LIMIT 100`,
      [status]
    );
    res.json(r.rows);
  } catch (err) { next(err); }
}

// POST /api/admin/proposals/:id/approve
async function approveProposal(req, res, next) {
  const proposalId = Number(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Row-lock the proposal so two admins can't both approve simultaneously.
    const p = await client.query(
      `SELECT * FROM admin_proposals WHERE id = $1 FOR UPDATE`,
      [proposalId]
    );
    if (p.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Proposal not found' });
    }
    const proposal = p.rows[0];
    if (proposal.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Proposal already ${proposal.status}` });
    }
    // The maker-checker rule: the approver cannot be the proposer.
    if (proposal.proposed_by === req.user.sub) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You cannot approve your own proposal' });
    }

    // Apply the action.
    if (proposal.action === 'freeze_account') {
      await client.query(`UPDATE accounts SET status = 'frozen' WHERE id = $1`, [proposal.target_id]);
    } else if (proposal.action === 'unfreeze_account') {
      await client.query(`UPDATE accounts SET status = 'active' WHERE id = $1`, [proposal.target_id]);
    }

    await client.query(
      `UPDATE admin_proposals
       SET status = 'approved', approved_by = $1, decided_at = NOW()
       WHERE id = $2`,
      [req.user.sub, proposalId]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// POST /api/admin/proposals/:id/reject
async function rejectProposal(req, res, next) {
  const proposalId = Number(req.params.id);
  try {
    const p = await pool.query('SELECT * FROM admin_proposals WHERE id = $1', [proposalId]);
    if (p.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    if (p.rows[0].status !== 'pending') {
      return res.status(409).json({ error: `Already ${p.rows[0].status}` });
    }
    if (p.rows[0].proposed_by === req.user.sub) {
      return res.status(403).json({ error: 'You cannot reject your own proposal' });
    }
    await pool.query(
      `UPDATE admin_proposals SET status='rejected', rejected_by=$1, decided_at=NOW()
       WHERE id = $2`,
      [req.user.sub, proposalId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = {
  listUsers, listTransactions,
  proposeAction, listProposals, approveProposal, rejectProposal,
};

