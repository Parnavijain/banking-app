import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

// Small helper — the browser has crypto.randomUUID() in modern browsers.
// If for some reason it's missing, fall back to a simple v4.
function newUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function TransferForm({ accounts, onTransferComplete }) {
  const { token } = useAuth();
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id || '');
  const [toAccountNumber, setToAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Idempotency key: generated when the form loads. Reused for retries of
  // the SAME submission. Reset only after a successful commit.
  const [idemKey, setIdemKey] = useState(() => newUUID());

  async function onSubmit(e) {
    e.preventDefault();
    setError(''); setOk(''); setSubmitting(true);
    try {
      const data = await api('/api/transfers', {
        method: 'POST',
        token,
        body: {
          fromAccountId: Number(fromAccountId),
          toAccountNumber: toAccountNumber.trim(),
          amount: Number(amount),
          idempotencyKey: idemKey,
          note: note || undefined,
        },
      });
      setOk(data.replayed ? 'Already sent (replay)' : 'Sent');
      // Reset the form AND rotate the idempotency key so the next transfer
      // is a new logical operation, not a replay.
      setToAccountNumber(''); setAmount(''); setNote('');
      setIdemKey(newUUID());
      onTransferComplete?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label">From</label>
        <select
          className="input" value={fromAccountId}
          onChange={(e) => setFromAccountId(e.target.value)}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_number} — ${Number(a.balance).toFixed(2)} {a.currency}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">To account number</label>
        <input
          className="input font-mono" value={toAccountNumber}
          onChange={(e) => setToAccountNumber(e.target.value)}
          placeholder="12-digit account number" required
        />
      </div>
      <div>
        <label className="label">Amount (USD)</label>
        <input
          type="number" min="0.01" step="0.01" className="input"
          value={amount} onChange={(e) => setAmount(e.target.value)} required
        />
      </div>
      <div>
        <label className="label">Note (optional)</label>
        <input
          className="input" value={note} maxLength={200}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {error && <div className="text-sm text-debit">{error}</div>}
      {ok && <div className="text-sm text-credit">{ok}</div>}
      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send money'}
      </button>
      <p className="text-xs text-slate-500 font-mono truncate">
        idempotency: {idemKey}
      </p>
    </form>
  );
}
