import { useEffect, useState } from 'react';
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useAuth } from '../context/AuthContext';

// Deliberately restrained palette. Teal is the "hero" accent from the rest
// of the app; the rest are tonal supporting colors so nothing screams.
const CATEGORY_COLORS = {
  food:          '#0F766E', // teal-700 (accent)
  bills:         '#0891B2', // cyan-600
  rent:          '#7C3AED', // violet-600
  shopping:      '#DB2777', // pink-600
  entertainment: '#EA580C', // orange-600
  transfer:      '#64748B', // slate-500
  other:         '#94A3B8', // slate-400
};

const MONTH_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' });

export default function Analytics({ accountId }) {
  const { token } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    setError('');
    api(`/api/analytics/summary?accountId=${accountId}&days=${days}`, { token })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [accountId, days, token]);

  if (!accountId) return null;
  if (error) return <div className="text-sm text-debit">{error}</div>;
  if (!data && loading) return <div className="text-sm text-slate-500">Loading analytics…</div>;
  if (!data) return null;

  const { totals, byCategory, byMonth, topPartners } = data;
  const hasActivity = totals.inCount + totals.outCount > 0;

  return (
    <div className="space-y-6">
      {/* Header + window selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <div className="flex gap-1 p-1 bg-white border border-border rounded-lg text-xs">
          {[7, 30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded transition-colors ${
                days === d
                  ? 'bg-accent text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {d === 365 ? '1y' : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      {!hasActivity ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          No activity in this window. Send or receive money to see analytics.
        </div>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Money in"  value={formatMoney(totals.in)}
                 sub={`${totals.inCount} transactions`}  tone="credit" />
            <Kpi label="Money out" value={formatMoney(totals.out)}
                 sub={`${totals.outCount} transactions`} tone="debit" />
            <Kpi label="Net"       value={formatMoney(totals.net)}
                 sub={totals.net >= 0 ? 'You gained' : 'You spent'}
                 tone={totals.net >= 0 ? 'credit' : 'debit'} />
            <Kpi label="Activity"  value={String(totals.inCount + totals.outCount)}
                 sub="Total transactions" />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Spend by category donut */}
            <div className="card p-6">
              <div className="text-sm font-semibold mb-4">Spending by category</div>
              {byCategory.length === 0 ? (
                <div className="text-sm text-slate-500 py-8 text-center">
                  No outgoing transactions.
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byCategory}
                        dataKey="total"
                        nameKey="category"
                        cx="50%" cy="50%"
                        innerRadius={55} outerRadius={90}
                        paddingAngle={2}
                      >
                        {byCategory.map((entry, i) => (
                          <Cell key={i} fill={CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.other} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatMoney(value)}
                        contentStyle={{
                          background: '#fff', border: '1px solid #E4E7EC',
                          borderRadius: 8, fontSize: 12,
                        }}
                      />
                      <Legend
                        verticalAlign="bottom" height={36}
                        wrapperStyle={{ fontSize: 12 }}
                        formatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Monthly bar chart */}
            <div className="card p-6">
              <div className="text-sm font-semibold mb-4">Monthly flow</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={byMonth.map((m) => ({
                      month: MONTH_FMT.format(new Date(m.bucket)),
                      in: m.in, out: m.out,
                    }))}
                    margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                  >
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }}
                           tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <Tooltip
                      formatter={(v) => formatMoney(v)}
                      contentStyle={{
                        background: '#fff', border: '1px solid #E4E7EC',
                        borderRadius: 8, fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="in"  name="In"  fill="#047857" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="out" name="Out" fill="#B91C1C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top counterparties */}
          <div className="card p-6">
            <div className="text-sm font-semibold mb-4">Top counterparties</div>
            {topPartners.length === 0 ? (
              <div className="text-sm text-slate-500">No counterparties yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {topPartners.map((p) => (
                  <li key={p.account_number} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-ink">{p.name}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {p.account_number} · {p.count} tx
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                      {formatMoney(p.total)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone }) {
  const toneClass =
    tone === 'credit' ? 'text-credit' :
    tone === 'debit'  ? 'text-debit'  : 'text-ink';
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
