import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Layers,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useLab } from '../context/LabContext.tsx';
import { GAME_CATALOG } from '../engine/index.ts';
import type { CognitiveErrorCategory, GameType } from '../types/domain.ts';

const ERROR_CATEGORY_LABELS: Record<CognitiveErrorCategory, string> = {
  none: 'No Error',
  'order-inversion': 'Order Inversion (Asc/Desc)',
  'negative-sign-error': 'Signed / Negative Value Error',
  'operator-precedence-error': 'Operator Precedence / Bracket Error',
  'close-value-precision-error': 'Close-Value Precision Error',
  'fraction-decimal-conversion-error': 'Fraction / Decimal / Percent Conversion',
  'timeout-incomplete': 'Per-Question Timeout',
  'hidden-barrier-collision': 'Hidden Barrier Collision',
  'one-way-door-violation': 'One-Way Turnstile Violation',
  'key-order-violation': 'Key Sequence / Gate Lock Violation',
  'move-budget-exceeded': 'Move Budget Exceeded',
  'disconnected-conduit': 'Disconnected Conduit Route',
  'bypassed-checkpoint': 'Bypassed or Out-of-Order Checkpoint',
  'directional-arrow-violation': 'One-Way Flow Arrow Violation',
  'locked-tile-attempt': 'Locked / Blocked Tile Manipulation Attempt',
  'non-optimal-rotations': 'Valid Route with Excess Rotations',
};

export const ResultsPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { getSessionById } = useLab();

  const session = sessionId ? getSessionById(sessionId) : undefined;

  const errorBreakdown = useMemo(() => {
    if (!session) return [];
    const counts = new Map<CognitiveErrorCategory, number>();
    for (const q of session.questionResults) {
      if (q.errorCategory && q.errorCategory !== 'none') {
        counts.set(q.errorCategory, (counts.get(q.errorCategory) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).map(([cat, count]) => ({
      category: cat,
      label: ERROR_CATEGORY_LABELS[cat] ?? cat,
      count,
    }));
  }, [session]);

  const moduleBreakdown = useMemo(() => {
    if (!session) return [];
    const types: GameType[] = ['math-bubbles', 'memory-maze', 'path-rotation'];
    return types
      .map((gt) => {
        const items = session.questionResults.filter((q) => q.gameType === gt);
        if (items.length === 0) return null;
        const correct = items.filter((q) => q.isCorrect).length;
        const accuracy = Math.round((correct / items.length) * 100);
        const avgTimeSec = (
          items.reduce((acc, q) => acc + q.elapsedMs, 0) /
          items.length /
          1000
        ).toFixed(1);
        const earned = items.reduce((acc, q) => acc + q.scoreEarned, 0);
        const max = items.reduce((acc, q) => acc + q.maxPossibleScore, 0);
        const meta = GAME_CATALOG.find((g) => g.gameType === gt);
        return {
          gameType: gt,
          title: meta?.title ?? gt,
          domain: meta?.cognitiveDomain ?? '',
          count: items.length,
          correct,
          accuracy,
          avgTimeSec,
          earned,
          max,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [session]);

  if (!session) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4 bg-[#111827] border border-slate-800 rounded-xl p-8">
        <h1 className="text-xl font-bold text-slate-100">Session Report Not Found</h1>
        <p className="text-sm text-slate-400">
          No stored session matches ID <code className="font-mono text-slate-200">{sessionId}</code>. It may have been cleared from local history.
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <Link
            to="/"
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-lg hover:bg-cyan-300"
          >
            Return to Dashboard
          </Link>
          <Link
            to="/history"
            className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 rounded-lg hover:bg-slate-700"
          >
            View History
          </Link>
        </div>
      </div>
    );
  }

  const gameMeta =
    session.gameType === 'combined-assessment'
      ? null
      : GAME_CATALOG.find((g) => g.gameType === session.gameType);

  const replayRoute =
    session.gameType === 'combined-assessment'
      ? `/assessment?seed=${encodeURIComponent(session.seed)}&difficulty=${session.difficulty}`
      : `${gameMeta?.route ?? '/games/math-bubbles'}?seed=${encodeURIComponent(
          session.seed
        )}&difficulty=${session.difficulty}&questions=${session.config.questionCount}`;

  const attemptedCount = session.score.questionsAttempted ?? session.questionResults.length;
  const remainingCount =
    session.score.questionsRemaining ??
    Math.max(0, session.score.totalQuestions - attemptedCount);
  const incorrectCount =
    session.score.incorrectCount ?? Math.max(0, attemptedCount - session.score.correctCount);
  const timeoutCount =
    session.score.timeoutCount ??
    session.questionResults.filter((q) => q.timeoutStatus === 'timed-out').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-100"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            to={replayRoute}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Replay Identical Seed</span>
          </Link>
          <Link
            to="/practice"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>New Practice Session</span>
          </Link>
        </div>
      </div>

      {/* Primary Score Card */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800 pb-6">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-cyan-400">
              {gameMeta ? gameMeta.title : 'Combined Cognitive Assessment'} ·{' '}
              <span className="capitalize">{session.difficulty}</span> ·{' '}
              <span className="uppercase">{session.evaluationMode ?? 'practice'} Mode</span> · Seed{' '}
              <span className="font-mono text-slate-300">{session.seed}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">
              Session Performance Report
            </h1>
            <p className="text-xs text-slate-400">
              Completed {new Date(session.completedAtIso).toLocaleString()}
            </p>
          </div>

          <div className="text-left md:text-right">
            <div className="text-xs text-slate-400">Normalized Score (0–1000)</div>
            <div
              data-testid="results-normalized-score"
              className="text-4xl font-bold font-mono tabular-nums text-cyan-300"
            >
              {session.score.NormalizedScore}
            </div>
            <div className="text-xs font-mono text-slate-400">
              Raw Points: {session.score.totalScore} / {session.score.maxPossibleScore}
            </div>
          </div>
        </div>

        {/* 6-Metric Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800/90 space-y-1">
            <div className="text-[11px] text-slate-400">Accuracy</div>
            <div
              data-testid="results-accuracy"
              className="text-xl font-bold font-mono tabular-nums text-emerald-400"
            >
              {session.score.accuracyPercent}%
            </div>
            <div className="text-[11px] text-slate-400">
              {session.score.correctCount} correct · {incorrectCount} wrong
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800/90 space-y-1">
            <div className="text-[11px] text-slate-400">Questions Attempted</div>
            <div
              data-testid="results-attempted"
              className="text-xl font-bold font-mono tabular-nums text-slate-100"
            >
              {attemptedCount} / {session.score.totalQuestions}
            </div>
            <div className="text-[11px] text-slate-400">{remainingCount} remaining</div>
          </div>

          <div className="p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800/90 space-y-1">
            <div className="text-[11px] text-slate-400">Avg Response Time</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-100">
              {(session.score.averageResponseMs / 1000).toFixed(2)}s
            </div>
            <div className="text-[11px] text-slate-400">
              Total {(session.score.totalElapsedMs / 1000).toFixed(1)}s
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800/90 space-y-1">
            <div className="text-[11px] text-slate-400">Timeouts</div>
            <div className="text-xl font-bold font-mono tabular-nums text-amber-300">
              {timeoutCount}
            </div>
            <div className="text-[11px] text-slate-400">Expired items</div>
          </div>

          <div className="p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800/90 space-y-1">
            <div className="text-[11px] text-slate-400">Best Streak</div>
            <div className="text-xl font-bold font-mono tabular-nums text-cyan-300">
              {session.score.streakBest}
            </div>
            <div className="text-[11px] text-slate-400">Consecutive</div>
          </div>

          <div className="p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800/90 space-y-1">
            <div className="text-[11px] text-slate-400">Speed & Precision</div>
            <div className="text-xl font-bold font-mono tabular-nums text-violet-300">
              +{session.score.speedBonusTotal + session.score.precisionBonusTotal}
            </div>
            <div className="text-[11px] text-slate-400">Bonus pts</div>
          </div>
        </div>

        {/* Multi-Module Section Breakdown (shown for Combined Assessments or Multi-Game runs) */}
        {moduleBreakdown.length > 1 && (
          <div className="pt-4 border-t border-slate-800/80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
              <Layers className="w-4 h-4" />
              <span>Cognitive Domain Breakdown by Stage</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {moduleBreakdown.map((mod) => (
                <div
                  key={mod.gameType}
                  className="p-4 rounded-lg bg-[#0B0F17] border border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-100">{mod.title}</span>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {mod.accuracy}%
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">{mod.domain}</div>
                  <div className="flex items-center justify-between text-xs font-mono text-slate-300 pt-1 border-t border-slate-800/80">
                    <span>
                      {mod.correct}/{mod.count} Correct
                    </span>
                    <span>Avg {mod.avgTimeSec}s</span>
                    <span className="text-cyan-300">
                      {mod.earned}/{mod.max} pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cognitive Error Category Diagnostics */}
        {errorBreakdown.length > 0 && (
          <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <AlertTriangle className="w-4 h-4" />
              <span>Cognitive Error Diagnostics</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {errorBreakdown.map((err) => (
                <div
                  key={err.category}
                  className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 flex items-center justify-between text-xs"
                >
                  <span className="text-slate-200">{err.label}</span>
                  <span className="font-mono font-bold text-amber-300">{err.count}×</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Per-Question Telemetry Table */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-100">Per-Question Telemetry</h2>
        <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/50">
                  <th className="py-3 px-4 font-medium">#</th>
                  <th className="py-3 px-4 font-medium">Archetype</th>
                  <th className="py-3 px-4 font-medium">Outcome</th>
                  <th className="py-3 px-4 font-medium">Diagnostic</th>
                  <th className="py-3 px-4 font-medium text-right">Time</th>
                  <th className="py-3 px-4 font-medium text-right">Mistakes</th>
                  <th className="py-3 px-4 font-medium text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {session.questionResults.map((q, idx) => (
                  <tr key={q.puzzleId + idx} className="hover:bg-slate-900/50">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-100">{q.archetypeTitle}</div>
                      <div className="text-[11px] text-slate-400">{q.summaryText}</div>
                    </td>
                    <td className="py-3 px-4">
                      {q.isCorrect ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Solved</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>
                            {q.timeoutStatus === 'timed-out'
                              ? 'Timed Out'
                              : `Partial (${Math.round(q.partialCredit * 100)}%)`}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {q.errorCategory && q.errorCategory !== 'none'
                        ? ERROR_CATEGORY_LABELS[q.errorCategory]
                        : q.routeQuality === 'minimum-rotation-optimal'
                        ? 'Minimum-Rotation Optimal'
                        : 'Optimal Execution'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                      {(q.elapsedMs / 1000).toFixed(2)}s
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                      {q.mistakesCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-cyan-300">
                      {q.scoreEarned} / {q.maxPossibleScore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
