import React, { useEffect, useRef, useState } from 'react';
import { Play, User, X } from 'lucide-react';
import { useLab } from '../context/LabContext.tsx';
import { validatePlayerName } from '../storage/persistence.ts';

export const OnboardingModal: React.FC = () => {
  const { onboardingModalOpen, playerProfile, setPlayerName, closeOnboardingModal } = useLab();
  const [nameInput, setNameInput] = useState<string>(playerProfile?.playerName ?? '');
  const [touched, setTouched] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (onboardingModalOpen) {
      setNameInput(playerProfile?.playerName ?? '');
      setTouched(false);
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
    }
  }, [onboardingModalOpen, playerProfile]);

  if (!onboardingModalOpen) return null;

  const validation = validatePlayerName(nameInput);
  const canCloseWithoutSubmit = Boolean(playerProfile);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!validation.valid) return;
    setPlayerName(nameInput);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      data-testid="onboarding-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 overflow-y-auto"
    >
      <div className="max-w-md w-full max-h-[90vh] overflow-y-auto bg-[#0D152C] border border-cyan-500/40 rounded-3xl p-5 sm:p-7 space-y-4 sm:space-y-5 shadow-[0_24px_64px_rgba(0,0,0,0.75)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 text-slate-950 flex items-center justify-center shadow-lg shrink-0">
              <User className="w-6 h-6 stroke-[2.4]" />
            </div>
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400">
                Player Profile
              </div>
              <h2
                id="onboarding-modal-title"
                className="font-display text-lg sm:text-xl font-extrabold text-white leading-snug"
              >
                Welcome to Cognitive Assessment Practice
              </h2>
            </div>
          </div>

          {canCloseWithoutSubmit && (
            <button
              type="button"
              onClick={closeOnboardingModal}
              aria-label="Close profile dialog"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          Enter your display name to track your high scores, move efficiency, and session history
          across Quick-Fire Math, Memory Maze, and Path Finder.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="player-name-input"
              className="block text-xs font-semibold text-slate-200"
            >
              Display Name <span className="text-slate-400 font-normal">(2–25 characters)</span>
            </label>
            <input
              ref={inputRef}
              id="player-name-input"
              data-testid="player-name-input"
              type="text"
              maxLength={30}
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                if (!touched) setTouched(true);
              }}
              placeholder="Enter your name to begin"
              className="w-full px-4 py-3 text-sm font-medium bg-[#070B19] border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
            />
            <div className="flex items-center justify-between text-[11px]">
              {touched && !validation.valid ? (
                <span className="text-rose-400 font-medium" role="alert">
                  {validation.error}
                </span>
              ) : (
                <span className="text-slate-400">
                  Saved locally in your browser (no password required).
                </span>
              )}
              <span className="font-mono text-slate-400 tabular-nums">
                {validation.trimmedName.length}/25
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            {canCloseWithoutSubmit && (
              <button
                type="button"
                onClick={closeOnboardingModal}
                className="px-4 py-2.5 text-xs font-semibold text-slate-300 bg-slate-800/80 border border-slate-700 rounded-xl hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              data-testid="start-playing-onboarding-btn"
              disabled={!validation.valid}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-extrabold rounded-xl transition-all ${
                validation.valid
                  ? 'bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 text-slate-950 hover:brightness-105 shadow-[0_0_24px_rgba(34,211,238,0.35)] cursor-pointer'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Playing</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
