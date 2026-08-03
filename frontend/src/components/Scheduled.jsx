import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatMoney, formatDateTime } from '../lib/format';
import { useAuth } from '../context/AuthContext';

export default function Scheduled({ accounts }) {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id || '');
  const [toAccountNumber, setToAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [firstRunAt, setFirstRunAt] = useState(() => {
    const d = new Date(); d.setMinutes(d.getMinutes() + 2);
    return d.toISOString().slice(0, 16);
  });

  const load = () => api('/api/scheduled-payments', { token }).then(setItems).catch(console.error);
  useEffect(() => { load(); }, [token]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/api/scheduled-payments', {
        method: 'POST', token,
        body: {
          fromAccountId: Number(fromAccountId),
          toAccountNumber: toAccountNumber.trim(),
          amount: Number(amount),
          note: note || undefined,
          frequency,
          firstRunAt: new Date(firstRunAt).toISOString(),
        },
      });
      setToAccountNumber(''); setAmount(''); setNote('');
      load();
    } catch (e) { setError(e.message); }
  }

  async function cancel(id) {
    await api(`/api/scheduled-payments/${id}`, { method: 'DELETE', token });
    load();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-1">
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Schedule a payment</h2>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="label">From</label>
              <select className="input" value={fromAccountId}
                      onChange={(e) => setFromAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_number} — {a.currency}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">To account number</label>
              <input className="input font-mono" value={toAccountNumber}
                     onChange={(e) => setToAccountNumber(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Amount</label>
                <input type="number" step="0.01" min="0.01" className="input"
                       value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div>
                <label className="label">Frequency</label>
                <select className="input" value={frequency}
                        onChange={(e) => setFrequency(e.target.value)}>
                  <option value="once">Once</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">First run</label>
              <input type="datetime-local" className="input" value={firstRunAt}
                     onChange={(e) => setFirstRunAt(e.target.value)} required />
            </div>
            <div>
              <label className="label">Note</label>
              <input className="input" value={note} maxLength={200}
                     onChange={(e) => setNote(e.target.value)} />
            </div>
            {error && <div className="text-sm text-debit">{error}</div>}
            <button className="btn-primary w-full">Create schedule</button>
          </form>
        </div>
      </section>

      <section className="lg:col-span-2">
        <div className="card">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold">Your schedules</h2>
          </div>
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No scheduled payments.</div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((s) => (
                <li key={s.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-ink">
                      {formatMoney(s.amount, s.from_currency)}
                      {' '}<span className="text-slate-500">to</span>{' '}
                      <span className="font-mono">{s.to_account_number}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {s.frequency} · next run {formatDateTime(s.next_run_at)}
                      {s.last_error && (
                        <span className="text-debit"> · last error: {s.last_error}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs uppercase px-2 py-0.5 rounded ${
                      s.status === 'active' ? 'bg-accentSoft text-accent' :
                      s.status === 'completed' ? 'bg-slate-100 text-slate-600' :
                      'bg-red-50 text-debit'
                    }`}>{s.status}</span>
                    {s.status === 'active' && (
                      <button onClick={() => cancel(s.id)} className="text-xs text-debit hover:underline">
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
