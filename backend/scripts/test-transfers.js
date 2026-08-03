// End-to-end sanity check for the transfer engine.
// Run AFTER `npm run dev` is up in another terminal.
//   node scripts/test-transfers.js
//
// It creates two users, transfers between them, and exercises:
//   - happy path
//   - insufficient funds
//   - idempotency replay (same key twice = one transfer)
//   - concurrent transfers (should not corrupt balances)

const { randomUUID } = require('crypto');

const BASE = process.env.API_BASE || 'http://localhost:4000';

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function register(email) {
  const r = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'password123', fullName: email }),
  });
  if (r.status !== 201) throw new Error('register failed: ' + JSON.stringify(r));
  return r.body; // { token, user, account }
}

async function balance(token, accountId) {
  const r = await api('/api/accounts', { headers: { Authorization: 'Bearer ' + token } });
  const acc = r.body.find((a) => a.id === accountId);
  return Number(acc.balance);
}

async function transfer(token, fromAccountId, toAccountNumber, amount, idempotencyKey) {
  return api('/api/transfers', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: JSON.stringify({ fromAccountId, toAccountNumber, amount, idempotencyKey }),
  });
}

(async () => {
  const suffix = Date.now();
  const alice = await register(`alice+${suffix}@test.com`);
  const bob   = await register(`bob+${suffix}@test.com`);
  console.log('Alice starts with', await balance(alice.token, alice.account.id));
  console.log('Bob starts with',   await balance(bob.token,   bob.account.id));

  // 1) happy path
  const key1 = randomUUID();
  const r1 = await transfer(alice.token, alice.account.id, bob.account.account_number, 100, key1);
  console.log('\n[1] happy path →', r1.status, r1.body.replayed ? '(replayed)' : '(new)');

  // 2) idempotency: same key twice → second is a replay
  const r1b = await transfer(alice.token, alice.account.id, bob.account.account_number, 100, key1);
  console.log('[2] same key replay →', r1b.status, 'replayed=' + r1b.body.replayed);

  // 3) insufficient funds
  const r2 = await transfer(alice.token, alice.account.id, bob.account.account_number, 99999, randomUUID());
  console.log('[3] insufficient funds →', r2.status, r2.body.error);

  // 4) concurrent transfers — 10 x $10 in parallel. Each needs its own key.
  const keys = Array.from({ length: 10 }, () => randomUUID());
  const results = await Promise.all(
    keys.map((k) => transfer(alice.token, alice.account.id, bob.account.account_number, 10, k))
  );
  const okCount = results.filter((r) => r.status === 201).length;
  console.log('[4] 10 concurrent $10 transfers → success count:', okCount);

  const aliceEnd = await balance(alice.token, alice.account.id);
  const bobEnd   = await balance(bob.token,   bob.account.id);
  console.log('\nAlice end:', aliceEnd, ' Bob end:', bobEnd);
  console.log('Total preserved?', aliceEnd + bobEnd === 2000 ? '✅ yes' : '❌ NO');
})().catch((e) => { console.error(e); process.exit(1); });
