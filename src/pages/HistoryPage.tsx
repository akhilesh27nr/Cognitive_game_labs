import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Trash2 } from 'lucide-react';
import { useLab } from '../context/LabContext.tsx';
import { GAME_CATALOG } from '../engine/index.ts';
import { ConfirmDialog } from '../components/SharedControls.tsx';

export const HistoryPage: React.FC = () => {
  const { sessions, clearAllHistory } = useLab();
  const [filterModule, setFilterModule] = useState<string>('all');
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);

  const filteredSessions = useMemo(() => {
    if (filterModule === 'all') return sessions;
    return sessions.filter((s) => s.gameType === filterModule);
  }, [filterModule, sessions]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">Local Practice History</h1>
          <p className="text-sm text-slate-300 mt-1">
            Review every recorded cognitive practice session and combined assessment stored in your browser.
          </p>
        </div>

        {sessions.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-rose-200 bg-rose-950/60 border border-rose-700/60 rounded-lg hover:bg-rose-900/70 transition-colors whitespace-nowrap self-start"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#111827] border border-slate-800 rounded-xl w-full sm:w-fit max-w-full">
        {[
          { id: 'all', label: `All Sessions (${sessions.length})` },
          { id: 'math-bubbles', label: 'Math Bubble Arena' },
          { id: 'memory-maze', label: 'Memory Maze' },
          { id: 'path-rotation', label: 'Path Rotation' },
          { id: 'combined-assessment', label: 'Combined Assessment' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterModule(tab.id)}
            className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              filterModule === tab.id
                ? 'bg-cyan-400 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredSessions.length === 0 ? (
        <div
          data-testid="history-empty-state"
          className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center space-y-3"
        >
          <Clock className="w-8 h-8 text-slate-500 mx-auto" />
          <h2 className="text-base font-bold text-slate-100">No Matching Sessions Found</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            {sessions.length === 0
              ? 'You have not completed any sessions yet. Start a cognitive game or combined assessment to build your local performance log.'
              : 'No sessions match the selected module filter.'}
          </p>
          <div className="pt-2">
            <Link
              to="/practice"
              className="inline-flex items-center px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-lg hover:bg-cyan-300"
            >
              Launch Practice Session
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/50">
                  <th className="py-3 px-4 font-medium">Completed</th>
                  <th className="py-3 px-4 font-medium">Module</th>
                  <th className="py-3 px-4 font-medium">Difficulty</th>
                  <th className="py-3 px-4 font-medium">Seed</th>
                  <th className="py-3 px-4 font-medium text-right">Score</th>
                  <th className="py-3 px-4 font-medium text-right">Accuracy</th>
                  <th className="py-3 px-4 font-medium text-right">Avg Time</th>
                  <th className="py-3 px-4 font-medium text-right">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredSessions.map((session) => {
                  const title =
                    session.gameType === 'combined-assessment'
                      ? 'Combined Assessment'
                      : GAME_CATALOG.find((g) => g.gameType === session.gameType)?.title ??
                        session.gameType;
                  return (
                    <tr key={session.sessionId} className="hover:bg-slate-900/50">
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {new Date(session.completedAtIso).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-100">{title}</td>
                      <td className="py-3 px-4 capitalize text-slate-300">{session.difficulty}</td>
                      <td className="py-3 px-4 font-mono text-slate-400">{session.seed}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-cyan-300">
                        {session.score.NormalizedScore}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                        {session.score.accuracyPercent}% ({session.score.correctCount}/{session.score.totalQuestions})
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                        {(session.score.averageResponseMs / 1000).toFixed(1)}s
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          to={`/results/${session.sessionId}`}
                          className="text-cyan-400 hover:text-cyan-300 font-semibold whitespace-nowrap"
                        >
                          View Report
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear All Saved Session History?"
        description="This action permanently removes all stored cognitive session records and resets your dashboard statistics. Your application preferences will be preserved."
        confirmLabel="Confirm Clear History"
        danger
        onConfirm={() => {
          clearAllHistory();
          setConfirmClearOpen(false);
        }}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
};
