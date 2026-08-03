import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useAuth } from '../context/AuthContext';

export default function Wallets({ onAccountsChange }) {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [rates, setRates] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    Promise.all([
      api('/api/accounts', { token }),
      api('/api/fx-rates', { token }),
    ]).then(([a, r]) => { setAccounts(a); setRates(r); });
  };

  useEffect(() => { load(); }, [token]);

  async function openWallet(currency) {
    setBusy(true); setError('');
    try {
      await api('/api/accounts', { method: 'POST', token, body: { currency } });
      load();
      onAccountsChange?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const owned = new Set(accounts.map((a) => a.currency));
  const available = ['USD', 'EUR', 'GBP'].filter((c) => !owned.has(c));

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Your wallets</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {accounts.map((a) => (
            <div key={a.id} className="border border-border rounded-lg p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  {a.currency}
                </span>
                {a.status === 'frozen' && (
                  <span className="text-[10px] uppercase bg-red-50 text-debit px-1.5 py-0.5 rounded">
                    Frozen
                  </span>
                )}
              </div>
              <div className="text-xl font-semibold tabular-nums mt-1">
                {formatMoney(a.balance, a.currency)}
              </div>
              <div className="text-xs text-slate-500 font-mono mt-2">
                {a.account_number}
              </div>
            </div>
          ))}
        </div>
      </div>

      {available.length > 0 && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold mb-3">Open a new wallet</h3>
          <div className="flex gap-2">
            {available.map((c) => (
              <button
                key={c} onClick={() => openWallet(c)} disabled={busy}
                className="btn-ghost"
              >
                + {c}
              </button>
            ))}
          </div>
          {error && <div className="text-sm text-debit mt-2">{error}</div>}
          <p className="text-xs text-slate-500 mt-3">
            New wallets start at 0. Transfer from your existing wallet
            (converted automatically at current FX rate).
          </p>
        </div>
      )}

      <div className="card p-6">
        <h3 className="text-sm font-semibold mb-3">FX rates</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          {rates.filter((r) => r.from_currency !== r.to_currency).map((r) => (
            <div key={`${r.from_currency}-${r.to_currency}`}
                 className="flex justify-between px-3 py-2 bg-slate-50 rounded">
              <span className="font-mono">{r.from_currency} → {r.to_currency}</span>
              <span className="tabular-nums font-semibold">{Number(r.rate).toFixed(4)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Reference rates only. Demo data.
        </p>
      </div>
    </div>
  );
}
