import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Spinner } from '../components/ui';
import AuthShell from './AuthShell';

/** Signs the user out (server revokes the token) and confirms it. */
export default function LogoutPage() {
  const { logout } = useAuth();
  const [done, setDone] = useState(false);
  useEffect(() => {
    void logout().finally(() => setDone(true));
  }, [logout]);

  if (!done) return <Spinner label="Signing you out…" />;
  return (
    <AuthShell title="You've been signed out" subtitle="Your session has ended on this and every other device.">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-coral-50 text-coral-600">
        <LogOut className="h-6 w-6" />
      </div>
      <div className="flex gap-2">
        <Link to="/login" className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-coral-500 px-4 text-sm font-medium text-white hover:bg-coral-600">
          Sign in again
        </Link>
        <Link to="/signup" className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Create account
        </Link>
      </div>
    </AuthShell>
  );
}
