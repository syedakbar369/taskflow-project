import axios, { AxiosError } from 'axios';

/** API origin. Empty in local dev (Vite proxy); set VITE_API_URL in production (your backend Vercel URL). */
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

const TOKEN_KEY = 'tf_token';

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* storage unavailable */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

export const api = axios.create({ baseURL: `${API_URL}/api`, withCredentials: true });

api.interceptors.request.use((config) => {
  const t = tokenStore.get();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    const url = error.config?.url ?? '';
    if (error.response?.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/signup')) {
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent('tf:unauthorized'));
    }
    return Promise.reject(error);
  },
);

/** Extract a human-friendly message from an API error. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { message?: string } } | undefined;
    if (data?.error?.message) return data.error.message;
    if (!err.response) return 'Cannot reach the server. Check your connection or that the API is running.';
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Download a protected file using the auth header, then trigger a browser save. */
export async function downloadAttachment(id: string, filename: string) {
  const res = await api.get(`/attachments/${id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function previewAttachment(id: string): Promise<string> {
  const res = await api.get(`/attachments/${id}/download`, { responseType: 'blob', params: { inline: 'true' } });
  return URL.createObjectURL(res.data as Blob);
}
