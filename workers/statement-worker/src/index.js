// Statement worker.
// Polls statement_requests for pending rows, generates a PDF via pdfkit,
// writes it to STATEMENT_DIR, updates the row to 'ready'.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');

const POLL_MS = Number(process.env.WORKER_POLL_MS) || 5_000;
const STATEMENT_DIR = process.env.STATEMENT_DIR || path.resolve(__dirname, '../../../data/statements');
fs.mkdirSync(STATEMENT_DIR, { recursive: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function formatMoney(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));
}

async function generatePdf(req) {
  // Fetch account, user, and the transaction rows in the window.
  const acc = await pool.query(
    `SELECT a.account_number, a.currency, a.balance, u.full_name, u.email
     FROM accounts a JOIN users u ON u.id = a.user_id WHERE a.id = $1`,
    [req.account_id]
  );
  const account = acc.rows[0];
  const txs = await pool.query(
    `SELECT t.created_at, t.amount, t.note, t.category,
            CASE WHEN t.sender_account_id = $1 THEN 'debit' ELSE 'credit' END AS direction,
            sa.account_number AS sender_account_number,
            ra.account_number AS receiver_account_number
     FROM transactions t
     JOIN accounts sa ON sa.id = t.sender_account_id
     JOIN accounts ra ON ra.id = t.receiver_account_id
     WHERE (t.sender_account_id = $1 OR t.receiver_account_id = $1)
       AND t.created_at::date BETWEEN $2 AND $3
     ORDER BY t.created_at ASC`,
    [req.account_id, req.start_date, req.end_date]
  );

  const filename = `statement-${req.account_id}-${req.id}.pdf`;
  const filePath = path.join(STATEMENT_DIR, filename);
  const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // Header
  doc.fontSize(18).fillColor('#0F766E').text('BANKING', { characterSpacing: 3 });
  doc.moveDown(0.2);
  doc.fontSize(22).fillColor('#0B1220').text('Account Statement');
  doc.moveDown(0.5);
  doc.strokeColor('#E4E7EC').lineWidth(1).moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown();

  // Meta box
  doc.fontSize(9).fillColor('#64748B').text(`Account holder`);
  doc.fontSize(11).fillColor('#0B1220').text(account.full_name);
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#64748B').text('Account number');
  doc.fontSize(11).fillColor('#0B1220').font('Courier').text(account.account_number);
  doc.font('Helvetica');
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#64748B').text('Period');
  doc.fontSize(11).fillColor('#0B1220').text(`${req.start_date.toISOString().slice(0,10)} — ${req.end_date.toISOString().slice(0,10)}`);
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#64748B').text('Current balance');
  doc.fontSize(11).fillColor('#0B1220').text(formatMoney(account.balance, account.currency));
  doc.moveDown();

  // Totals for the window
  let totalIn = 0, totalOut = 0;
  for (const t of txs.rows) {
    if (t.direction === 'credit') totalIn += Number(t.amount);
    else totalOut += Number(t.amount);
  }
  doc.moveDown(0.5);
  doc.strokeColor('#E4E7EC').moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown();
  doc.fontSize(11).fillColor('#0B1220').text(`Summary`);
  doc.fontSize(10).fillColor('#64748B');
  doc.text(`Money in:  ${formatMoney(totalIn, account.currency)}   ·   Money out: ${formatMoney(totalOut, account.currency)}`);
  doc.text(`Net: ${formatMoney(totalIn - totalOut, account.currency)}   ·   Transactions: ${txs.rows.length}`);
  doc.moveDown();

  // Transaction table
  doc.strokeColor('#E4E7EC').moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor('#0B1220').text('Transactions');
  doc.moveDown(0.3);

  // Column headers
  const cols = { date: 50, desc: 130, dir: 400, amount: 480 };
  doc.fontSize(9).fillColor('#64748B');
  doc.text('Date',        cols.date,   doc.y, { continued: true });
  doc.text('Description', cols.desc,   doc.y, { continued: true });
  doc.text('Type',        cols.dir,    doc.y, { continued: true });
  doc.text('Amount',      cols.amount, doc.y, { align: 'right' });
  doc.moveDown(0.3);
  doc.strokeColor('#E4E7EC').moveTo(50, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown(0.3);

  doc.fontSize(9);
  for (const t of txs.rows) {
    if (doc.y > 720) doc.addPage();
    const y = doc.y;
    const dateStr = t.created_at.toISOString().slice(0, 10);
    const other = t.direction === 'credit'
      ? `from ${t.sender_account_number}`
      : `to ${t.receiver_account_number}`;
    const desc = (t.note ? `${t.note} — ` : '') + other;
    doc.fillColor('#0B1220').text(dateStr, cols.date, y);
    doc.text(desc.slice(0, 45), cols.desc, y);
    doc.fillColor(t.direction === 'credit' ? '#047857' : '#B91C1C')
       .text(t.direction === 'credit' ? 'IN' : 'OUT', cols.dir, y);
    doc.fillColor('#0B1220').text(
      (t.direction === 'credit' ? '+' : '−') + formatMoney(t.amount, account.currency),
      cols.amount, y, { width: 80, align: 'right' }
    );
    doc.moveDown(0.4);
  }

  if (txs.rows.length === 0) {
    doc.fillColor('#64748B').text('No transactions in this period.', 50, doc.y);
  }

  // Footer
  doc.moveDown(2);
  doc.fontSize(8).fillColor('#94A3B8').text(
    `Generated ${new Date().toISOString()}. This is a demo statement.`,
    50, 730, { align: 'center', width: 510 }
  );

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  return filePath;
}

async function tick() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT * FROM statement_requests
       WHERE status = 'pending' LIMIT 5 FOR UPDATE SKIP LOCKED`
    );
    if (r.rows.length === 0) { await client.query('COMMIT'); return; }
    for (const req of r.rows) {
      try {
        await client.query(`UPDATE statement_requests SET status='processing' WHERE id=$1`, [req.id]);
      } catch (e) { console.error(e); }
    }
    await client.query('COMMIT');

    // Process outside the transaction — PDF generation shouldn't hold a lock.
    for (const req of r.rows) {
      try {
        const filePath = await generatePdf(req);
        await pool.query(
          `UPDATE statement_requests SET status='ready', file_path=$2, completed_at=NOW()
           WHERE id=$1`,
          [req.id, filePath]
        );
        console.log(`📄 statement ${req.id} → ${filePath}`);
      } catch (err) {
        console.error(`📄 statement ${req.id} failed:`, err);
        await pool.query(
          `UPDATE statement_requests SET status='failed', error=$2, completed_at=NOW()
           WHERE id=$1`,
          [req.id, err.message.slice(0, 500)]
        );
      }
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('statement tick error:', err);
  } finally {
    client.release();
  }
}

(async () => {
  console.log(`📄 Statement worker running (poll ${POLL_MS}ms). Output → ${STATEMENT_DIR}`);
  setInterval(tick, POLL_MS);
  tick();
})();
