// FX service. Reads rates from the fx_rates table.
// In production you'd cache these in-memory with a short TTL — the DB lookup
// per transfer isn't expensive but it's not zero either.

const SUPPORTED = ['USD', 'EUR', 'GBP'];

function isSupported(cur) {
  return SUPPORTED.includes(cur);
}

async function getRate(client, from, to) {
  if (from === to) return 1;
  const r = await client.query(
    `SELECT rate FROM fx_rates WHERE from_currency = $1 AND to_currency = $2`,
    [from, to]
  );
  if (r.rowCount === 0) {
    const err = new Error(`No FX rate for ${from} → ${to}`);
    err.status = 400; err.publicMessage = err.message;
    throw err;
  }
  return Number(r.rows[0].rate);
}

// Convert with 2-decimal rounding. Money math should really use a decimal
// library (decimal.js) — Number is good enough for a demo but has edge cases.
function convert(amount, rate) {
  return Math.round(Number(amount) * rate * 100) / 100;
}

module.exports = { SUPPORTED, isSupported, getRate, convert };
