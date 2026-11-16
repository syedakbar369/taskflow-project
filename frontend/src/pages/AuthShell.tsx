import { useEffect, useRef, type ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Logo } from '../components/Layout';
import { enterChildren } from '../lib/motion';

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => enterChildren(ref.current), []);
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[#FFF4F1] p-12 lg:flex">
        <Logo className="text-lg" />
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight text-slate-900">Plan the work, test the work, ship the work.</h2>
          <p className="mt-3 text-slate-600">
            TaskFlow brings projects, boards and a real QA workflow together, so developers, testers and managers stay on the same page.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-700">
            {[
              'Drag-and-drop boards with live updates',
              'QA test reports with pass/fail and evidence',
              'Role-based dashboards for every team member',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-500">© {new Date().getFullYear()} TaskFlow</p>
      </div>
      <div className="flex items-center justify-center bg-white px-4 py-10 sm:px-8">
        <div ref={ref} className="w-full max-w-sm">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
