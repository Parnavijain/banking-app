import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { formatMoney, formatDateTime } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import TransferForm from '../components/TransferForm';
import Analytics from '../components/Analytics';
import Wallets from '../components/Wallets';
import Scheduled from '../components/Scheduled';
import Statements from '../components/Statements';
import Sessions from '../components/Sessions';
import Admin from '../components/Admin';

const CATEGORY_LABEL = {
  food: 'Food', bills: 'Bills', rent: 'Rent',
  shopping: 'Shopping', entertainment: 'Entertainment',
  transfer: 'Transfer', other: 'Other',
};

export default function Dashboard() {
  const { user, logout, token } = useAuth();
  const { connected, on } = useSocket();
  const toast = useToast();

  const [tab, setTab] = useState('overview');
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [flashId, setFlashId] = useState(null);

  const loadAccounts = useCallback(async () => {
    const list = await api('/api/accounts', { token });
    setAccounts(list);
    if (!selectedAccountId && list.length) setSelectedAccountId(list[0].id);
  }, [token, selectedAccountId]);

  const loadTransactions = useCallback(async (accountId) => {
    if (!accountId) return;
    const list = await api(`/api/transfers?accountId=${accountId}`, { token });
    setTransactions(list);
  }, [token]);

  useEffect(() => { loadAccounts().catch(console.error); }, [loadAccounts]);
  useEffect(() => {
    if (selectedAccountId) loadTransactions(selectedAccountId).catch(console.error);
  }, [selectedAccountId, loadTransactions]);

  useEffect(() => {
    const offSent = on('transfer:sent', (evt) => {
      toast.push({
        kind: 'debit', title: 'Money sent',
        message: `Sent ${formatMoney(evt.amount, evt.currency)}`,
      });
      loadAccounts();
      loadTransactions(selectedAccountId);
      setFlashId(evt.transactionId);
      setTimeout(() => setFlashId(null), 1500);
    });
    const offRecv = on('transfer:received', (evt) => {
      toast.push({
        kind: 'credit', title: 'Money received',
        message: `Received ${formatMoney(evt.amount, evt.currency)}`,
      });
      loadAccounts();
      loadTransactions(selectedAccountId);
      setFlashId(evt.transactionId);
      setTimeout(() => setFlashId(null), 1500);
    });
    return () => { offSent(); offRecv(); };
  }, [on, toast, loadAccounts, loadTransactions, selectedAccountId]);

  // Regular tabs — Admin appears conditionally
  const tabs = [
    { id: 'overview',  label: 'Overview' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'wallets',   label: 'Wallets' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'statements', label: 'Statements' },
    { id: 'sessions',  label: 'Sessions' },
    ...(user?.role === 'admin' ? [{ id: 'admin', label: 'Admin' }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xs uppercase tracking-widest text-accent font-semibold">
              Banking
            </div>
            <span
              className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${
                connected ? 'bg-accentSoft text-accent' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                connected ? 'bg-accent' : 'bg-slate-400'
              }`} />
              {connected ? 'Live' : 'Offline'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-600">
              {user?.fullName}
              {user?.role === 'admin' && (
                <span className="ml-2 text-xs bg-ink text-white px-2 py-0.5 rounded">
                  admin
                </span>
              )}
            </div>
            <button onClick={logout} className="btn-ghost text-sm">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Accounts row — hidden on Admin & Sessions where they're not relevant */}
        {!['admin', 'sessions'].includes(tab) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedAccountId(a.id)}
                className={`card p-5 text-left transition-all ${
                  selectedAccountId === a.id
                    ? 'ring-2 ring-accent border-accent'
                    : 'hover:border-slate-300'
                }`}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs text-slate-500">{a.currency}</span>
                  {a.status === 'frozen' && (
                    <span className="text-[10px] uppercase bg-red-50 text-debit px-1.5 py-0.5 rounded">
                      Frozen
                    </span>
                  )}
                </div>
                <div className="font-mono text-xs text-slate-500 mb-2">{a.account_number}</div>
                <div className="text-2xl font-semibold text-ink tabular-nums">
                  {formatMoney(a.balance, a.currency)}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-border mb-6 gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-slate-600 hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-1">
              <div className="card p-6">
                <h2 className="text-lg font-semibold mb-4">Send money</h2>
                {accounts.length > 0 && (
                  <TransferForm
                    accounts={accounts}
                    onTransferComplete={() => {
                      loadAccounts();
                      loadTransactions(selectedAccountId);
                    }}
                  />
                )}
              </div>
            </section>

            <section className="lg:col-span-2">
              <div className="card">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Recent activity</h2>
                  <span className="text-xs text-slate-500">
                    {transactions.length} transactions
                  </span>
                </div>
                {transactions.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No transactions yet.
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {transactions.map((t) => {
                      const isCredit = t.direction === 'credit';
                      return (
                        <li
                          key={t.id}
                          className={`px-6 py-4 flex items-center justify-between transition-colors ${
                            flashId === t.id ? 'bg-accentSoft' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                isCredit
                                  ? 'bg-emerald-50 text-credit'
                                  : 'bg-red-50 text-debit'
                              }`}
                            >
                              {isCredit ? '↓' : '↑'}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-ink flex items-center gap-2">
                                <span>
                                  {isCredit ? 'From ' : 'To '}
                                  <span className="font-mono">
                                    {isCredit
                                      ? t.sender_account_number
                                      : t.receiver_account_number}
                                  </span>
                                </span>
                                {t.category && !isCredit && (
                                  <span className="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                    {CATEGORY_LABEL[t.category] || t.category}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500">
                                {formatDateTime(t.created_at)}
                                {t.note && <> · {t.note}</>}
                              </div>
                            </div>
                          </div>
                          <div
                            className={`text-sm font-semibold tabular-nums ${
                              isCredit ? 'text-credit' : 'text-debit'
                            }`}
                          >
                            {isCredit ? '+' : '−'}
                            {formatMoney(t.amount)}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}

        {tab === 'analytics'  && <Analytics accountId={selectedAccountId} />}
        {tab === 'wallets'    && <Wallets onAccountsChange={loadAccounts} />}
        {tab === 'scheduled'  && <Scheduled accounts={accounts} />}
        {tab === 'statements' && <Statements accounts={accounts} />}
        {tab === 'sessions'   && <Sessions />}
        {tab === 'admin'      && user?.role === 'admin' && <Admin />}
      </main>
    </div>
  );
}
