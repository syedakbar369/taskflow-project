import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { fileSize } from '../lib/format';

export const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'txt', 'csv', 'zip', 'mp4', 'log'];
export const MAX_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 25;

export function checkFiles(files: File[], maxMb = MAX_MB): string | null {
  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXT.includes(ext)) return `"${f.name}" is not an allowed file type (${ALLOWED_EXT.join(', ')}).`;
    if (f.size > maxMb * 1024 * 1024) return `"${f.name}" is larger than ${maxMb} MB.`;
    if (f.size === 0) return `"${f.name}" is empty.`;
  }
  if (files.length > 10) return 'You can upload up to 10 files at once.';
  return null;
}

/** File picker with client-side validation (server validates again). */
export function FilePicker({ files, onChange, disabled }: { files: File[]; onChange: (f: File[]) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    const err = checkFiles(next);
    setError(err ?? '');
    if (!err) onChange(next);
  };
  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm ${over ? 'border-coral-400 bg-coral-50' : 'border-slate-200'}`}
      >
        <Upload className="h-5 w-5 text-slate-400" />
        <p className="text-slate-600">
          Drag files here or{' '}
          <button type="button" disabled={disabled} className="font-medium text-coral-700 hover:underline" onClick={() => ref.current?.click()}>
            browse
          </button>
        </p>
        <p className="text-xs text-slate-400">PNG, JPG, WEBP, PDF, TXT, CSV, LOG, ZIP, MP4 · up to {MAX_MB} MB each</p>
        <input
          ref={ref}
          type="file"
          multiple
          hidden
          aria-label="Choose files"
          accept={ALLOWED_EXT.map((e) => `.${e}`).join(',')}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1 text-xs">
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-slate-400">{fileSize(f.size)}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
      <div className="h-full rounded-full bg-coral-500 transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}
