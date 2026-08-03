import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatMoney, formatDateTime } from '../lib/format';
import { useAuth } from '../context/AuthContext';

export default function Admin() {
  const { token } = useAuth();
  const [sub, setSub] = useState('users');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 text-sm">
        {[
          { id: 'users',        label: 'Users' },
          { id: 'transactions', label: 'All transactions' },
          { id: 'proposals',    label: 'Proposals' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-3 py-1.5 rounded transition-colors ${
              sub === t.id ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'users'        && <Users token={token} />}
      {sub === 'transactions' && <Transactions token={token} />}
      {sub === 'proposals'    && <Proposals token={token} />}
    </div>
  );
}

function Users({ token }) {
  const [users, setUsers] = useState([]);
  useEffect(() => { api('/api/admin/users', { token }).then(setUsers).catch(console.error); }, [token]);
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
          <tr>
            <th className="text-left px-4 py-2">User</th>
            <th className="text-left px-4 py-2">Role</th>
            <th className="text-right px-4 py-2">Accounts</th>
            <th className="text-right px-4 py-2">Total balance</th>
            <th className="text-left px-4 py-2">Joined</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3">
                <div className="font-medium">{u.full_name}</div>
                <div className="text-xs text-slate-500">{u.email}</div>
              </td>
              <td className="px-4 py-3">{u.role}</td>
              <td className="px-4 py-3 text-right tabular-nums">{u.account_count}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatMoney(u.total_balance)}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(u.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Transactions({ token }) {
  const [txs, setTxs] = useState([]);
  useEffect(() => { api('/api/admin/transactions?limit=100', { token }).then(setTxs).catch(console.error); }, [token]);
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
          <tr>
            <th className="text-left px-4 py-2">When</th>
            <th className="text-left px-4 py-2">From</th>
            <th className="text-left px-4 py-2">To</th>
            <th className="text-right px-4 py-2">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {txs.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(t.created_at)}</td>
              <td className="px-4 py-3">
                <div className="text-xs">{t.sender_email}</div>
                <div className="text-xs font-mono text-slate-500">{t.sender_account}</div>
              </td>
              <td className="px-4 py-3">
                <div className="text-xs">{t.receiver_email}</div>
                <div className="text-xs font-mono text-slate-500">{t.receiver_account}</div>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatMoney(t.amount, t.sender_currency)}
                {t.fx_rate && (
                  <div className="text-xs text-slate-500">
                    → {formatMoney(t.received_amount, t.received_currency)} @ {Number(t.fx_rate).toFixed(4)}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Proposals({ token }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  // Propose form
  const [action, setAction] = useState('freeze_account');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [reason, setReason] = useState('');

  const load = () => api('/api/admin/proposals?status=pending', { token }).then(setItems).catch(console.error);
  useEffect(load, [token]);

  async function propose(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/api/admin/proposals', {
        method: 'POST', token,
        body: { action, targetAccountId: Number(targetAccountId), reason },
      });
      setTargetAccountId(''); setReason('');
      load();
    } catch (e) { setError(e.message); }
  }

  async function decide(id, decision) {
    try {
      await api(`/api/admin/proposals/${id}/${decision}`, { method: 'POST', token });
      load();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-1">
        <div className="card p-6">
          <h3 className="text-sm font-semibold mb-4">Propose an action</h3>
          <form onSubmit={propose} className="space-y-3">
            <div>
              <label className="label">Action</label>
              <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="freeze_account">Freeze account</option>
                <option value="unfreeze_account">Unfreeze account</option>
              </select>
            </div>
            <div>
              <label className="label">Target account ID</label>
              <input type="number" className="input" value={targetAccountId}
                     onChange={(e) => setTargetAccountId(e.target.value)} required />
              <p className="text-xs text-slate-500 mt-1">Get account IDs from the Users tab.</p>
            </div>
            <div>
              <label className="label">Reason</label>
              <textarea className="input" rows={3} value={reason}
                        onChange={(e) => setReason(e.target.value)} />
            </div>
            {error && <div className="text-sm text-debit">{error}</div>}
            <button className="btn-primary w-full">Submit for approval</button>
            <p className="text-xs text-slate-500">
              A second admin must approve before the action takes effect.
            </p>
          </form>
        </div>
      </section>

      <section className="lg:col-span-2">
        <div className="card">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-sm font-semibold">Pending proposals</h3>
          </div>
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No pending proposals.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((p) => (
                <li key={p.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-ink">
                        {p.action.replace('_', ' ')} — account{' '}
                        <span className="font-mono">{p.target_account_number}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Proposed by {p.proposed_by_email} · {formatDateTime(p.created_at)}
                      </div>
                      {p.reason && (
                        <div className="text-xs text-slate-600 mt-1 italic">"{p.reason}"</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => decide(p.id, 'reject')}
                              className="btn-ghost text-xs">Reject</button>
                      <button onClick={() => decide(p.id, 'approve')}
                              className="btn-primary text-xs">Approve</button>
                    </div>
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
