import { Link } from 'react-router-dom';
import { describeEvent, eventSuffix, timeAgo } from '../lib/format';
import type { ActivityEvent } from '../lib/types';
import { Avatar, EmptyState } from './ui';

export default function ActivityList({ items, showContext = true }: { items: ActivityEvent[]; showContext?: boolean }) {
  if (!items.length) return <EmptyState title="No activity yet" message="Changes to projects and tasks will show up here." />;
  return (
    <ol className="divide-y divide-slate-100">
      {items.map((e) => {
        const suffix = eventSuffix(e.eventType, e.details);
        return (
          <li key={e.id} className="flex gap-3 px-4 py-2.5">
            {e.actor ? <Avatar name={e.actor.name} url={e.actor.avatarUrl} size={26} /> : <span className="h-[26px] w-[26px] rounded-full bg-slate-200" />}
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-slate-700">
                <span className="font-medium text-slate-900">{e.actor?.name ?? 'System'}</span> {describeEvent(e.eventType, e.details)}{' '}
                {showContext && e.task && (
                  <Link to={`?task=${e.task.id}`} className="font-medium text-slate-900 hover:text-coral-700">
                    {e.task.title}
                  </Link>
                )}
                {showContext && !e.task && e.project && (
                  <Link to={`/projects/${e.project.id}`} className="font-medium text-slate-900 hover:text-coral-700">
                    {e.project.name}
                  </Link>
                )}
              </p>
              <p className="text-xs text-slate-500">
                {suffix && <span className="mr-2">{suffix}</span>}
                {timeAgo(e.createdAt)}
                {showContext && e.project && e.task && <span className="ml-2 text-slate-400">· {e.project.name}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
