import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  ClipboardCheck,
  Clock,
  Home,
  Menu,
  Settings,
  Target,
  User,
  X,
  Zap,
} from 'lucide-react';
import { useLab } from '../context/LabContext.tsx';
import { OnboardingModal } from './OnboardingModal.tsx';

interface SidebarItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  matchPrefix?: string;
}

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    storageWarning,
    dismissStorageWarning,
    storageAvailable,
    performance,
    sessions,
    settings,
    playerProfile,
    openOnboardingModal,
  } = useLab();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const latestSessionId = performance.lastSessionId || sessions[0]?.sessionId;
  const resultsDestination = latestSessionId ? `/results/${latestSessionId}` : '/history';

  const primarySidebarItems: SidebarItem[] = [
    {
      to: '/',
      label: 'Dashboard',
      icon: <Home className="w-4 h-4 shrink-0" />,
    },
    {
      to: '/assessment',
      label: 'Assessment',
      icon: <ClipboardCheck className="w-4 h-4 shrink-0" />,
      matchPrefix: '/assessment',
    },
    {
      to: '/practice',
      label: 'Practice',
      icon: <Target className="w-4 h-4 shrink-0" />,
      matchPrefix: '/practice',
    },
    {
      to: '/history',
      label: 'History',
      icon: <Clock className="w-4 h-4 shrink-0" />,
      matchPrefix: '/history',
    },
    {
      to: resultsDestination,
      label: 'Results',
      icon: <BarChart3 className="w-4 h-4 shrink-0" />,
      matchPrefix: '/results',
    },
  ];

  const isMathActive = location.pathname.startsWith('/games/math-bubbles');
  const isMazeActive = location.pathname.startsWith('/games/memory-maze');
  const isPathActive = location.pathname.startsWith('/games/path-rotation');

  const isSidebarItemActive = (item: SidebarItem) => {
    if (item.to === '/') {
      return location.pathname === '/';
    }
    if (item.matchPrefix) {
      return location.pathname.startsWith(item.matchPrefix);
    }
    return location.pathname === item.to;
  };

  return (
    <div className="min-h-screen flex bg-[#070B19] text-slate-100">
      {/* Persistent Left Sidebar (Desktop & Tablet) */}
      <aside
        aria-label="Main Application Sections"
        className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col justify-between bg-[#090F24] border-r border-slate-800/80 select-none"
      >
        <div className="p-5 space-y-6">
          {/* Brand Header */}
          <Link
            to="/"
            className="flex items-center gap-3 group focus-visible:outline-2 focus-visible:outline-cyan-400 rounded-xl"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-fuchsia-500/20 via-violet-500/20 to-cyan-500/20 border border-violet-400/30 flex items-center justify-center shadow-inner shrink-0">
              <svg viewBox="0 0 36 36" className="w-7 h-7" aria-hidden="true">
                <defs>
                  <linearGradient id="brainLeftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#EC4899" />
                    <stop offset="50%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#8B5CF6" />
                  </linearGradient>
                  <linearGradient id="brainRightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38BDF8" />
                    <stop offset="100%" stopColor="#14B8A6" />
                  </linearGradient>
                </defs>
                <path
                  d="M17 7C13.5 7 11 9.2 10.5 12C8.5 12.6 7 14.5 7 16.8C7 18.8 8.1 20.5 9.8 21.3C9.5 22.1 9.5 23 9.8 23.9C10.5 26.2 12.8 28 15.5 28H17V7Z"
                  fill="none"
                  stroke="url(#brainLeftGrad)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M19 7C22.5 7 25 9.2 25.5 12C27.5 12.6 29 14.5 29 16.8C29 18.8 27.9 20.5 26.2 21.3C26.5 22.1 26.5 23 26.2 23.9C25.5 26.2 23.2 28 20.5 28H19V7Z"
                  fill="none"
                  stroke="url(#brainRightGrad)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M13 14H17M12 19H17M23 14H19M24 19H19"
                  stroke="#CBD5E1"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div>
              <div className="font-display text-lg font-bold leading-tight text-white group-hover:text-cyan-200 transition-colors">
                Cognitive
              </div>
              <div className="font-display text-sm font-semibold leading-tight text-slate-300">
                Games Lab
              </div>
            </div>
          </Link>

          <div className="h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent" />

          {/* Primary Navigation Links */}
          <nav aria-label="Primary Navigation" className="space-y-1.5">
            {primarySidebarItems.map((item) => {
              const active = isSidebarItemActive(item);
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                    active
                      ? 'bg-gradient-to-r from-blue-600/85 via-indigo-600/75 to-indigo-900/50 text-white font-semibold shadow-[0_0_20px_rgba(59,130,246,0.28)] border border-blue-400/40'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <span className={active ? 'text-white' : 'text-slate-400'}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}

            <div className="my-3 h-px bg-slate-800/80" />

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600/85 via-indigo-600/75 to-indigo-900/50 text-white font-semibold shadow-[0_0_20px_rgba(59,130,246,0.28)] border border-blue-400/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50 border border-transparent'
                }`
              }
            >
              <Settings className="w-4 h-4 shrink-0 text-slate-400" />
              <span>Settings</span>
            </NavLink>
          </nav>
        </div>

        {/* Bottom Decorative Cognitive Emblem */}
        <div className="p-5">
          <div className="rounded-2xl bg-gradient-to-b from-[#0E1735]/90 to-[#080D1F] border border-slate-800/80 p-4 text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-sky-500/10 border border-sky-400/25 flex items-center justify-center text-sky-400">
              <svg viewBox="0 0 36 36" className="w-7 h-7" aria-hidden="true">
                <path
                  d="M17 8C13.8 8 11.4 10 11 12.6C9.2 13.2 7.8 14.9 7.8 17C7.8 18.8 8.8 20.4 10.3 21.1C10 21.9 10 22.7 10.3 23.5C11 25.6 13 27.2 15.5 27.2H17V8Z"
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M19 8C22.2 8 24.6 10 25 12.6C26.8 13.2 28.2 14.9 28.2 17C28.2 18.8 27.2 20.4 25.7 21.1C26 21.9 26 22.7 25.7 23.5C25 25.6 23 27.2 20.5 27.2H19V8Z"
                  fill="none"
                  stroke="#60A5FA"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-100">Train Your Mind</div>
              <div className="text-xs text-slate-400 mt-0.5">Play. Improve. Grow.</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Column (Top Ribbon + Workspace + Footer) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header + Three Dedicated Game Ribbon Tabs */}
        <header className="sticky top-0 z-30 bg-[#070B19]/95 border-b border-slate-800/80 px-3 sm:px-6 py-2.5 sm:py-3">
          <div className="max-w-[1320px] mx-auto flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 sm:gap-3">
            {/* Mobile Brand + Menu Toggle */}
            <div className="flex items-center justify-between md:hidden gap-1.5">
              <Link
                to="/"
                className="font-display text-xs sm:text-base font-bold text-white flex items-center gap-1.5 min-w-0 shrink-0"
              >
                <span className="inline-flex w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-indigo-500/20 border border-indigo-400/40 items-center justify-center text-cyan-300 text-[11px] sm:text-xs font-extrabold shrink-0">
                  CG
                </span>
                <span className="whitespace-nowrap">Cognitive Games Lab</span>
              </Link>

              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={openOnboardingModal}
                  title="Switch or edit player name"
                  className="inline-flex items-center gap-1 px-2 py-1 min-h-[34px] rounded-lg bg-[#0E152B] border border-slate-800 hover:border-cyan-500/50 text-[11px] font-semibold text-slate-200 transition-colors cursor-pointer"
                >
                  <User className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span className="max-w-[60px] sm:max-w-[90px] truncate">
                    {playerProfile?.playerName || 'Player'}
                  </span>
                </button>
                <Link
                  to="/assessment"
                  className="px-2 py-1 min-h-[34px] inline-flex items-center text-[11px] font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 whitespace-nowrap"
                >
                  Assessment
                </Link>
                <button
                  type="button"
                  aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                  aria-expanded={mobileMenuOpen}
                  onClick={() => setMobileMenuOpen((prev) => !prev)}
                  className="p-1.5 min-w-[34px] min-h-[34px] inline-flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Prominent Three-Tab Game Ribbon + Tablet Utility Row */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 w-full">
              <nav
                aria-label="Cognitive Game Ribbon"
                className="grid grid-cols-3 sm:inline-flex items-center gap-1 sm:gap-2 p-1 sm:p-1.5 rounded-2xl bg-[#0D142B] border border-slate-800/90 shadow-inner w-full sm:w-auto no-scrollbar"
              >
                {/* Tab 1: Quick-Fire Math (Warm Amber/Orange Identity) */}
                <Link
                  to="/games/math-bubbles"
                  aria-current={isMathActive ? 'page' : undefined}
                  data-testid="ribbon-tab-math-bubbles"
                  className={`group flex items-center justify-center sm:justify-start gap-1 sm:gap-2.5 px-1.5 sm:px-4 lg:px-5 py-2 min-h-[40px] rounded-xl text-[11px] sm:text-xs lg:text-sm tracking-tight sm:tracking-normal font-semibold transition-all whitespace-nowrap min-w-0 ${
                    isMathActive
                      ? 'bg-gradient-to-r from-amber-500/25 via-orange-500/20 to-amber-900/30 text-amber-100 border border-amber-400/60 shadow-[0_0_18px_rgba(245,158,11,0.28)]'
                      : 'text-slate-200 hover:text-white hover:bg-amber-500/10 border border-transparent'
                  }`}
                >
                  <span className="hidden min-[440px]:flex w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-slate-950 font-mono font-extrabold text-[9px] sm:text-[11px] items-center justify-center shadow-sm shrink-0">
                    123
                  </span>
                  <span>Quick-Fire Math</span>
                </Link>

                {/* Tab 2: Memory Maze (Blue/Violet/Indigo Identity) */}
                <Link
                  to="/games/memory-maze"
                  aria-current={isMazeActive ? 'page' : undefined}
                  data-testid="ribbon-tab-memory-maze"
                  className={`group flex items-center justify-center sm:justify-start gap-1 sm:gap-2.5 px-1.5 sm:px-4 lg:px-5 py-2 min-h-[40px] rounded-xl text-[11px] sm:text-xs lg:text-sm tracking-tight sm:tracking-normal font-semibold transition-all whitespace-nowrap min-w-0 ${
                    isMazeActive
                      ? 'bg-gradient-to-r from-violet-500/30 via-indigo-500/25 to-violet-900/30 text-violet-100 border border-violet-400/60 shadow-[0_0_18px_rgba(139,92,246,0.3)]'
                      : 'text-slate-200 hover:text-white hover:bg-violet-500/10 border border-transparent'
                  }`}
                >
                  <span className="hidden min-[440px]:flex w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-700 text-white items-center justify-center shadow-sm shrink-0">
                    <svg viewBox="0 0 20 20" className="w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true">
                      <rect
                        x="3"
                        y="3"
                        width="14"
                        height="14"
                        rx="2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <path
                        d="M7 3V13H13V7H9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span>Memory Maze</span>
                </Link>

                {/* Tab 3: Path Finder (Cyan/Teal Identity) */}
                <Link
                  to="/games/path-rotation"
                  aria-current={isPathActive ? 'page' : undefined}
                  data-testid="ribbon-tab-path-rotation"
                  className={`group flex items-center justify-center sm:justify-start gap-1 sm:gap-2.5 px-1.5 sm:px-4 lg:px-5 py-2 min-h-[40px] rounded-xl text-[11px] sm:text-xs lg:text-sm tracking-tight sm:tracking-normal font-semibold transition-all whitespace-nowrap min-w-0 ${
                    isPathActive
                      ? 'bg-gradient-to-r from-teal-500/30 via-cyan-500/20 to-teal-900/30 text-teal-100 border border-teal-400/60 shadow-[0_0_18px_rgba(20,184,166,0.28)]'
                      : 'text-slate-200 hover:text-white hover:bg-teal-500/10 border border-transparent'
                  }`}
                >
                  <span className="hidden min-[440px]:flex w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 text-slate-950 items-center justify-center shadow-sm shrink-0">
                    <svg viewBox="0 0 20 20" className="w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true">
                      <circle cx="5" cy="14" r="2.2" fill="currentColor" />
                      <circle cx="10" cy="6" r="2.2" fill="currentColor" />
                      <circle cx="15" cy="12" r="2.2" fill="currentColor" />
                      <path
                        d="M6.5 12.5L8.8 7.5M11.5 7.2L13.8 10.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <span>Path Finder</span>
                </Link>
              </nav>

              {/* Right Utility Controls: Assessment CTA + Player Profile Pill */}
              <div className="hidden md:flex items-center gap-2 lg:gap-3 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => navigate('/history')}
                  aria-label="View recent activity and session notifications"
                  className="p-2.5 rounded-xl bg-[#0E152B] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
                >
                  <Bell className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  data-testid="header-player-profile-btn"
                  onClick={openOnboardingModal}
                  title="Switch or edit player name"
                  className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-[#0E152B] border border-slate-800 hover:border-cyan-500/50 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </span>
                  <span data-testid="header-player-name" className="max-w-[110px] truncate">
                    {playerProfile?.playerName || 'Player'}
                  </span>
                  <span className="hidden xl:inline text-[11px] font-mono text-cyan-300 capitalize">
                    ({settings.defaultDifficulty})
                  </span>
                </button>

                <Link
                  to="/assessment"
                  className="inline-flex items-center gap-1.5 px-3.5 lg:px-4 py-2 text-xs font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-400 rounded-xl hover:from-amber-300 hover:to-orange-300 transition-colors whitespace-nowrap shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span>Start Assessment</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Mobile Drawer Navigation */}
          {mobileMenuOpen && (
            <nav
              aria-label="Mobile Navigation"
              className="md:hidden mt-3 pt-3 border-t border-slate-800 flex flex-col gap-1.5"
            >
              {primarySidebarItems.map((item) => {
                const active = isSidebarItemActive(item);
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium ${
                      active
                        ? 'bg-blue-600/30 text-white border border-blue-400/40'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <Link
                to="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium ${
                  location.pathname.startsWith('/settings')
                    ? 'bg-blue-600/30 text-white border border-blue-400/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Link>
            </nav>
          )}
        </header>

        {/* Persistence Warning Banner */}
        {(storageWarning || !storageAvailable) && (
          <div
            role="alert"
            className="bg-amber-950/60 border-b border-amber-700/60 px-4 sm:px-6 py-2.5 text-xs text-amber-200 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {storageWarning ??
                  'Browser localStorage is unavailable. Session progress is active in memory only.'}
              </span>
            </div>
            {storageWarning && (
              <button
                type="button"
                onClick={dismissStorageWarning}
                className="px-2.5 py-1 rounded text-amber-100 hover:bg-amber-900/60 whitespace-nowrap shrink-0"
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        {/* Main Workspace Content */}
        <main className="flex-1 w-full max-w-[1320px] mx-auto px-3.5 sm:px-6 py-4 sm:py-6 min-w-0">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-800/70 bg-[#070B19] px-6 py-4 text-xs text-slate-400">
          <div className="max-w-[1320px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="max-w-3xl leading-relaxed">
              Independent cognitive assessment practice simulator. Inspired by publicly reported gamified cognitive task mechanics; contains no proprietary or official assessment items.
            </p>
            <div className="flex items-center gap-5 shrink-0">
              <Link to="/practice" className="hover:text-slate-200 transition-colors whitespace-nowrap">
                Practice Studio
              </Link>
              <Link to="/history" className="hover:text-slate-200 transition-colors whitespace-nowrap">
                Session History
              </Link>
              <Link to="/settings" className="hover:text-slate-200 transition-colors whitespace-nowrap">
                Data &amp; Settings
              </Link>
            </div>
          </div>
        </footer>
      </div>
      <OnboardingModal />
    </div>
  );
};
