import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, errorMessage } from '../lib/api';
import type { QAReport, TestResult } from '../lib/types';
import { Button, Field, Input, Textarea } from './ui';
import { FilePicker, ProgressBar } from './FileUploader';

interface CaseDraft {
  title: string;
  steps: string;
  expectedResult: string;
  actualResult: string;
  result: TestResult;
}
const blankCase = (): CaseDraft => ({ title: '', steps: '', expectedResult: '', actualResult: '', result: 'PASSED' });

export function deriveOverall(cases: { result: TestResult }[]): TestResult {
  return cases.some((c) => c.result === 'FAILED') ? 'FAILED' : 'PASSED';
}

export function validateReport(r: { title: string; summary: string; testCases: CaseDraft[] }): string | null {
  if (r.title.trim().length < 2) return 'Give the report a title.';
  if (r.summary.trim().length < 3) return 'Write a short test summary.';
  if (r.testCases.length === 0) return 'Add at least one test case.';
  if (r.testCases.some((c) => !c.title.trim())) return 'Every test case needs a title.';
  if (r.testCases.some((c) => c.result === 'FAILED' && !c.actualResult.trim())) return 'Describe the actual result for each failed test case.';
  return null;
}

export default function QAReportForm({ taskId, taskKey, onDone, onCancel }: { taskId: string; taskKey: string; onDone: (r: QAReport) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(`Test run for ${taskKey}`);
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [cases, setCases] = useState<CaseDraft[]>([blankCase()]);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const overall = deriveOverall(cases);

  const submit = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append(
        'data',
        JSON.stringify({
          title: title.trim(),
          summary: summary.trim(),
          notes: notes.trim() || null,
          overallResult: overall,
          testCases: cases.map((c) => ({ ...c, title: c.title.trim() })),
        }),
      );
      files.forEach((f) => fd.append('files', f));
      setProgress(0);
      const res = await api.post<{ report: QAReport }>(`/tasks/${taskId}/qa-reports`, fd, {
        onUploadProgress: (e) => e.total && setProgress(Math.round((e.loaded / e.total) * 100)),
      });
      return res.data.report;
    },
    onSuccess: onDone,
    onError: (e) => {
      setProgress(null);
      setError(errorMessage(e));
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const err = validateReport({ title, summary, testCases: cases });
    setError(err ?? '');
    if (!err) submit.mutate();
  };

  const update = (i: number, patch: Partial<CaseDraft>) => setCases((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4" aria-label="New QA test report" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Report title" htmlFor="qa-title" className="sm:col-span-2">
          <Input id="qa-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Test summary" htmlFor="qa-summary" className="sm:col-span-2">
          <Textarea id="qa-summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What did you test and what did you find?" />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">Test cases</p>
          <Button type="button" size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCases((c) => [...c, blankCase()])}>
            Add case
          </Button>
        </div>
        <ol className="space-y-3">
          {cases.map((c, i) => (
            <li key={i} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 text-xs font-semibold text-slate-400">#{i + 1}</span>
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <Input aria-label={`Case ${i + 1} title`} placeholder="Test case title" value={c.title} onChange={(e) => update(i, { title: e.target.value })} className="sm:col-span-2" />
                  <Textarea aria-label={`Case ${i + 1} steps`} rows={2} placeholder="Steps to reproduce" value={c.steps} onChange={(e) => update(i, { steps: e.target.value })} className="min-h-0 sm:col-span-2" />
                  <Input aria-label={`Case ${i + 1} expected result`} placeholder="Expected result" value={c.expectedResult} onChange={(e) => update(i, { expectedResult: e.target.value })} />
                  <Input aria-label={`Case ${i + 1} actual result`} placeholder="Actual result" value={c.actualResult} onChange={(e) => update(i, { actualResult: e.target.value })} />
                  <div className="flex gap-1 sm:col-span-2" role="radiogroup" aria-label={`Case ${i + 1} result`}>
                    {(['PASSED', 'FAILED'] as TestResult[]).map((r) => (
                      <button
                        type="button"
                        key={r}
                        role="radio"
                        aria-checked={c.result === r}
                        onClick={() => update(i, { result: r })}
                        className={clsx(
                          'rounded-md border px-3 py-1 text-xs font-semibold',
                          c.result === r
                            ? r === 'PASSED'
                              ? 'border-green-300 bg-green-50 text-green-800'
                              : 'border-red-300 bg-red-50 text-red-700'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                        )}
                      >
                        {r === 'PASSED' ? 'Pass' : 'Fail'}
                      </button>
                    ))}
                  </div>
                </div>
                {cases.length > 1 && (
                  <button type="button" aria-label={`Remove case ${i + 1}`} className="mt-2 text-slate-400 hover:text-red-600" onClick={() => setCases((cs) => cs.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <Field label="Notes (optional)" htmlFor="qa-notes">
        <Textarea id="qa-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Environment, browser, build number…" />
      </Field>
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Evidence</p>
        <FilePicker files={files} onChange={setFiles} disabled={submit.isPending} />
      </div>
      {progress !== null && submit.isPending && <ProgressBar value={progress} />}

      <div className={clsx('rounded-lg px-3 py-2 text-sm font-medium', overall === 'PASSED' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700')} data-testid="overall-result">
        Overall result: {overall === 'PASSED' ? 'Passed — the task will move to Done.' : 'Failed — the task will be reopened and returned to the developer.'}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant={overall === 'PASSED' ? 'success' : 'danger'} loading={submit.isPending}>
          Submit {overall === 'PASSED' ? 'pass' : 'fail'} report
        </Button>
      </div>
    </form>
  );
}
