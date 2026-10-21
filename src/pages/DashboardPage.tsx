import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Clock,
  Gamepad2,
  Play,
  Sliders,
  Star,
  Target,
  Zap,
} from 'lucide-react';
import { useLab } from '../context/LabContext.tsx';
import { GAME_CATALOG } from '../engine/index.ts';
import type { GameType } from '../types/domain.ts';

function renderCardArtwork(gameType: GameType) {
  if (gameType === 'math-bubbles') {
    return (
      <svg
        viewBox="0 0 170 130"
        className="w-36 sm:w-40 h-28 sm:h-32 shrink-0 select-none pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="orbRed" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FB7185" />
            <stop offset="55%" stopColor="#E11D48" />
            <stop offset="100%" stopColor="#881337" />
          </radialGradient>
          <radialGradient id="orbBlue" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="55%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1E3A8A" />
          </radialGradient>
          <radialGradient id="orbTeal" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="55%" stopColor="#0D9488" />
            <stop offset="100%" stopColor="#115E59" />
          </radialGradient>
          <radialGradient id="orbAmber" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </radialGradient>
        </defs>
        {/* Decorative lightning sparks */}
        <path d="M122 10L114 24H123L117 36L131 20H121L122 10Z" fill="#FBBF24" opacity="0.9" />
        {/* Bubble 17 */}
        <circle cx="84" cy="40" r="24" fill="url(#orbRed)" stroke="#FDA4AF" strokeWidth="1.2" />
        <text
          x="84"
          y="46"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="17"
          fontFamily="Outfit, sans-serif"
          fontWeight="800"
        >
          17
        </text>
        {/* Bubble 12 */}
        <circle cx="132" cy="60" r="24" fill="url(#orbBlue)" stroke="#93C5FD" strokeWidth="1.2" />
        <text
          x="132"
          y="66"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="17"
          fontFamily="Outfit, sans-serif"
          fontWeight="800"
        >
          12
        </text>
        {/* Bubble 3 (teal) */}
        <circle cx="64" cy="78" r="21" fill="url(#orbTeal)" stroke="#6EE7B7" strokeWidth="1.2" />
        <text
          x="64"
          y="84"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="16"
          fontFamily="Outfit, sans-serif"
          fontWeight="800"
        >
          3
        </text>
        {/* Bubble 3 (amber) */}
        <circle cx="104" cy="94" r="25" fill="url(#orbAmber)" stroke="#FDE68A" strokeWidth="1.5" />
        <text
          x="104"
          y="101"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="19"
          fontFamily="Outfit, sans-serif"
          fontWeight="800"
        >
          3
        </text>
      </svg>
    );
  }

  if (gameType === 'memory-maze') {
    return (
      <svg
        viewBox="0 0 170 130"
        className="w-36 sm:w-40 h-28 sm:h-32 shrink-0 select-none pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="mazeBoard" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="50%" stopColor="#4338CA" />
            <stop offset="100%" stopColor="#1E1B4B" />
          </linearGradient>
        </defs>
        {/* Isometric 3D Maze Platform */}
        <g transform="translate(12, 8)">
          <polygon
            points="75,8 148,46 75,88 2,46"
            fill="url(#mazeBoard)"
            stroke="#818CF8"
            strokeWidth="1.5"
          />
          <polygon
            points="2,46 75,88 75,104 2,62"
            fill="#1E1B4B"
            stroke="#4F46E5"
            strokeWidth="1"
          />
          <polygon
            points="148,46 75,88 75,104 148,62"
            fill="#312E81"
            stroke="#6366F1"
            strokeWidth="1"
          />
          {/* Isometric Corridor Walls */}
          <path
            d="M42,32 L75,16 L112,36 M30,48 L62,66 L96,46 M58,42 L86,58"
            fill="none"
            stroke="#C4B5FD"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Glowing Golden Player Key Orb inside Maze */}
          <circle cx="102" cy="52" r="8" fill="#FBBF24" />
          <circle cx="102" cy="52" r="13" fill="#F59E0B" opacity="0.35" />
        </g>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 170 130"
      className="w-36 sm:w-40 h-28 sm:h-32 shrink-0 select-none pointer-events-none"
      aria-hidden="true"
    >
      {/* Isometric Tile-Circuit Grid */}
      <g transform="translate(10, 6)">
        <polygon
          points="78,8 150,48 78,92 6,48"
          fill="#0F293A"
          stroke="#2DD4BF"
          strokeWidth="1.5"
        />
        {/* Grid Subdivisions */}
        <line x1="42" y1="28" x2="114" y2="70" stroke="#1E4E68" strokeWidth="1.2" />
        <line x1="114" y1="28" x2="42" y2="70" stroke="#1E4E68" strokeWidth="1.2" />
        {/* Glowing Cyan Conduit Route */}
        <path
          d="M36,48 L64,34 L94,50 L78,62 L112,72"
          fill="none"
          stroke="#22D3EE"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Magenta / Pink Checkpoint Rings */}
        <circle cx="64" cy="34" r="7" fill="#EC4899" stroke="#FBCFE8" strokeWidth="2" />
        <circle cx="94" cy="50" r="7" fill="#EC4899" stroke="#FBCFE8" strokeWidth="2" />
        <circle cx="36" cy="48" r="5" fill="#2DD4BF" />
        <circle cx="112" cy="72" r="5" fill="#2DD4BF" />
      </g>
    </svg>
  );
}

function getGameBadge(gameType: GameType, size: 'md' | 'sm' = 'md') {
  const dim = size === 'md' ? 'w-12 h-12 text-sm' : 'w-9 h-9 text-xs';
  if (gameType === 'math-bubbles') {
    return (
      <div
        className={`${dim} rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-amber-700 text-white font-mono font-extrabold flex items-center justify-center shadow-[0_0_16px_rgba(245,158,11,0.35)] border border-amber-300/60 shrink-0`}
      >
        123
      </div>
    );
  }
  if (gameType === 'memory-maze') {
    return (
      <div
        className={`${dim} rounded-full bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-800 text-white flex items-center justify-center shadow-[0_0_16px_rgba(139,92,246,0.35)] border border-violet-300/60 shrink-0`}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
          <rect
            x="4"
            y="4"
            width="16"
            height="16"
            rx="2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M8 4V15H16V9H11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  return (
    <div
      className={`${dim} rounded-full bg-gradient-to-br from-teal-400 via-emerald-500 to-cyan-700 text-slate-950 flex items-center justify-center shadow-[0_0_16px_rgba(20,184,166,0.35)] border border-teal-200/60 shrink-0`}
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
        <circle cx="6" cy="17" r="2.5" fill="currentColor" />
        <circle cx="12" cy="7" r="2.5" fill="currentColor" />
        <circle cx="18" cy="14" r="2.5" fill="currentColor" />
        <path
          d="M7.5 15L10.8 9M13.5 8.5L16.5 12.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export const DashboardPage: React.FC = () => {
  const { performance, sessions, settings, playerProfile, openOnboardingModal } = useLab();
  const navigate = useNavigate();

  const recentSessions = sessions.slice(0, 5);
  const hasHistory = performance.totalSessionsCompleted > 0;

  // Determine the best target for "Continue Playing"
  const lastGameSession = sessions.find((s) => s.gameType !== 'combined-assessment');
  const continueRoute = lastGameSession
    ? GAME_CATALOG.find((g) => g.gameType === lastGameSession.gameType)?.route ?? '/games/math-bubbles'
    : '/games/math-bubbles';

  const cardThemeMap: Record<
    GameType,
    {
      displayName: string;
      arcadeTagline: string;
      surfaceClass: string;
      borderClass: string;
      buttonClass: string;
      barColor: string;
    }
  > = {
    'math-bubbles': {
      displayName: 'Quick-Fire Math',
      arcadeTagline: 'Solve fast. Score high. Build your number sense and calculation speed.',
      surfaceClass: 'game-card-math',
      borderClass: 'border-amber-500/45 hover:border-amber-400',
      buttonClass:
        'bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 text-slate-950 hover:from-amber-300 hover:to-orange-400 shadow-[0_0_18px_rgba(245,158,11,0.35)]',
      barColor: 'bg-gradient-to-r from-amber-400 to-orange-500',
    },
    'memory-maze': {
      displayName: 'Memory Maze',
      arcadeTagline: 'Remember. Navigate. Reach the exit. Test your memory and spatial recall.',
      surfaceClass: 'game-card-maze',
      borderClass: 'border-violet-500/45 hover:border-violet-400',
      buttonClass:
        'bg-gradient-to-r from-violet-500 via-indigo-500 to-purple-600 text-white hover:from-violet-400 hover:to-indigo-500 shadow-[0_0_18px_rgba(139,92,246,0.38)]',
      barColor: 'bg-gradient-to-r from-violet-400 to-indigo-500',
    },
    'path-rotation': {
      displayName: 'Path Finder',
      arcadeTagline: 'Rotate. Connect. Complete the path. Build logical routes and solve the puzzle.',
      surfaceClass: 'game-card-path',
      borderClass: 'border-teal-500/45 hover:border-teal-400',
      buttonClass:
        'bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-500 text-slate-950 hover:from-teal-300 hover:to-emerald-300 shadow-[0_0_18px_rgba(20,184,166,0.35)]',
      barColor: 'bg-gradient-to-r from-teal-400 to-cyan-400',
    },
  };

  return (
    <div className="space-y-7">
      {/* Hero Banner — Matching Cognitive_Games_Lab_Dashboard_80f7bae3.png */}
      <section className="arcade-hero-bg border border-indigo-500/30 rounded-3xl p-6 sm:p-8 lg:px-10 lg:py-8 relative overflow-hidden shadow-2xl">
        {/* Subtle Cosmic Mountain Silhouette Backdrop */}
        <svg
          viewBox="0 0 1200 320"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full opacity-35 pointer-events-none"
          aria-hidden="true"
        >
          <polygon points="0,320 0,220 180,130 340,240 520,110 720,250 920,120 1100,210 1200,150 1200,320" fill="#0B132B" />
          <polygon points="120,320 310,165 490,260 690,140 890,260 1060,155 1200,245 1200,320" fill="#070B19" />
        </svg>

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3.5 max-w-xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-cyan-300 font-medium tracking-wide">
              <span>
                Cognitive Assessment Practice Platform ·{' '}
                {GAME_CATALOG.reduce((acc, g) => acc + g.archetypeCount, 0)} Total Puzzle Archetypes
              </span>
              {playerProfile && (
                <button
                  type="button"
                  onClick={openOnboardingModal}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/35 text-cyan-200 hover:bg-cyan-500/25 transition-colors cursor-pointer"
                >
                  <span>Player: {playerProfile.playerName}</span>
                  <span className="text-[10px] text-cyan-300/80">(Switch)</span>
                </button>
              )}
            </div>

            <h1 className="font-display text-3xl sm:text-4xl lg:text-[40px] font-extrabold tracking-tight leading-[1.12] text-white">
              Welcome{playerProfile ? `, ${playerProfile.playerName}` : ' to'}{' '}
              <span className="block bg-gradient-to-r from-violet-300 via-amber-200 to-amber-400 bg-clip-text text-transparent">
                Cognitive Games Lab
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
              Sharpen your mind with engaging puzzle games, track your progress, and unlock your
              full cognitive potential.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-2.5 sm:gap-3">
              <Link
                to={continueRoute}
                className="inline-flex items-center justify-center gap-2.5 px-5 sm:px-6 py-3 min-h-[44px] text-xs sm:text-sm font-bold text-slate-950 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 rounded-full hover:from-amber-300 hover:to-orange-400 transition-all shadow-[0_0_24px_rgba(245,158,11,0.4)] whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current shrink-0" />
                <span>Continue Playing</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </Link>

              <Link
                to="/assessment"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] text-xs font-semibold text-white bg-indigo-950/80 border border-indigo-400/40 rounded-full hover:bg-indigo-900/80 transition-colors whitespace-nowrap"
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                <span>Launch Full Assessment</span>
              </Link>

              <Link
                to="/practice"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] text-xs font-semibold text-slate-200 bg-slate-900/80 border border-slate-700/80 rounded-full hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <Sliders className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>Configure Practice</span>
              </Link>
            </div>
          </div>

          {/* Right: Glowing 3D-Style Brain & Orbiting Game Medallions */}
          <div className="hidden md:flex items-center justify-center relative w-full lg:w-[370px] h-[200px] shrink-0">
            <svg viewBox="0 0 360 210" className="w-full h-full overflow-visible" aria-hidden="true">
              <defs>
                <radialGradient id="brainGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45" />
                  <stop offset="55%" stopColor="#38BDF8" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#070B19" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="brainBody" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38BDF8" />
                  <stop offset="50%" stopColor="#818CF8" />
                  <stop offset="100%" stopColor="#C084FC" />
                </linearGradient>
              </defs>

              <circle cx="185" cy="105" r="95" fill="url(#brainGlow)" />

              {/* Orbital Rings */}
              <ellipse
                cx="185"
                cy="108"
                rx="115"
                ry="48"
                fill="none"
                stroke="#F59E0B"
                strokeOpacity="0.35"
                strokeWidth="1.2"
                transform="rotate(-14 185 108)"
              />
              <ellipse
                cx="185"
                cy="108"
                rx="110"
                ry="42"
                fill="none"
                stroke="#38BDF8"
                strokeOpacity="0.3"
                strokeWidth="1.2"
                transform="rotate(18 185 108)"
              />

              {/* Stylized Luminous Brain */}
              <g transform="translate(115, 38)">
                <path
                  d="M42,32 C22,32 10,48 12,68 C4,76 4,94 16,104 C20,118 36,124 54,122 C66,128 86,128 98,120 C114,122 128,112 130,96 C140,86 138,66 126,56 C126,38 110,24 90,26 C76,16 54,18 42,32 Z"
                  fill="url(#brainBody)"
                  fillOpacity="0.28"
                  stroke="url(#brainBody)"
                  strokeWidth="3"
                />
                <path
                  d="M44,48 C58,42 68,54 56,66 M72,38 C88,36 96,50 84,62 M30,74 C46,68 58,82 44,96 M70,74 C88,68 104,80 92,98 M96,54 C112,56 116,72 104,82"
                  fill="none"
                  stroke="#E0E7FF"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M64,122 L70,142 M78,122 L74,142"
                  stroke="#A855F7"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </g>

              {/* Orbiting Medallion 1: 123 (Top Left) */}
              <g transform="translate(82, 34)">
                <circle cx="24" cy="24" r="24" fill="#B45309" fillOpacity="0.45" stroke="#F59E0B" strokeWidth="2" />
                <text
                  x="24"
                  y="30"
                  textAnchor="middle"
                  fill="#FEF3C7"
                  fontSize="16"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="800"
                >
                  123
                </text>
              </g>

              {/* Orbiting Medallion 2: Maze (Right) */}
              <g transform="translate(268, 56)">
                <circle cx="24" cy="24" r="24" fill="#4C1D95" fillOpacity="0.55" stroke="#A78BFA" strokeWidth="2" />
                <rect x="14" y="14" width="20" height="20" rx="3" fill="none" stroke="#EDE9FE" strokeWidth="2" />
                <path d="M19 14V28H29V20H23" fill="none" stroke="#EDE9FE" strokeWidth="2" strokeLinecap="round" />
              </g>

              {/* Orbiting Medallion 3: Path Finder (Bottom Left) */}
              <g transform="translate(88, 128)">
                <circle cx="24" cy="24" r="24" fill="#115E59" fillOpacity="0.55" stroke="#2DD4BF" strokeWidth="2" />
                <circle cx="17" cy="30" r="3" fill="#99F6E4" />
                <circle cx="24" cy="17" r="3" fill="#99F6E4" />
                <circle cx="32" cy="27" r="3" fill="#99F6E4" />
                <path d="M19 27L22.5 19.5M26 19L30 24.5" stroke="#99F6E4" strokeWidth="2" strokeLinecap="round" />
              </g>
            </svg>
          </div>
        </div>
      </section>

      {/* Choose Your Game — Three Distinctive Game Cards */}
      <section aria-label="Cognitive Game Modules" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2.5">
              <Gamepad2 className="w-6 h-6 text-sky-400 shrink-0" />
              <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                Choose Your Game
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Three unique games. One powerful brain. · Each module includes{' '}
              {GAME_CATALOG[0]?.archetypeCount ?? 50} distinct puzzle archetypes and deterministic
              seed support.
            </p>
          </div>

          {performance.lastSessionId && (
            <Link
              to={`/results/${performance.lastSessionId}`}
              className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Inspect Latest Session Report</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5 items-stretch">
          {GAME_CATALOG.map((game) => {
            const summary = performance.byGame[game.gameType];
            const played = summary.questionsAnswered > 0;
            const masteryPct = Math.round(
              (summary.archetypesMastered.length / game.archetypeCount) * 100
            );
            const theme = cardThemeMap[game.gameType];

            return (
              <article
                key={game.gameType}
                className={`${theme.surfaceClass} border ${theme.borderClass} rounded-2xl p-4 sm:p-6 flex flex-col justify-between gap-4 transition-all shadow-lg`}
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {getGameBadge(game.gameType, 'md')}
                    <div className="min-w-0">
                      <h3 className="font-display text-lg sm:text-xl font-bold text-white leading-tight">
                        {theme.displayName}
                      </h3>
                      <div className="text-[11px] text-slate-300 font-medium leading-snug">
                        {game.title} · {game.cognitiveDomain}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs sm:text-sm text-slate-200 leading-relaxed flex-1">
                      {theme.arcadeTagline}
                    </p>

                    {/* Custom Thematic Game Illustration */}
                    {renderCardArtwork(game.gameType)}
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-300 font-mono tabular-nums">
                    <span>
                      {played ? `Best: ${summary.bestNormalizedScore} pts` : `${game.archetypeCount} Archetypes`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {played ? `Acc: ${summary.accuracyPercent}%` : `${game.defaultQuestions}Q / Round`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {played
                        ? `Avg: ${(summary.averageResponseMs / 1000).toFixed(1)}s`
                        : `${game.defaultPerQuestionSeconds}s / Item`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2.5">
                    <Link
                      to={game.route}
                      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[42px] rounded-full text-xs font-bold transition-all whitespace-nowrap ${theme.buttonClass}`}
                    >
                      <span>Play Now</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </Link>

                    <button
                      type="button"
                      onClick={() => navigate(`/practice?game=${game.gameType}`)}
                      className="px-3.5 py-2 min-h-[42px] text-xs font-semibold text-slate-200 bg-slate-950/60 border border-white/15 rounded-full hover:bg-slate-900 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Configure ({masteryPct}%)
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Bottom 3-Column Bento Grid: Your Progress | Quick Access | Recent Activity */}
      <section
        aria-label="Performance Overview"
        className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch"
      >
        {/* Column 1: Your Progress (5 cols) */}
        <div className="lg:col-span-5 bg-[#0D1428] border border-slate-800/90 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-5 h-5 text-sky-400" />
                <div>
                  <h2 className="font-display text-lg font-bold text-white">Your Progress</h2>
                  <p className="text-xs text-slate-400">
                    Keep going! Real telemetry from your completed sessions.
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Tier: <strong className="text-slate-200 capitalize">{settings.defaultDifficulty}</strong>
              </span>
            </div>

            {/* Per-Game Progress Bars (Matching Reference Screenshot) */}
            <div className="space-y-2.5">
              {GAME_CATALOG.map((game) => {
                const summary = performance.byGame[game.gameType];
                const played = summary.questionsAnswered > 0;
                const masteryPct = Math.round(
                  (summary.archetypesMastered.length / game.archetypeCount) * 100
                );
                const displayPct = played ? Math.max(masteryPct, summary.accuracyPercent) : 0;
                const theme = cardThemeMap[game.gameType];

                return (
                  <div
                    key={game.gameType}
                    className="p-3 rounded-xl bg-[#090E1E] border border-slate-800/90 flex items-center justify-between gap-3"
                  >
                    {getGameBadge(game.gameType, 'sm')}

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-100 truncate">
                          {theme.displayName}
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-200">
                          {displayPct}%
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-800/90 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${theme.barColor}`}
                          style={{ width: `${Math.max(played ? 6 : 0, Math.min(100, displayPct))}%` }}
                        />
                      </div>
                    </div>

                    <Link
                      to={`/practice?game=${game.gameType}`}
                      className="text-[11px] font-semibold text-slate-300 hover:text-cyan-300 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <span>View Details</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Real Telemetry Counters Strip (Preserving exact data-testids) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-800/80">
            <div className="p-2.5 rounded-xl bg-[#090E1E] border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Sessions</div>
              <div
                data-testid="stat-completed-sessions"
                className="text-base font-bold font-mono tabular-nums text-white mt-0.5"
              >
                {performance.totalSessionsCompleted}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#090E1E] border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Accuracy</div>
              <div
                data-testid="stat-overall-accuracy"
                className="text-base font-bold font-mono tabular-nums text-emerald-300 mt-0.5"
              >
                {hasHistory ? `${performance.overallAccuracyPercent}%` : '—'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#090E1E] border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Avg Speed</div>
              <div
                data-testid="stat-avg-response"
                className="text-base font-bold font-mono tabular-nums text-slate-100 mt-0.5"
              >
                {hasHistory ? `${(performance.overallAverageResponseMs / 1000).toFixed(1)}s` : '—'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#090E1E] border border-slate-800/80">
              <div className="text-[10px] text-slate-400">Best Battery</div>
              <div
                data-testid="stat-best-assessment"
                className="text-base font-bold font-mono tabular-nums text-cyan-300 mt-0.5"
              >
                {performance.bestAssessmentScore > 0
                  ? `${performance.bestAssessmentScore} / 1000`
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: Quick Access (3 cols) */}
        <div className="lg:col-span-3 bg-[#0D1428] border border-slate-800/90 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-sky-400 fill-current" />
              <h2 className="font-display text-lg font-bold text-white">Quick Access</h2>
            </div>
            <p className="text-xs text-slate-400">Get started with your next challenge.</p>
          </div>

          <div className="space-y-3 flex-1 flex flex-col justify-center">
            <Link
              to="/assessment"
              className="group p-4 rounded-2xl bg-gradient-to-r from-[#111C3B] to-[#0E1730] border border-blue-500/30 hover:border-blue-400/70 flex items-center justify-between gap-3 transition-all"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-sky-300 shrink-0">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-display text-base font-bold text-white group-hover:text-sky-200">
                    Assessment
                  </div>
                  <p className="text-xs text-slate-300 leading-snug mt-0.5">
                    Test your cognitive skills across all games.
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-sky-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </Link>

            <Link
              to="/practice"
              className="group p-4 rounded-2xl bg-gradient-to-r from-[#111C3B] to-[#0E1730] border border-blue-500/30 hover:border-blue-400/70 flex items-center justify-between gap-3 transition-all"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shrink-0">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-display text-base font-bold text-white group-hover:text-indigo-200">
                    Practice
                  </div>
                  <p className="text-xs text-slate-300 leading-snug mt-0.5">
                    Customize your training and improve at your pace.
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </Link>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>3-Stage Timed Battery</span>
            <span>{performance.totalQuestionsAnswered} Puzzles Solved</span>
          </div>
        </div>

        {/* Column 3: Recent Activity (4 cols) */}
        <div className="lg:col-span-4 bg-[#0D1428] border border-slate-800/90 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-sky-400" />
                <h2 className="font-display text-lg font-bold text-white">Recent Activity</h2>
              </div>
              <Link
                to="/history"
                className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {!hasHistory ? (
              <div
                data-testid="empty-history-indicator"
                className="py-6 px-4 text-center border border-dashed border-slate-800 rounded-xl space-y-3"
              >
                <Clock className="w-7 h-7 text-slate-500 mx-auto" />
                <div className="space-y-1 max-w-xs mx-auto">
                  <h3 className="text-sm font-bold text-slate-200">No Saved Practice History Yet</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Launch any cognitive game or full assessment to record your baseline telemetry.
                  </p>
                </div>
                <div className="pt-1 flex items-center justify-center gap-2.5">
                  <Link
                    to="/games/math-bubbles"
                    className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap"
                  >
                    Start First Session
                  </Link>
                  <Link
                    to="/practice"
                    className="px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap"
                  >
                    Practice Setup
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {recentSessions.slice(0, 4).map((session) => {
                  const isCombined = session.gameType === 'combined-assessment';
                  const displayTitle = isCombined
                    ? 'Assessment'
                    : cardThemeMap[session.gameType as GameType]?.displayName ?? session.gameType;

                  return (
                    <div
                      key={session.sessionId}
                      className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isCombined ? (
                          <div className="w-9 h-9 rounded-full bg-blue-600/30 border border-blue-400/50 flex items-center justify-center text-sky-300 shrink-0">
                            <ClipboardCheck className="w-4 h-4" />
                          </div>
                        ) : (
                          getGameBadge(session.gameType as GameType, 'sm')
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {displayTitle}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            Score {session.score.NormalizedScore} · {session.score.accuracyPercent}% ({session.score.correctCount}/{session.score.totalQuestions})
                          </div>
                        </div>
                      </div>

                      <Link
                        to={`/results/${session.sessionId}`}
                        className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 whitespace-nowrap shrink-0"
                      >
                        Details
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Bottom Motivational Arcade Bar */}
      <div className="bg-[#0B1226] border border-slate-800/90 rounded-2xl px-5 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2.5 text-slate-200 font-medium">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
          <span>Small steps. Big progress.</span>
        </div>
        <div className="italic text-sky-300/90 font-medium">
          “A sharper mind builds a brighter future.”
        </div>
      </div>
    </div>
  );
};
