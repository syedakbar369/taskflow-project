import { useState } from 'react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { canDrag, columnTasks, computeDrop } from '../lib/board';
import { STATUSES, STATUS_LABEL } from '../lib/format';
import type { Role, Task, TaskStatus } from '../lib/types';
import { TaskCard, StatusDot } from './TaskBits';

interface Props {
  tasks: Task[];
  user: { id: string; role: Role };
  canManage: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, status: TaskStatus, position: number) => void;
  onAdd?: (status: TaskStatus) => void;
}

export default function Board({ tasks, user, canManage, onOpen, onMove, onAdd }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const active = tasks.find((t) => t.id === activeId);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const drop = computeDrop(tasks, String(e.active.id), String(e.over.id));
    if (drop) onMove(String(e.active.id), drop.status, drop.position);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="grid gap-4 md:grid-cols-3" aria-label="Task board">
        {STATUSES.map((s) => (
          <Column key={s} status={s} tasks={columnTasks(tasks, s)} user={user} canManage={canManage} onOpen={onOpen} onAdd={canManage && onAdd ? () => onAdd(s) : undefined} />
        ))}
      </div>
      <DragOverlay>{active ? <div className="rotate-1 cursor-grabbing"><TaskCard task={active} dragging /></div> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ status, tasks, user, canManage, onOpen, onAdd }: { status: TaskStatus; tasks: Task[]; user: Props['user']; canManage: boolean; onOpen: (id: string) => void; onAdd?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABEL[status]} column`}
      data-testid={`column-${status}`}
      className={clsx('flex min-h-[200px] flex-col rounded-xl border bg-slate-50/80 p-2.5 transition-colors', isOver ? 'border-coral-300 bg-coral-50/50' : 'border-slate-200')}
    >
      <header className="mb-2 flex items-center gap-2 px-1">
        <StatusDot status={status} />
        <h3 className="text-sm font-semibold text-slate-700">{STATUS_LABEL[status]}</h3>
        <span className="rounded-full bg-white px-2 text-xs font-medium text-slate-500">{tasks.length}</span>
        {onAdd && (
          <button onClick={onAdd} className="ml-auto rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label={`Add task to ${STATUS_LABEL[status]}`}>
            <Plus className="h-4 w-4" />
          </button>
        )}
      </header>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2">
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} disabled={!canDrag(t, user, canManage)} onOpen={() => onOpen(t.id)} />
          ))}
          {tasks.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">Drop tasks here</p>}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({ task, disabled, onOpen }: { task: Task; disabled: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(isDragging && 'opacity-40', !disabled && 'cursor-grab touch-none')}
      data-testid={`card-${task.id}`}
      {...attributes}
      {...listeners}
      aria-roledescription={disabled ? undefined : 'Draggable task. Press space to pick up, arrow keys to move.'}
    >
      <TaskCard task={task} onOpen={onOpen} />
    </div>
  );
}
