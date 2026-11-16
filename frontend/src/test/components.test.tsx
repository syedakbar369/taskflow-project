import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { useBoardMove } from '../hooks/useBoardMove';
import { checkFiles, FilePicker } from '../components/FileUploader';
import { deriveOverall, validateReport } from '../components/QAReportForm';
import { validatePassword } from '../pages/Signup';
import { AuthProvider } from '../auth/AuthContext';
import { ToastProvider } from '../components/Toast';
import LoginPage from '../pages/Login';
import { EmptyState, ErrorState, Spinner } from '../components/ui';
import type { Task } from '../lib/types';

function wrapper(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>{children}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.restoreAllMocks());

describe('drag & drop persistence (useBoardMove)', () => {
  const key = ['tasks', 'p1', {}];
  const seed = () => ({ items: [{ id: 't1', status: 'TODO', position: 1000 } as Task] });

  it('optimistically moves and keeps the move when the API succeeds', async () => {
    const qc = new QueryClient();
    qc.setQueryData(key, seed());
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { task: { id: 't1', status: 'DONE' } } });
    vi.spyOn(api, 'get').mockResolvedValue({ data: { items: [{ id: 't1', status: 'DONE', position: 5 }] } });
    const { result } = renderHook(() => useBoardMove(key, vi.fn()), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ id: 't1', status: 'DONE', position: 5 }));
    await waitFor(() => expect(qc.getQueryData<{ items: Task[] }>(key)!.items[0]!.status).toBe('DONE'));
    expect(patch).toHaveBeenCalledWith('/tasks/t1/status', { status: 'DONE', position: 5 });
  });

  it('reverts the UI and reports the server message when the API fails', async () => {
    const qc = new QueryClient();
    qc.setQueryData(key, seed());
    vi.spyOn(api, 'patch').mockRejectedValue(
      Object.assign(new Error('x'), { isAxiosError: true, response: { status: 422, data: { error: { message: 'This task requires QA approval' } } } }),
    );
    const onError = vi.fn();
    const { result } = renderHook(() => useBoardMove(key, onError), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ id: 't1', status: 'DONE', position: 5 }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('This task requires QA approval'));
    expect(qc.getQueryData<{ items: Task[] }>(key)!.items[0]!.status).toBe('TODO');
  });
});

describe('Login page', () => {
  it('shows a helpful error on invalid credentials', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/auth/me') throw Object.assign(new Error('401'), { response: { status: 401 } });
      return { data: { allowSignup: true, hasUsers: true } };
    });
    vi.spyOn(api, 'post').mockRejectedValue(
      Object.assign(new Error('x'), { isAxiosError: true, response: { status: 401, data: { error: { message: 'Incorrect email or password' } } } }),
    );
    const W = wrapper();
    render(
      <W>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </W>,
    );
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
    expect(screen.getByRole('link', { name: 'Create an account' })).toBeInTheDocument();
  });
});

describe('QA report rules', () => {
  const base = { title: 'Run', summary: 'Tested it', testCases: [{ title: 'Case', steps: '', expectedResult: '', actualResult: '', result: 'PASSED' as const }] };
  it('derives overall result from test cases', () => {
    expect(deriveOverall([{ result: 'PASSED' }, { result: 'PASSED' }])).toBe('PASSED');
    expect(deriveOverall([{ result: 'PASSED' }, { result: 'FAILED' }])).toBe('FAILED');
  });
  it('requires actual result for failed cases', () => {
    expect(validateReport(base)).toBeNull();
    expect(validateReport({ ...base, testCases: [{ ...base.testCases[0]!, result: 'FAILED' }] })).toMatch(/actual result/);
    expect(validateReport({ ...base, summary: '' })).toMatch(/summary/);
  });
});

describe('Uploads', () => {
  it('validates type and size on the client', () => {
    expect(checkFiles([new File(['x'], 'a.png')])).toBeNull();
    expect(checkFiles([new File(['x'], 'a.exe')])).toMatch(/not an allowed/);
    expect(checkFiles([new File(['x'], 'a.txt')], 0.0000001)).toMatch(/larger than/);
  });
  it('FilePicker shows an error for rejected files', async () => {
    const onChange = vi.fn();
    render(<FilePicker files={[]} onChange={onChange} />);
    await userEvent.upload(screen.getByLabelText('Choose files'), new File(['x'], 'virus.exe'), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('not an allowed file type');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Shared states & validation', () => {
  it('renders loading, empty and error states', async () => {
    const retry = vi.fn();
    render(
      <>
        <Spinner />
        <EmptyState title="Nothing here" />
        <ErrorState message="Boom" onRetry={retry} />
      </>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });
  it('validates signup passwords', () => {
    expect(validatePassword('short1')).toMatch(/8 characters/);
    expect(validatePassword('longpassword')).toMatch(/number/);
    expect(validatePassword('Secret123')).toBeNull();
  });
});
