import React, { useState } from 'react';
import { Download, RotateCcw, Trash2, Upload, User } from 'lucide-react';
import { useLab } from '../context/LabContext.tsx';
import {
  CURRENT_SCHEMA_VERSION,
  PLAYER_SESSION_STORAGE_KEY,
  setHideGameInstructions,
  STORAGE_KEY,
} from '../storage/persistence.ts';
import {
  ConfirmDialog,
  DifficultySelector,
  EvaluationModeSelector,
  FeedbackBanner,
  SessionLengthSelector,
} from '../components/SharedControls.tsx';

export const SettingsPage: React.FC = () => {
  const {
    settings,
    sessions,
    playerProfile,
    openOnboardingModal,
    resetPlayerProfile,
    storageAvailable,
    updateSettings,
    clearAllHistory,
    exportProgressJson,
    importProgressJson,
  } = useLab();

  const [importText, setImportText] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<{
    message: string;
    tone: 'neutral' | 'success' | 'error';
  } | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);

  const handleDownloadJson = () => {
    const json = exportProgressJson();
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cognitive-games-lab-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: populate textarea with exported JSON
    }
    setImportText(json);
    setStatusBanner({
      message: 'Exported current store to validated JSON (copied into the JSON inspector below).',
      tone: 'success',
    });
  };

  const handleImportSubmit = () => {
    const res = importProgressJson(importText);
    setStatusBanner({
      message: res.message,
      tone: res.ok ? 'success' : 'error',
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setImportText(content);
      const res = importProgressJson(content);
      setStatusBanner({
        message: res.message,
        tone: res.ok ? 'success' : 'error',
      });
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">
          Preferences & Data Management
        </h1>
        <p className="text-sm text-slate-300 mt-1">
          Configure cognitive simulator defaults, per-question timers, Practice vs Exam rules, accessibility preferences, and manage your versioned local progress store.
        </p>
      </div>

      {statusBanner && (
        <FeedbackBanner message={statusBanner.message} tone={statusBanner.tone} />
      )}

      {/* Player Profile & Session Identity (assessment_user_session) */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/35 flex items-center justify-center text-cyan-300">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                Player Profile:{' '}
                <span className="text-cyan-300">{playerProfile?.playerName || 'Guest'}</span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Storage Key: {PLAYER_SESSION_STORAGE_KEY}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={openOnboardingModal}
              className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors cursor-pointer"
            >
              Change Player Name
            </button>
            <button
              type="button"
              onClick={() => {
                setHideGameInstructions('quick_fire_math', false);
                setHideGameInstructions('memory_maze', false);
                setHideGameInstructions('path_finder', false);
                setStatusBanner({
                  message: 'Re-enabled pre-game "How to Play" modals for all 3 games.',
                  tone: 'success',
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset &quot;How to Play&quot; Popups</span>
            </button>
            <button
              type="button"
              onClick={resetPlayerProfile}
              className="px-3.5 py-2 text-xs font-medium text-rose-200 bg-rose-950/60 border border-rose-700/60 rounded-lg hover:bg-rose-900/70 transition-colors cursor-pointer"
            >
              Reset Player Profile
            </button>
          </div>
        </div>

        {playerProfile && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-slate-800">
              <div className="text-[11px] font-mono text-amber-300 uppercase">Quick-Fire Math</div>
              <div className="text-sm font-bold text-white mt-1 tabular-nums">
                High Score: {playerProfile.gameStats.quickFireMath.highScore} · Played:{' '}
                {playerProfile.gameStats.quickFireMath.gamesPlayed}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-slate-800">
              <div className="text-[11px] font-mono text-violet-300 uppercase">Memory Maze</div>
              <div className="text-sm font-bold text-white mt-1 tabular-nums">
                Wall Hits: {playerProfile.gameStats.memoryMaze.wallHitsTotal} · Played:{' '}
                {playerProfile.gameStats.memoryMaze.gamesPlayed}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-slate-800">
              <div className="text-[11px] font-mono text-emerald-300 uppercase">Path Finder</div>
              <div className="text-sm font-bold text-white mt-1 tabular-nums">
                Best Moves: {playerProfile.gameStats.pathFinder.bestMoves ?? '—'} · Played:{' '}
                {playerProfile.gameStats.pathFinder.gamesPlayed}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Default Difficulty, Mode & Timer Preferences */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6">
        <h2 className="text-lg font-bold text-slate-100">Simulator Preferences</h2>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300">
            Default Session Difficulty (5 Levels + Adaptive)
          </label>
          <DifficultySelector
            value={settings.defaultDifficulty}
            onChange={(defaultDifficulty) => {
              updateSettings({ defaultDifficulty });
              setStatusBanner({
                message: `Default difficulty updated to ${defaultDifficulty}.`,
                tone: 'success',
              });
            }}
            idPrefix="settings-diff"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300">
            Default Evaluation Mode
          </label>
          <EvaluationModeSelector
            value={settings.defaultEvaluationMode}
            onChange={(defaultEvaluationMode) => {
              updateSettings({ defaultEvaluationMode });
              setStatusBanner({
                message: `Default evaluation mode updated to ${defaultEvaluationMode}.`,
                tone: 'success',
              });
            }}
            idPrefix="settings-eval"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Default Session Length
            </label>
            <SessionLengthSelector
              value={settings.defaultSessionLength}
              onChange={(defaultSessionLength) => updateSettings({ defaultSessionLength })}
              idPrefix="settings-len"
            />
          </div>

          <div>
            <label
              htmlFor="settings-mb-timer"
              className="block text-xs font-semibold text-slate-300 mb-2"
            >
              Default Math Bubble Timer (Seconds / Question)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="settings-mb-timer"
                type="number"
                min={5}
                max={120}
                value={settings.defaultMathBubbleTimerSeconds}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val)) {
                    updateSettings({
                      defaultMathBubbleTimerSeconds: Math.max(5, Math.min(120, Math.round(val))),
                    });
                  }
                }}
                className="w-24 px-3 py-2 text-xs font-mono tabular-nums bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-100"
              />
              <span className="text-xs text-slate-400">Default: 15s</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
          <label className="flex items-start justify-between gap-4 p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800 cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-slate-200">Synthesized Sound Effects</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Play subtle Web Audio cues on bubble selection, tile rotation, and completion.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
              className="mt-1 h-4 w-4 accent-cyan-400"
            />
          </label>

          <label className="flex items-start justify-between gap-4 p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800 cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-slate-200">Reduced Motion Mode</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Disable floating bubble oscillations and minimize UI transform animations.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
              className="mt-1 h-4 w-4 accent-cyan-400"
            />
          </label>

          <label className="flex items-start justify-between gap-4 p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800 cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-slate-200">Show Visual Countdown Bar</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Display the per-question progress timer bar during active gameplay.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.showTimerCountdown}
              onChange={(e) => updateSettings({ showTimerCountdown: e.target.checked })}
              className="mt-1 h-4 w-4 accent-cyan-400"
            />
          </label>

          <label className="flex items-start justify-between gap-4 p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800 cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-slate-200">Allow Undo in Practice</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Configurable practice rule allowing last-bubble undo in Math Bubble Arena.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.practiceRules.allowUndo}
              onChange={(e) =>
                updateSettings({
                  practiceRules: {
                    ...settings.practiceRules,
                    allowUndo: e.target.checked,
                  },
                })
              }
              className="mt-1 h-4 w-4 accent-cyan-400"
            />
          </label>

          <label className="flex items-start justify-between gap-4 p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800 cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-slate-200">
                Suspend Practice Timer When Tab Inactive
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Automatically pauses Practice sessions when the browser tab loses visibility.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.practiceRules.suspendTimerOnInactiveTab}
              onChange={(e) =>
                updateSettings({
                  practiceRules: {
                    ...settings.practiceRules,
                    suspendTimerOnInactiveTab: e.target.checked,
                  },
                })
              }
              className="mt-1 h-4 w-4 accent-cyan-400"
            />
          </label>

          <label className="flex items-start justify-between gap-4 p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800 cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-slate-200">
                Enable Partial Credit Scoring
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Award proportional points for partially ordered bubbles or collected maze keys.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.practiceRules.enablePartialCredit}
              onChange={(e) =>
                updateSettings({
                  practiceRules: {
                    ...settings.practiceRules,
                    enablePartialCredit: e.target.checked,
                  },
                })
              }
              className="mt-1 h-4 w-4 accent-cyan-400"
            />
          </label>
        </div>
      </section>

      {/* Versioned LocalStorage Export / Import / Reset */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100">
              Versioned LocalStorage Persistence
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Storage Key: <code className="font-mono text-slate-300">{STORAGE_KEY}</code> · Schema v{CURRENT_SCHEMA_VERSION} · Status:{' '}
              <strong className={storageAvailable ? 'text-emerald-400' : 'text-amber-300'}>
                {storageAvailable ? 'Available' : 'In-Memory Fallback'}
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Progress JSON</span>
            </button>

            <label className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload JSON File</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>

            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-200 bg-rose-950/60 border border-rose-700/60 rounded-lg hover:bg-rose-900/70 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History ({sessions.length})</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="json-inspector" className="block text-xs font-medium text-slate-300">
            JSON Progress Inspector / Direct Import Payload
          </label>
          <textarea
            id="json-inspector"
            rows={7}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='Click "Export Progress JSON" to inspect your current store, or paste a backup JSON payload here and click "Validate & Import JSON".'
            className="w-full p-3 text-xs font-mono bg-[#0B0F17] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-400"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleImportSubmit}
              className="px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
            >
              Validate &amp; Import JSON
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear All Stored Practice History?"
        description="This will permanently delete all saved session records and reset your dashboard statistics to zero. Consider exporting a JSON backup first."
        confirmLabel="Confirm Clear History"
        danger
        onConfirm={() => {
          clearAllHistory();
          setConfirmClearOpen(false);
          setStatusBanner({
            message: 'All saved session history has been cleared.',
            tone: 'neutral',
          });
        }}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
};
