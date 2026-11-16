import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';
import { Button, Field, Input } from '../components/ui';
import AuthShell from './AuthShell';

const DEMO = [
  ['Admin', 'admin@taskflow.dev'],
  ['Manager', 'manager@taskflow.dev'],
  ['QA', 'qa1@taskflow.dev'],
  ['Developer', 'dev1@taskflow.dev'],
] as const;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; message?: string } | null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { data: config } = useQuery({
    queryKey: ['auth-config'],
    queryFn: async () => (await api.get<{ allowSignup: boolean; hasUsers: boolean }>('/auth/config')).data,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email || !password) return setError('Enter your email and password.');
    setLoading(true);
    try {
      await login(email, password);
      navigate(state?.from && state.from !== '/logout' ? state.from : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your TaskFlow workspace.">
      {state?.message && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{state.message}</p>}
      {config && !config.hasUsers && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No accounts exist yet. <Link to="/signup" className="font-semibold underline">Create the first account</Link> — it becomes the Admin.
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>
      {config?.allowSignup !== false && (
        <p className="mt-6 text-center text-sm text-slate-600">
          New to TaskFlow?{' '}
          <Link to="/signup" className="font-medium text-coral-700 hover:underline">
            Create an account
          </Link>
        </p>
      )}
      {import.meta.env.DEV && (
        <div className="mt-8 rounded-lg border border-dashed border-slate-200 p-3">
          <p className="mb-2 text-xs font-medium text-slate-500">Development demo accounts (after running the seed):</p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO.map(([label, mail]) => (
              <button key={mail} type="button" onClick={() => setEmail(mail)} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200">
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Password is the SEED_PASSWORD from backend/.env</p>
        </div>
      )}
    </AuthShell>
  );
}
