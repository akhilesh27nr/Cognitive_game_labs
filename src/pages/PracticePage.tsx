import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Beaker, Filter, Play, RotateCcw, Search, Sliders } from 'lucide-react';
import { useLab } from '../context/LabContext.tsx';
import {
  GAME_CATALOG,
  getAllArchetypes,
  getArchetypesForGame,
  SEEDED_TEST_FIXTURES,
  type SeededTestFixture,
} from '../engine/index.ts';
import type { CanonicalDifficulty, Difficulty, EvaluationMode, GameType } from '../types/domain.ts';
import { createDeterministicSeed } from '../utils/prng.ts';
import {
  DifficultySelector,
  EvaluationModeSelector,
  SessionLengthSelector,
} from '../components/SharedControls.tsx';

export const PracticePage: React.FC = () => {
  const { settings } = useLab();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialGameParam = searchParams.get('game') as GameType | null;
  const [selectedGame, setSelectedGame] = useState<GameType>(
    initialGameParam && ['math-bubbles', 'memory-maze', 'path-rotation'].includes(initialGameParam)
      ? initialGameParam
      : 'math-bubbles'
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(settings.defaultDifficulty);
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>(
    settings.defaultEvaluationMode
  );
  const [questionCount, setQuestionCount] = useState<number>(settings.defaultSessionLength || 10);
  const [seed, setSeed] = useState<string>(() => createDeterministicSeed('PRAC'));
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [catalogScope, setCatalogScope] = useState<'selected' | 'all'>('selected');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | CanonicalDifficulty>('all');

  const archetypesForSelectedGame = useMemo(
    () => getArchetypesForGame(selectedGame),
    [selectedGame]
  );
  const allArchetypes = useMemo(() => getAllArchetypes(), []);
  const activeCatalogPool = catalogScope === 'all' ? allArchetypes : archetypesForSelectedGame;

  const totalArchetypesCount = useMemo(
    () => GAME_CATALOG.reduce((acc, g) => acc + g.archetypeCount, 0),
    []
  );

  const filteredArchetypes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeCatalogPool.filter((a) => {
      if (difficultyFilter !== 'all' && a.recommendedDifficulty !== difficultyFilter) {
        return false;
      }
      if (!q) return true;
      return (
        a.code.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      );
    });
  }, [activeCatalogPool, difficultyFilter, searchQuery]);

  const handleLaunchPractice = (overrideArchetypeId?: string, overrideGameType?: GameType) => {
    const targetGame = overrideGameType ?? selectedGame;
    const gameMeta = GAME_CATALOG.find((g) => g.gameType === targetGame) ?? GAME_CATALOG[0];
    const params = new URLSearchParams({
      difficulty,
      mode: evaluationMode,
      questions: String(questionCount),
      seed: seed.trim() || createDeterministicSeed('PRAC'),
      autostart: '1',
    });
    const arch = overrideArchetypeId ?? selectedArchetypeId;
    if (arch) {
      params.set('archetype', arch);
    }
    navigate(`${gameMeta.route}?${params.toString()}`);
  };

  const handleLaunchFixture = (fixture: SeededTestFixture) => {
    const gameMeta = GAME_CATALOG.find((g) => g.gameType === fixture.gameType) ?? GAME_CATALOG[0];
    const params = new URLSearchParams({
      difficulty: fixture.difficulty,
      mode: evaluationMode,
      questions: String(fixture.questionCount),
      seed: fixture.seed,
      archetype: fixture.archetypeId,
      autostart: '1',
    });
    navigate(`${gameMeta.route}?${params.toString()}`);
  };

  const gameIdentityStyles: Record<
    GameType,
    { activeCard: string; badgeBg: string; badgeLabel: string; accentText: string }
  > = {
    'math-bubbles': {
      activeCard: 'game-card-math border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.22)]',
      badgeBg: 'bg-gradient-to-br from-amber-400 to-orange-600 text-slate-950',
      badgeLabel: '123',
      accentText: 'text-amber-300',
    },
    'memory-maze': {
      activeCard: 'game-card-maze border-violet-400 shadow-[0_0_20px_rgba(139,92,246,0.25)]',
      badgeBg: 'bg-gradient-to-br from-indigo-500 to-violet-700 text-white',
      badgeLabel: 'MAZE',
      accentText: 'text-violet-300',
    },
    'path-rotation': {
      activeCard: 'game-card-path border-teal-400 shadow-[0_0_20px_rgba(20,184,166,0.22)]',
      badgeBg: 'bg-gradient-to-br from-teal-400 to-emerald-600 text-slate-950',
      badgeLabel: 'PATH',
      accentText: 'text-teal-300',
    },
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
            Practice Configuration Studio
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            Configure custom practice or exam sessions, lock a deterministic seed for reproduction,
            or drill any of the {totalArchetypesCount} documented puzzle archetypes directly.
          </p>
        </div>
      </div>

      {/* Configuration Panel */}
      <section className="bg-[#0D1428] border border-slate-800/90 rounded-3xl p-6 space-y-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
            <Sliders className="w-4 h-4" />
            <span>Session Parameters</span>
          </div>
          <button
            type="button"
            onClick={() => handleLaunchPractice()}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 rounded-full hover:from-amber-300 hover:to-orange-400 shadow-[0_0_20px_rgba(245,158,11,0.35)] transition-all whitespace-nowrap cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch Configured Session</span>
          </button>
        </div>

        {/* Step 1: Select Cognitive Game */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-200">
            1. Cognitive Game Module
          </label>
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-3.5"
            role="radiogroup"
            aria-label="Select Cognitive Game"
          >
            {GAME_CATALOG.map((game) => {
              const active = selectedGame === game.gameType;
              const style = gameIdentityStyles[game.gameType];
              return (
                <button
                  key={game.gameType}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setSelectedGame(game.gameType);
                    setSelectedArchetypeId('');
                  }}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    active
                      ? `${style.activeCard} text-white`
                      : 'bg-[#080D1C] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-white">{game.title}</div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold ${style.badgeBg}`}
                    >
                      {style.badgeLabel}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 mt-1">{game.cognitiveDomain}</div>
                  <div className={`text-[11px] font-mono font-semibold mt-2 ${style.accentText}`}>
                    {game.archetypeCount} Distinct Archetypes
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2 & Step 3 side by side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-200">
              2. Evaluation Mode (Practice vs Exam)
            </label>
            <EvaluationModeSelector
              value={evaluationMode}
              onChange={setEvaluationMode}
              idPrefix="prac-eval"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-200">
              3. Session Length (Questions)
            </label>
            <SessionLengthSelector
              value={questionCount}
              onChange={setQuestionCount}
              idPrefix="prac-len"
            />
          </div>
        </div>

        {/* Step 4: Difficulty */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-200">
            4. Difficulty Tier (5 Levels + Adaptive)
          </label>
          <DifficultySelector value={difficulty} onChange={setDifficulty} idPrefix="prac-diff" />
        </div>

        {/* Step 5: Seed & Focus Archetype */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="prac-seed" className="block text-xs font-medium text-slate-300 mb-1">
              Deterministic Seed
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="prac-seed"
                type="text"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-[#080D1C] border border-slate-800 rounded-lg text-slate-100"
              />
              <button
                type="button"
                aria-label="Regenerate seed"
                onClick={() => setSeed(createDeterministicSeed('PRAC'))}
                className="p-2 text-slate-300 hover:text-white bg-[#080D1C] border border-slate-800 rounded-lg cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="prac-archetype"
              className="block text-xs font-medium text-slate-300 mb-1"
            >
              Focus Archetype (Optional)
            </label>
            <select
              id="prac-archetype"
              value={selectedArchetypeId}
              onChange={(e) => setSelectedArchetypeId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#080D1C] border border-slate-800 rounded-lg text-slate-100"
            >
              <option value="">
                All {archetypesForSelectedGame.length} Archetypes (Mixed Rotation)
              </option>
              {archetypesForSelectedGame.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.title} ({a.recommendedDifficulty})
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Reproducible Seeded Test Fixtures (All 3 Games) */}
      <section className="bg-[#0D1428] border border-slate-800/90 rounded-3xl p-6 space-y-4 shadow-lg">
        <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
          <Beaker className="w-4 h-4" />
          <span>
            Deterministic Seeded Benchmark Fixtures ({SEEDED_TEST_FIXTURES.length} Scenarios)
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {SEEDED_TEST_FIXTURES.map((fixture) => {
            const style = gameIdentityStyles[fixture.gameType];
            return (
              <div
                key={fixture.id}
                className="p-4 rounded-2xl bg-[#080D1C] border border-slate-800/90 hover:border-slate-700 flex flex-col justify-between gap-3 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span className={style.accentText}>{fixture.seed}</span>
                    <span className="uppercase">{fixture.difficulty}</span>
                  </div>
                  <h3 className="text-xs font-bold text-white">{fixture.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{fixture.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleLaunchFixture(fixture)}
                  className={`self-start inline-flex items-center gap-1.5 text-xs font-bold ${style.accentText} hover:underline cursor-pointer`}
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Launch Benchmark Fixture</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Archetype Directory Explorer */}
      <section className="bg-[#0D1428] border border-slate-800/90 rounded-3xl p-6 space-y-5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              Archetype Catalog ({filteredArchetypes.length} of {activeCatalogPool.length})
            </h2>
            <p className="text-xs text-slate-400">
              Browse all {totalArchetypesCount} documented cognitive puzzle archetypes or filter by
              game, difficulty tier, or keyword.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-800 bg-[#080D1C] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setCatalogScope('selected')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  catalogScope === 'selected'
                    ? 'bg-blue-600/40 text-white border border-blue-400/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Selected Game (50)
              </button>
              <button
                type="button"
                onClick={() => setCatalogScope('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  catalogScope === 'all'
                    ? 'bg-blue-600/40 text-white border border-blue-400/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Games ({totalArchetypesCount})
              </button>
            </div>

            <div className="relative">
              <Filter className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <select
                aria-label="Filter archetypes by difficulty"
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value as 'all' | CanonicalDifficulty)}
                className="pl-8 pr-3 py-1.5 text-xs bg-[#080D1C] border border-slate-800 rounded-xl text-slate-200"
              >
                <option value="all">All Difficulty Tiers</option>
                <option value="beginner">Beginner</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="expert">Expert</option>
              </select>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="Search archetypes"
                placeholder="Filter by code, title, category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#080D1C] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[540px] overflow-y-auto pr-1">
          {filteredArchetypes.map((arch) => {
            const style = gameIdentityStyles[arch.gameType];
            return (
              <div
                key={arch.id}
                className="p-4 rounded-2xl bg-[#080D1C] border border-slate-800/90 flex flex-col justify-between gap-3 hover:border-slate-700 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className={`font-mono font-bold ${style.accentText}`}>{arch.code}</span>
                    <span>
                      {arch.category} ·{' '}
                      <span className="capitalize">{arch.recommendedDifficulty}</span>
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white">{arch.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{arch.description}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleLaunchPractice(arch.id, arch.gameType)}
                  className={`self-start text-xs font-bold ${style.accentText} hover:underline inline-flex items-center gap-1 cursor-pointer`}
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Drill Archetype</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
