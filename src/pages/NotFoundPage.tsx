import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="max-w-lg mx-auto py-16 text-center space-y-5 bg-[#111827] border border-slate-800 rounded-xl p-8">
      <Compass className="w-10 h-10 text-cyan-400 mx-auto" />
      <div className="space-y-1.5">
        <div className="text-xs font-mono text-cyan-400">404 · Route Not Found</div>
        <h1 className="text-2xl font-bold text-slate-100">Module or Page Unavailable</h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          The requested path does not match an active cognitive module or telemetry route. Use the links below to return to the workspace.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Link
          to="/"
          className="px-5 py-2.5 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors"
        >
          Return to Dashboard
        </Link>
        <Link
          to="/practice"
          className="px-4 py-2.5 text-xs font-medium text-slate-200 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
        >
          Practice Studio
        </Link>
      </div>
    </div>
  );
};
