import React, { useCallback, useEffect, useState } from 'react';
import { Play, X } from 'lucide-react';
import {
  setHideGameInstructions,
  shouldHideGameInstructions,
  type InstructionGameId,
} from '../storage/persistence.ts';

interface HowToPlayRulePoint {
  emoji: string;
  label: string;
  description: string;
}

interface GameInstructionMeta {
  gameName: string;
  badgeText: string;
  accentBorder: string;
  accentButton: string;
  accentBadge: string;
  rules: [HowToPlayRulePoint, HowToPlayRulePoint, HowToPlayRulePoint];
}

const GAME_INSTRUCTIONS: Record<InstructionGameId, GameInstructionMeta> = {
  quick_fire_math: {
    gameName: 'Quick-Fire Math',
    badgeText: '⚡ QUICK-FIRE MATH',
    accentBorder: 'border-amber-500/45',
    accentButton:
      'bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 text-slate-950 hover:brightness-105 shadow-[0_0_22px_rgba(245,158,11,0.35)]',
    accentBadge: 'bg-amber-500/15 border-amber-400/40 text-amber-300',
    rules: [
      {
        emoji: '🔢',
        label: 'Rule:',
        description: 'Order bubbles based on the prompt (LOWEST → HIGHEST or HIGHEST → LOWEST).',
      },
      {
        emoji: '🎯',
        label: 'Selection:',
        description: 'Tap all bubbles sequentially before evaluation.',
      },
      {
        emoji: '⚡',
        label: 'Feedback:',
        description:
          'Correct positions turn green, errors turn red, and the next round begins automatically.',
      },
    ],
  },
  memory_maze: {
    gameName: 'Memory Maze',
    badgeText: '🧩 MEMORY MAZE',
    accentBorder: 'border-violet-500/45',
    accentButton:
      'bg-gradient-to-r from-violet-500 via-indigo-500 to-purple-600 text-white hover:brightness-110 shadow-[0_0_22px_rgba(139,92,246,0.4)]',
    accentBadge: 'bg-violet-500/15 border-violet-400/40 text-violet-300',
    rules: [
      {
        emoji: '🧱',
        label: 'Invisible Walls:',
        description: 'Edge walls are hidden—hitting one flashes red and resets you to Start.',
      },
      {
        emoji: '🔑',
        label: 'Objective:',
        description: 'Grab keys in order (A → B → C) to unlock gates and reach the exit door.',
      },
      {
        emoji: '🎮',
        label: 'Controls:',
        description: 'Use W A S D, Arrow Keys, or on-screen directional buttons.',
      },
    ],
  },
  path_finder: {
    gameName: 'Path Finder',
    badgeText: '🧭 PATH FINDER',
    accentBorder: 'border-emerald-500/45',
    accentButton:
      'bg-gradient-to-r from-emerald-300 via-teal-400 to-cyan-500 text-slate-950 hover:brightness-105 shadow-[0_0_22px_rgba(16,185,129,0.35)]',
    accentBadge: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300',
    rules: [
      {
        emoji: '🔄',
        label: 'Rotate Pieces (90° CW):',
        description:
          'Click any unlocked path piece directly—or press the bottom Rotate button—to select and rotate it 90° clockwise.',
      },
      {
        emoji: '🔁',
        label: 'Swap Tiles & Align Arrows:',
        description:
          'Use the bottom Swap button (or click an empty slot) to exchange unlocked tiles, and rotate pieces until arrows align (↑ → → ↓ → ←).',
      },
      {
        emoji: '🏁',
        label: 'Goal:',
        description: 'Form an unbroken directional path from IN → to OUT ↓, then click Submit.',
      },
    ],
  },
};

export const HowToPlayModal: React.FC<{
  gameId: InstructionGameId;
  open: boolean;
  onStartPlay: () => void;
  onClose?: () => void;
}> = ({ gameId, open, onStartPlay, onClose }) => {
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(() =>
    shouldHideGameInstructions(gameId)
  );

  useEffect(() => {
    if (open) {
      setDontShowAgain(shouldHideGameInstructions(gameId));
    }
  }, [open, gameId]);

  const commitPreferenceAndStart = useCallback(() => {
    setHideGameInstructions(gameId, dontShowAgain);
    onStartPlay();
  }, [gameId, dontShowAgain, onStartPlay]);

  const handleCloseIcon = useCallback(() => {
    setHideGameInstructions(gameId, dontShowAgain);
    if (onClose) {
      onClose();
    } else {
      onStartPlay();
    }
  }, [gameId, dontShowAgain, onClose, onStartPlay]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        commitPreferenceAndStart();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCloseIcon();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [open, commitPreferenceAndStart, handleCloseIcon]);

  if (!open) return null;

  const meta = GAME_INSTRUCTIONS[gameId];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`how-to-play-title-${gameId}`}
      data-testid="how-to-play-modal"
      onClick={commitPreferenceAndStart}
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/78 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`max-w-lg w-full max-h-[90vh] overflow-y-auto bg-[#0D152C] border ${meta.accentBorder} rounded-3xl p-5 sm:p-7 space-y-4 sm:space-y-5 shadow-[0_24px_64px_rgba(0,0,0,0.8)]`}
      >
        {/* Header: Game icon + "How to Play [Game Name]" + close ✕ icon */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider border ${meta.accentBadge}`}
            >
              {meta.badgeText}
            </span>
            <h2
              id={`how-to-play-title-${gameId}`}
              className="font-display text-xl sm:text-2xl font-extrabold text-white"
            >
              How to Play {meta.gameName}
            </h2>
          </div>

          <button
            type="button"
            onClick={handleCloseIcon}
            aria-label="Close How to Play modal"
            data-testid="how-to-play-close-btn"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Punchy Visual Rules (3 Quick Points) */}
        <div className="space-y-2.5">
          {meta.rules.map((rule) => (
            <div
              key={rule.label}
              className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-[#070B19]/90 border border-slate-800/90"
            >
              <span className="text-xl leading-none select-none mt-0.5" aria-hidden="true">
                {rule.emoji}
              </span>
              <div className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                <strong className="font-bold text-white mr-1.5">{rule.label}</strong>
                <span>{rule.description}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Modal Action Controls: "Don't show this again" checkbox + "Skip / Let's Play" button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-800/90">
          <label className="inline-flex items-center gap-2.5 text-xs font-medium text-slate-300 hover:text-white cursor-pointer select-none">
            <input
              type="checkbox"
              data-testid="dont-show-again-checkbox"
              checked={dontShowAgain}
              onChange={(e) => {
                const checked = e.target.checked;
                setDontShowAgain(checked);
                setHideGameInstructions(gameId, checked);
              }}
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-cyan-400 focus:ring-cyan-400 cursor-pointer"
            />
            <span>Don&apos;t show this again</span>
          </label>

          <button
            type="button"
            data-testid="how-to-play-lets-play-btn"
            onClick={commitPreferenceAndStart}
            className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-extrabold transition-all cursor-pointer ${meta.accentButton}`}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Skip / Let&apos;s Play</span>
          </button>
        </div>
      </div>
    </div>
  );
};
