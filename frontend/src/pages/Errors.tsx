import { Link } from 'react-router-dom';
import { Compass, ShieldAlert } from 'lucide-react';

function ErrorPage({ code, title, message, icon }: { code: string; title: string; message: string; icon: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 rounded-full bg-coral-50 p-4 text-coral-600">{icon}</div>
      <p className="text-sm font-semibold text-coral-700">{code}</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">{message}</p>
      <Link to="/" className="mt-6 inline-flex h-10 items-center rounded-lg bg-coral-500 px-4 text-sm font-medium text-white hover:bg-coral-600">
        Back to overview
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  return <ErrorPage code="404" title="Page not found" message="The page you're looking for doesn't exist or was moved." icon={<Compass className="h-7 w-7" />} />;
}

export function AccessDeniedPage() {
  return (
    <ErrorPage
      code="403"
      title="Access denied"
      message="Your role doesn't have access to this area. Ask an Admin if you think this is a mistake."
      icon={<ShieldAlert className="h-7 w-7" />}
    />
  );
}
