import React from 'react';
import {
  normalizeDifficulty,
  type CanonicalDifficulty,
  type Difficulty,
  type EvaluationMode,
} from '../types/domain.ts';
import { Clock, AlertCircle, CheckCircle2, ShieldAlert, GraduationCap } from 'lucide-react';

export const DIFFICULTIES: Array<{
  value: CanonicalDifficulty;
  label: string;
  badge: string;
}> = [
  { value: 'beginner', label: 'Beginner', badge: '⭐' },
  { value: 'easy', label: 'Easy', badge: '⭐⭐' },
  { value: 'intermediate', label: 'Intermediate', badge: '⭐⭐⭐' },
  { value: 'advanced', label: 'Advanced', badge: '⭐⭐⭐⭐' },
  { value: 'expert', label: 'Expert', badge: '⭐⭐⭐⭐⭐' },
  { value: 'adaptive', label: 'Adaptive', badge: '⚡ AUTO' },
];

export const DifficultySelector: React.FC<{
  value: Difficulty;
  onChange: (difficulty: CanonicalDifficulty) => void;
  idPrefix?: string;
}> = ({ value, onChange, idPrefix = 'diff' }) => {
  const normalizedValue = normalizeDifficulty(value);
  return (
    <div
      role="radiogroup"
      aria-label="Difficulty Selection"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2"
    >
      {DIFFICULTIES.map((item) => {
        const active = normalizedValue === item.value;
        return (
          <button
            key={item.value}
            id={`${idPrefix}-${item.value}`}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.value)}
            className={`flex items-center justify-between gap-1 px-2.5 sm:px-3 py-2.5 min-h-[42px] rounded-full border text-xs font-bold transition-all cursor-pointer whitespace-nowrap min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
              active
                ? 'bg-gradient-to-r from-indigo-950/95 via-blue-950/90 to-slate-900 border-cyan-400 text-white shadow-[0_0_16px_rgba(34,211,238,0.25)]'
                : 'bg-[#080D1E] border-slate-800/90 text-slate-300 hover:border-slate-600 hover:text-white'
            }`}
          >
            <span className="truncate">{item.label}</span>
            <span className="text-[10px] font-mono text-amber-300/90 tracking-tighter shrink-0">
              {item.badge}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const EvaluationModeSelector: React.FC<{
  value: EvaluationMode;
  onChange: (mode: EvaluationMode) => void;
  idPrefix?: string;
}> = ({ value, onChange, idPrefix = 'eval-mode' }) => {
  const options: Array<{
    value: EvaluationMode;
    label: string;
    badge: string;
    icon: React.ReactNode;
  }> = [
    {
      value: 'practice',
      label: 'Practice Mode',
      badge: 'Live Feedback · Undo',
      icon: <GraduationCap className="w-4 h-4 text-amber-400 shrink-0" />,
    },
    {
      value: 'exam',
      label: 'Exam Mode',
      badge: 'Strict Timed · No Undo',
      icon: <ShieldAlert className="w-4 h-4 text-violet-400 shrink-0" />,
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Evaluation Mode Selection"
      className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            id={`${idPrefix}-${opt.value}`}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`px-3.5 sm:px-4 py-2.5 min-h-[44px] rounded-2xl sm:rounded-full border transition-all flex flex-wrap items-center justify-between gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
              active
                ? 'bg-gradient-to-r from-indigo-950/95 to-blue-950/85 border-cyan-400 text-slate-100 shadow-[0_0_16px_rgba(34,211,238,0.2)]'
                : 'bg-[#080D1E] border-slate-800/90 text-slate-300 hover:border-slate-700 hover:text-white'
            }`}
          >
            <span className="inline-flex items-center gap-2 text-xs font-bold">
              {opt.icon}
              <span>{opt.label}</span>
            </span>
            <span className="text-[11px] font-mono text-slate-400">{opt.badge}</span>
          </button>
        );
      })}
    </div>
  );
};

export const SessionLengthSelector: React.FC<{
  value: number;
  onChange: (count: number) => void;
  idPrefix?: string;
}> = ({ value, onChange, idPrefix = 'session-len' }) => {
  const presets = [10, 25, 50];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((preset) => {
        const active = value === preset;
        return (
          <button
            key={preset}
            id={`${idPrefix}-preset-${preset}`}
            type="button"
            onClick={() => onChange(preset)}
            className={`px-3.5 py-2 min-h-[40px] text-xs font-mono font-bold rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
              active
                ? 'bg-gradient-to-r from-amber-500/25 to-orange-500/20 border-amber-400 text-amber-200 shadow-xs'
                : 'bg-[#080D1E] border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            {preset} Questions
          </button>
        );
      })}
      <div className="flex items-center gap-1.5">
        <label htmlFor={`${idPrefix}-custom`} className="text-xs text-slate-400">
          Custom:
        </label>
        <input
          id={`${idPrefix}-custom`}
          type="number"
          min={1}
          max={100}
          value={value}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (Number.isFinite(parsed)) {
              onChange(Math.max(1, Math.min(100, Math.round(parsed))));
            }
          }}
          className="w-20 px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#080D1E] border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-400"
        />
      </div>
    </div>
  );
};

/**
 * Circular SVG countdown ring + linear progress bar matching the PDF gameplay screens
 */
export const TimerBar: React.FC<{
  remainingSeconds: number;
  totalSeconds: number;
  visible?: boolean;
  label?: string;
  accent?: 'amber' | 'violet' | 'teal' | 'cyan';
}> = ({
  remainingSeconds,
  totalSeconds,
  visible = true,
  label = 'Time Remaining',
  accent = 'cyan',
}) => {
  if (!visible) return null;
  const clamped = Math.max(0, remainingSeconds);
  const ratio = totalSeconds > 0 ? Math.max(0, Math.min(1, clamped / totalSeconds)) : 0;
  const isLow = clamped <= 4;
  const isWarn = !isLow && clamped <= 8;

  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);

  const strokeColor = isLow
    ? '#f43f5e'
    : isWarn
    ? '#f59e0b'
    : accent === 'amber'
    ? '#f59e0b'
    : accent === 'violet'
    ? '#8b5cf6'
    : accent === 'teal'
    ? '#14b8a6'
    : '#22d3ee';

  const barBgClass = isLow
    ? 'bg-rose-500'
    : isWarn
    ? 'bg-amber-400'
    : accent === 'amber'
    ? 'bg-amber-400'
    : accent === 'violet'
    ? 'bg-violet-500'
    : accent === 'teal'
    ? 'bg-teal-400'
    : 'bg-cyan-400';

  return (
    <div className="w-full space-y-1.5" aria-label={label}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          {/* Circular Countdown Ring */}
          <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 44 44" className="w-11 h-11 -rotate-90" aria-hidden="true">
              <circle
                cx="22"
                cy="22"
                r={radius}
                fill="rgba(8, 13, 30, 0.9)"
                stroke="rgba(51, 65, 85, 0.6)"
                strokeWidth="3.5"
              />
              <circle
                cx="22"
                cy="22"
                r={radius}
                fill="none"
                stroke={strokeColor}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <span className="absolute font-mono text-[11px] font-extrabold text-slate-100 tabular-nums">
              {Math.ceil(clamped)}
            </span>
          </div>

          <span className="text-slate-400 font-semibold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-500" />
            <span>{label}</span>
          </span>
        </div>

        <span
          data-testid="timer-readout"
          className={`font-mono tabular-nums font-bold px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 ${
            isLow ? 'text-rose-400' : isWarn ? 'text-amber-300' : 'text-slate-100'
          }`}
        >
          {clamped.toFixed(1)}s {isLow ? '· CRITICAL' : isWarn ? '· LOW TIME' : ''}
        </span>
      </div>

      <div className="h-2 w-full bg-[#080D1E] rounded-full overflow-hidden border border-slate-800/90">
        <div
          className={`h-full transition-transform duration-100 origin-left ${barBgClass}`}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </div>
  );
};

export const FeedbackBanner: React.FC<{
  message: string;
  tone: 'neutral' | 'success' | 'error';
}> = ({ message, tone }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`px-4 py-2.5 rounded-xl border text-xs flex items-center gap-2.5 ${
        tone === 'success'
          ? 'bg-emerald-950/55 border-emerald-500/60 text-emerald-200'
          : tone === 'error'
          ? 'bg-rose-950/60 border-rose-500/60 text-rose-200'
          : 'bg-[#080D1E] border-slate-800/90 text-slate-300'
      }`}
    >
      {tone === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
      {tone === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
      <span>{message}</span>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) => {
  const cancelBtnRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
    >
      <div className="max-w-md w-full arcade-panel rounded-2xl p-6 space-y-4 shadow-2xl">
        <h2 id="dialog-title" className="text-lg font-bold text-slate-100">
          {title}
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed">{description}</p>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              danger
                ? 'bg-rose-600 text-white hover:bg-rose-500'
                : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
