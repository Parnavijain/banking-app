import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      nav('/');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-accent font-semibold mb-1">
            Banking
          </div>
          <h1 className="text-2xl font-semibold text-ink">Sign in</h1>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email" className="input" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password" className="input" value={password}
              onChange={(e) => setPassword(e.target.value)} required
            />
          </div>
          {error && <div className="text-sm text-debit">{error}</div>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="mt-6 text-sm text-slate-600">
          No account?{' '}
          <Link to="/register" className="text-accent font-medium hover:underline">
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}
