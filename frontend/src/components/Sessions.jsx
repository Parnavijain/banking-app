import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useAuth } from '../context/AuthContext';

export default function Sessions() {
  const { token, logout } = useAuth();
  const [items, setItems] = useState([]);

  const load = () => api('/api/auth/sessions', { token }).then(setItems).catch(console.error);
  useEffect(() => { load(); }, [token]);

  async function revoke(jti) {
    await api(`/api/auth/sessions/${jti}`, { method: 'DELETE', token });
    load();
  }

  async function logoutAll() {
    if (!confirm('Sign out of every OTHER session? Your current session stays.')) return;
    await api('/api/auth/logout-all', { method: 'POST', token });
    load();
  }

  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-lg font-semibold">Active sessions</h2>
        <button onClick={logoutAll} className="btn-ghost text-xs text-debit border-debit">
          Sign out of all other sessions
        </button>
      </div>
      <ul className="divide-y divide-border">
        {items.filter((s) => !s.revoked_at).map((s) => (
          <li key={s.jti} className="px-6 py-4 flex items-center justify-between">
            <div className="min-w-0 pr-4">
              <div className="text-sm font-medium text-ink truncate flex items-center gap-2">
                <span>{s.user_agent || 'Unknown device'}</span>
                {s.is_current && (
                  <span className="text-[10px] uppercase bg-accentSoft text-accent px-1.5 py-0.5 rounded">
                    This session
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 font-mono truncate">
                {s.ip || 'unknown ip'} · issued {formatDateTime(s.issued_at)}
              </div>
              <div className="text-xs text-slate-500">
                Last active {formatDateTime(s.last_seen_at)}
              </div>
            </div>
            {!s.is_current && (
              <button onClick={() => revoke(s.jti)} className="text-xs text-debit hover:underline">
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="px-6 py-4 border-t border-border">
        <button onClick={logout} className="btn-ghost text-sm w-full">
          Sign out of this session
        </button>
      </div>
    </div>
  );
}
