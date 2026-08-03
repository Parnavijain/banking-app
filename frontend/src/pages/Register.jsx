import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register, loading } = useAuth();
  const nav = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await register(email, password, fullName);
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
          <h1 className="text-2xl font-semibold text-ink">Create an account</h1>
          <p className="text-sm text-slate-600 mt-1">
            Starts with $1,000 for demo purposes.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Full name</label>
            <input className="input" value={fullName}
              onChange={(e) => setFullName(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={email}
              onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" value={password}
              onChange={(e) => setPassword(e.target.value)}
              required minLength={8} />
            <p className="text-xs text-slate-500 mt-1">At least 8 characters.</p>
          </div>
          {error && <div className="text-sm text-debit">{error}</div>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <div className="mt-6 text-sm text-slate-600">
          Already have one?{' '}
          <Link to="/login" className="text-accent font-medium hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
