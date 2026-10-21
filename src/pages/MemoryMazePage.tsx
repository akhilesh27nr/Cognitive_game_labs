import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Beaker,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Eye,
  Flag,
  HelpCircle,
  Lock,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { useLab } from '../context/LabContext.tsx';
import { HowToPlayModal } from '../components/HowToPlayModal.tsx';
import { shouldHideGameInstructions } from '../storage/persistence.ts';
import {
  aggregateSessionScore,
  getAllowedKeyCountsForGridSize,
  MEMORY_MAZE_ARCHETYPES,
  MEMORY_MAZE_GRID_KEY_OPTIONS,
  memoryMazeEngine,
  SEEDED_TEST_FIXTURES,
  type MemoryMazeGridKeyOption,
  type MoveDirection,
} from '../engine/index.ts';
import {
  normalizeDifficulty,
  type Difficulty,
  type EvaluationMode,
  type GameConfig,
  type QuestionResult,
  type SessionRecord,
} from '../types/domain.ts';
import { createDeterministicSeed } from '../utils/prng.ts';
import { soundFX } from '../utils/sound.ts';
import {
  DifficultySelector,
  EvaluationModeSelector,
  FeedbackBanner,
  SessionLengthSelector,
  TimerBar,
} from '../components/SharedControls.tsx';

function sameCoord(a: { row: number; col: number }, b: { row: number; col: number }): boolean {
  return a.row === b.row && a.col === b.col;
}

function formatSecondsMMSS(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

export const MemoryMazePage: React.FC = () => {
  const { settings, recordSession } = useLab();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const querySeed = searchParams.get('seed');
  const queryDiff = searchParams.get('difficulty') as Difficulty | null;
  const queryMode = searchParams.get('mode') as EvaluationMode | null;
  const queryCount = Number(searchParams.get('questions'));
  const queryTimer = Number(searchParams.get('timer'));
  const queryArchetype = searchParams.get('archetype') ?? undefined;
  const queryGrid = Number(searchParams.get('grid'));
  const queryKeys = Number(searchParams.get('keys'));
  const autostart = searchParams.get('autostart') === '1';

  const [difficulty, setDifficulty] = useState<Difficulty>(
    queryDiff ? normalizeDifficulty(queryDiff) : settings.defaultDifficulty
  );
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>(
    queryMode === 'exam' || queryMode === 'practice' ? queryMode : settings.defaultEvaluationMode
  );
  const [seed, setSeed] = useState<string>(querySeed || createDeterministicSeed('MM'));
  const [questionCount, setQuestionCount] = useState<number>(
    Number.isFinite(queryCount) && queryCount >= 1 && queryCount <= 100
      ? queryCount
      : settings.defaultSessionLength || 10
  );
  const [perQuestionSeconds, setPerQuestionSeconds] = useState<number>(
    Number.isFinite(queryTimer) && queryTimer >= 10 && queryTimer <= 180 ? queryTimer : 35
  );
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>(queryArchetype ?? '');
  const [gridSizeOverride, setGridSizeOverride] = useState<number | undefined>(
    [3, 4, 5, 6].includes(queryGrid) ? queryGrid : undefined
  );
  const [keyCountOverride, setKeyCountOverride] = useState<number | undefined>(
    [1, 2, 3, 4, 5].includes(queryKeys) ? queryKeys : undefined
  );
  const [challengeMode, setChallengeMode] = useState<
    'hidden-barrier-discovery' | 'flash-pattern-recall'
  >('hidden-barrier-discovery');

  const [stage, setStage] = useState<'title' | 'playing' | 'paused'>(autostart ? 'playing' : 'title');
  const [howToPlayOpen, setHowToPlayOpen] = useState<boolean>(false);
  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [sessionStartIso, setSessionStartIso] = useState<string>(() => new Date().toISOString());

  // Edge collision flash state: flashes the contested border in high-contrast red for 360ms then hides it again
  const [flashedWallEdge, setFlashedWallEdge] = useState<{
    from: { row: number; col: number };
    to: { row: number; col: number };
    direction: MoveDirection;
  } | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const isExamMode = evaluationMode === 'exam';

  const config: GameConfig = useMemo(
    () => ({
      gameType: 'memory-maze',
      difficulty,
      evaluationMode,
      questionCount,
      timeLimitSeconds: questionCount * perQuestionSeconds,
      perQuestionTimeSeconds: perQuestionSeconds,
      seed,
      archetypeId: selectedArchetypeId || undefined,
      gridSizeOverride,
      keyCountOverride,
      allowedKeyCounts: gridSizeOverride
        ? getAllowedKeyCountsForGridSize(gridSizeOverride)
        : undefined,
      mazeChallengeMode: challengeMode,
      practiceRules: {
        ...settings.practiceRules,
        showLiveValidation: !isExamMode && settings.practiceRules.showLiveValidation,
        strictOrderPenalty: isExamMode || settings.practiceRules.strictOrderPenalty,
      },
    }),
    [
      difficulty,
      evaluationMode,
      questionCount,
      perQuestionSeconds,
      seed,
      selectedArchetypeId,
      gridSizeOverride,
      keyCountOverride,
      challengeMode,
      settings.practiceRules,
      isExamMode,
    ]
  );

  const generated = useMemo(
    () => memoryMazeEngine.generatePuzzle(config, questionIndex),
    [config, questionIndex]
  );

  const [puzzleState, setPuzzleState] = useState(generated.initialState);
  const puzzleStateRef = useRef(generated.initialState);
  const [feedbackTone, setFeedbackTone] = useState<'neutral' | 'success' | 'error'>('neutral');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(generated.metadata.timeLimitSeconds);
  const questionStartRef = useRef<number>(performance.now());
  const pausedAccumulatedMsRef = useRef<number>(0);
  const pauseStartedAtRef = useRef<number | null>(null);
  const advancingRef = useRef<boolean>(false);
  const sessionFinalizedRef = useRef<boolean>(false);

  const mmFixtures = useMemo(
    () => SEEDED_TEST_FIXTURES.filter((f) => f.gameType === 'memory-maze'),
    []
  );

  useEffect(() => {
    document.body.dataset.state = stage;
    return () => {
      delete document.body.dataset.state;
    };
  }, [stage]);

  useEffect(() => {
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    setFlashedWallEdge(null);
    puzzleStateRef.current = generated.initialState;
    setPuzzleState(generated.initialState);
    setFeedbackTone('neutral');
    setRemainingSeconds(generated.metadata.timeLimitSeconds);
    questionStartRef.current = performance.now();
    pausedAccumulatedMsRef.current = 0;
    pauseStartedAtRef.current = null;
    advancingRef.current = false;
  }, [generated]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  // Auto-transition from flash-memorize phase to navigate phase
  useEffect(() => {
    if (stage !== 'playing' || puzzleState.phase !== 'memorize') return;
    const timer = window.setTimeout(() => {
      const outcome = memoryMazeEngine.validateAction(generated.puzzle, puzzleStateRef.current, {
        type: 'begin-navigation',
      });
      puzzleStateRef.current = outcome.nextState;
      setPuzzleState(outcome.nextState);
    }, generated.puzzle.memorizeDurationMs || 1800);
    return () => window.clearTimeout(timer);
  }, [stage, puzzleState.phase, generated.puzzle]);

  const triggerEdgeFlash = useCallback(
    (from: { row: number; col: number }, to: { row: number; col: number }, direction: MoveDirection) => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
      setFlashedWallEdge({ from, to, direction });
      flashTimerRef.current = window.setTimeout(() => {
        setFlashedWallEdge(null);
        flashTimerRef.current = null;
      }, 360);
    },
    []
  );

  const saveAndNavigateResults = useCallback(
    (finalResults: QuestionResult[], status: 'completed' | 'abandoned') => {
      if (sessionFinalizedRef.current) return;
      sessionFinalizedRef.current = true;
      const sessionId = `ses-mm-${Date.now().toString(36)}`;
      const sessionScore = aggregateSessionScore(finalResults, config.questionCount);
      const record: SessionRecord = {
        sessionId,
        mode: isExamMode ? 'exam' : 'standalone',
        evaluationMode,
        gameType: 'memory-maze',
        status,
        startedAtIso: sessionStartIso,
        completedAtIso: new Date().toISOString(),
        seed: config.seed,
        difficulty: config.difficulty,
        config,
        score: sessionScore,
        questionResults: finalResults,
      };
      recordSession(record);
      soundFX.playComplete(settings.soundEnabled);
      navigate(`/results/${sessionId}`);
    },
    [config, evaluationMode, isExamMode, navigate, recordSession, sessionStartIso, settings.soundEnabled]
  );

  const finalizeQuestionAndAdvance = useCallback(
    (finalState: typeof puzzleState, timedOut: boolean) => {
      if (advancingRef.current) return;
      advancingRef.current = true;

      const activeElapsedMs =
        performance.now() - questionStartRef.current - pausedAccumulatedMsRef.current;

      const elapsedMs = Math.max(
        50,
        Math.round(timedOut ? generated.metadata.timeLimitSeconds * 1000 : activeElapsedMs)
      );

      const qResult = memoryMazeEngine.calculateQuestionResult({
        metadata: generated.metadata,
        puzzle: generated.puzzle,
        finalState,
        elapsedMs,
        timedOut,
      });

      const updatedResults = [...results, qResult];
      setResults(updatedResults);

      if (questionIndex + 1 < config.questionCount) {
        setQuestionIndex((prev) => prev + 1);
      } else {
        saveAndNavigateResults(updatedResults, 'completed');
      }
    },
    [config.questionCount, generated, questionIndex, results, saveAndNavigateResults]
  );

  useEffect(() => {
    if (stage !== 'playing') return;

    const interval = window.setInterval(() => {
      const elapsedSec =
        (performance.now() - questionStartRef.current - pausedAccumulatedMsRef.current) / 1000;
      const nextRemaining = Math.max(0, generated.metadata.timeLimitSeconds - elapsedSec);
      setRemainingSeconds(nextRemaining);

      if (nextRemaining <= 0) {
        window.clearInterval(interval);
        soundFX.playError(settings.soundEnabled);
        finalizeQuestionAndAdvance(puzzleStateRef.current, true);
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [
    stage,
    generated.metadata.timeLimitSeconds,
    finalizeQuestionAndAdvance,
    settings.soundEnabled,
  ]);

  const handleTogglePause = useCallback(() => {
    if (isExamMode) return;
    setStage((prev) => {
      if (prev === 'playing') {
        pauseStartedAtRef.current = performance.now();
        return 'paused';
      }
      if (prev === 'paused') {
        if (pauseStartedAtRef.current !== null) {
          pausedAccumulatedMsRef.current += performance.now() - pauseStartedAtRef.current;
          pauseStartedAtRef.current = null;
        }
        return 'playing';
      }
      return prev;
    });
  }, [isExamMode]);

  const handleMove = useCallback(
    (direction: MoveDirection) => {
      if (stage !== 'playing' || advancingRef.current) return;

      const prevPlayer = { ...puzzleStateRef.current.player };
      const dRow = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
      const dCol = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
      const target = { row: prevPlayer.row + dRow, col: prevPlayer.col + dCol };

      const isWallEdge =
        target.row >= 0 &&
        target.row < generated.puzzle.gridSize &&
        target.col >= 0 &&
        target.col < generated.puzzle.gridSize &&
        (generated.puzzle.staticWalls.some((w) => sameCoord(w, target)) ||
          generated.puzzle.hazards.some((h) => sameCoord(h, target)));

      if (isWallEdge) {
        triggerEdgeFlash(prevPlayer, target, direction);
      }

      const outcome = memoryMazeEngine.validateAction(generated.puzzle, puzzleStateRef.current, {
        type: 'move',
        direction,
      });

      puzzleStateRef.current = outcome.nextState;
      setPuzzleState(outcome.nextState);

      if (outcome.mistakeMade) {
        soundFX.playError(settings.soundEnabled);
        setFeedbackTone('error');
      } else if (outcome.valid) {
        soundFX.playMove(settings.soundEnabled);
        setFeedbackTone(outcome.isComplete ? 'success' : 'neutral');
      }

      if (outcome.isComplete) {
        soundFX.playSuccess(settings.soundEnabled);
        finalizeQuestionAndAdvance(outcome.nextState, false);
      }
    },
    [stage, generated.puzzle, settings.soundEnabled, finalizeQuestionAndAdvance, triggerEdgeFlash]
  );

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (stage !== 'playing' || advancingRef.current) return;

      const prevPlayer = { ...puzzleStateRef.current.player };
      const manhattan = Math.abs(row - prevPlayer.row) + Math.abs(col - prevPlayer.col);
      if (manhattan === 1) {
        const dir: MoveDirection =
          row < prevPlayer.row
            ? 'up'
            : row > prevPlayer.row
            ? 'down'
            : col < prevPlayer.col
            ? 'left'
            : 'right';
        handleMove(dir);
        return;
      }

      const outcome = memoryMazeEngine.validateAction(generated.puzzle, puzzleStateRef.current, {
        type: 'step-to',
        row,
        col,
      });

      puzzleStateRef.current = outcome.nextState;
      setPuzzleState(outcome.nextState);

      if (outcome.mistakeMade) {
        soundFX.playError(settings.soundEnabled);
        setFeedbackTone('error');
      } else if (outcome.valid) {
        soundFX.playMove(settings.soundEnabled);
        setFeedbackTone(outcome.isComplete ? 'success' : 'neutral');
      }

      if (outcome.isComplete) {
        soundFX.playSuccess(settings.soundEnabled);
        finalizeQuestionAndAdvance(outcome.nextState, false);
      }
    },
    [stage, generated.puzzle, settings.soundEnabled, finalizeQuestionAndAdvance, handleMove]
  );

  const handleResetPosition = useCallback(() => {
    if (stage !== 'playing' || advancingRef.current) return;
    const outcome = memoryMazeEngine.validateAction(generated.puzzle, puzzleStateRef.current, {
      type: 'reset-position',
    });
    puzzleStateRef.current = outcome.nextState;
    setPuzzleState(outcome.nextState);
    setFeedbackTone('neutral');
  }, [stage, generated.puzzle]);

  const handlePeekHint = useCallback(() => {
    if (stage !== 'playing' || isExamMode || advancingRef.current) return;
    const outcome = memoryMazeEngine.validateAction(generated.puzzle, puzzleStateRef.current, {
      type: 'reveal-hint',
    });
    puzzleStateRef.current = outcome.nextState;
    setPuzzleState(outcome.nextState);
    setFeedbackTone('neutral');
  }, [stage, isExamMode, generated.puzzle]);

  const handleFinishEarly = useCallback(() => {
    if (results.length > 0) {
      saveAndNavigateResults(results, 'abandoned');
    } else {
      const elapsedMs = Math.max(
        50,
        Math.round(performance.now() - questionStartRef.current - pausedAccumulatedMsRef.current)
      );
      const qResult = memoryMazeEngine.calculateQuestionResult({
        metadata: generated.metadata,
        puzzle: generated.puzzle,
        finalState: puzzleStateRef.current,
        elapsedMs,
        timedOut: false,
      });
      saveAndNavigateResults([qResult], 'abandoned');
    }
  }, [generated, results, saveAndNavigateResults]);

  const launchGameRoundNow = useCallback(() => {
    setHowToPlayOpen(false);
    sessionFinalizedRef.current = false;
    setQuestionIndex(0);
    setResults([]);
    setSessionStartIso(new Date().toISOString());
    questionStartRef.current = performance.now();
    pausedAccumulatedMsRef.current = 0;
    pauseStartedAtRef.current = null;
    setStage('playing');
  }, []);

  const handleStartRequest = useCallback(() => {
    if (shouldHideGameInstructions('memory_maze')) {
      launchGameRoundNow();
    } else {
      setHowToPlayOpen(true);
    }
  }, [launchGameRoundNow]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (howToPlayOpen) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (stage === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartRequest();
        }
        return;
      }

      if (e.key === 'Escape' && !isExamMode) {
        e.preventDefault();
        handleTogglePause();
        return;
      }

      if (stage !== 'playing') return;

      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        handleMove('up');
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleMove('down');
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleMove('left');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleMove('right');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleResetPosition();
      } else if ((e.key === 'h' || e.key === 'H') && !isExamMode) {
        e.preventDefault();
        handlePeekHint();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    stage,
    howToPlayOpen,
    isExamMode,
    handleStartRequest,
    handleTogglePause,
    handleMove,
    handleResetPosition,
    handlePeekHint,
  ]);

  const applyFixture = (fixture: (typeof mmFixtures)[number]) => {
    setDifficulty(fixture.difficulty);
    setSeed(fixture.seed);
    setSelectedArchetypeId(fixture.archetypeId);
    setQuestionCount(fixture.questionCount);
    setPerQuestionSeconds(35);
  };

  if (stage === 'title') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          <span className="text-xs font-mono text-violet-300">
            50 Documented Spatial Archetypes · Multi-State BFS Verified
          </span>
        </div>

        <section className="game-card-maze border border-violet-500/40 rounded-3xl p-6 sm:p-7 space-y-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-700 text-white flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.4)] shrink-0">
                <Compass className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-violet-500/15 border border-violet-400/40 text-violet-300">
                  🧩 MEMORY MAZE
                </span>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white leading-tight">
                  Memory Maze
                </h1>
              </div>
            </div>

            <button
              type="button"
              data-testid="open-how-to-play-btn"
              onClick={() => setHowToPlayOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-violet-200 bg-violet-500/15 border border-violet-400/35 hover:bg-violet-500/25 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>(?) How to Play</span>
            </button>
          </div>

          <div className="space-y-4 pt-3 border-t border-white/10">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-200">
                Session Mode (Practice vs Exam)
              </label>
              <EvaluationModeSelector
                value={evaluationMode}
                onChange={setEvaluationMode}
                idPrefix="mm-mode"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-200">
                Difficulty Tier (5 Levels + Adaptive)
              </label>
              <DifficultySelector
                value={difficulty}
                onChange={(nextDiff) => {
                  setDifficulty(nextDiff);
                  setGridSizeOverride(undefined);
                  setKeyCountOverride(undefined);
                }}
                idPrefix="mm-diff"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-200">
                Grid Size & Key Options
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {MEMORY_MAZE_GRID_KEY_OPTIONS.map((opt) => {
                  const activeGrid = generated.puzzle.gridSize === opt.gridSize;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`lobby-${opt.id}`}
                      onClick={() => {
                        setDifficulty(opt.defaultDifficulty);
                        setGridSizeOverride(opt.gridSize);
                        setSelectedArchetypeId(opt.defaultArchetypeId);
                        if (activeGrid) {
                          const currentIdx = opt.allowedKeyCounts.indexOf(
                            keyCountOverride ?? generated.puzzle.keysOrder.length
                          );
                          const nextKeyCount =
                            opt.allowedKeyCounts[(currentIdx + 1) % opt.allowedKeyCounts.length];
                          setKeyCountOverride(nextKeyCount);
                        } else {
                          setKeyCountOverride(opt.allowedKeyCounts[0]);
                        }
                        setSeed(createDeterministicSeed('MM'));
                      }}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                        activeGrid
                          ? 'bg-indigo-600 text-white shadow-md border border-indigo-400'
                          : 'bg-[#121A35] text-slate-200 border border-slate-700 hover:border-indigo-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-200">
                Session Length (Mazes)
              </label>
              <SessionLengthSelector
                value={questionCount}
                onChange={setQuestionCount}
                idPrefix="mm-len"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="mm-challenge" className="block text-xs font-medium text-slate-300 mb-1">
                  Barrier Recall Mode
                </label>
                <select
                  id="mm-challenge"
                  value={challengeMode}
                  onChange={(e) =>
                    setChallengeMode(
                      e.target.value as 'hidden-barrier-discovery' | 'flash-pattern-recall'
                    )
                  }
                  className="w-full px-3 py-2 text-xs bg-[#090D16] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-violet-400"
                >
                  <option value="hidden-barrier-discovery">Hidden-Barrier Discovery (Default)</option>
                  <option value="flash-pattern-recall">Flash-Pattern Recall (1.8s Preview)</option>
                </select>
              </div>

              <div>
                <label htmlFor="mm-seed" className="block text-xs font-medium text-slate-300 mb-1">
                  Deterministic Seed
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="mm-seed"
                    type="text"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-[#090D16] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-violet-400"
                  />
                  <button
                    type="button"
                    aria-label="Generate random seed"
                    onClick={() => setSeed(createDeterministicSeed('MM'))}
                    className="p-2 text-slate-300 hover:text-white bg-[#090D16] border border-slate-700 rounded-lg cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="mm-archetype" className="block text-xs font-medium text-slate-300 mb-1">
                  Archetype Filter (50 Available)
                </label>
                <select
                  id="mm-archetype"
                  value={selectedArchetypeId}
                  onChange={(e) => setSelectedArchetypeId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#090D16] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-violet-400"
                >
                  <option value="">All 50 Archetypes (Auto-Rotate)</option>
                  {MEMORY_MAZE_ARCHETYPES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.title} ({a.recommendedDifficulty})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-300">
                <Beaker className="w-3.5 h-3.5" />
                <span>Reproducible Seeded Test Fixtures</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {mmFixtures.map((fix) => (
                  <button
                    key={fix.id}
                    type="button"
                    onClick={() => applyFixture(fix)}
                    className="text-left p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-violet-500/60 transition-colors cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-violet-300">{fix.title}</div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      Seed: {fix.seed} · {fix.questionCount}Q
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => setHowToPlayOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-violet-300 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>(?) How to Play</span>
            </button>

            <button
              type="button"
              data-start="true"
              data-testid="start-session-btn"
              onClick={handleStartRequest}
              className="inline-flex items-center gap-2 px-7 py-3 text-sm font-bold text-white bg-gradient-to-r from-violet-500 via-indigo-500 to-purple-600 rounded-full hover:from-violet-400 hover:to-indigo-500 shadow-[0_0_24px_rgba(139,92,246,0.4)] transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Memory Maze</span>
            </button>
          </div>
        </section>

        <HowToPlayModal
          gameId="memory_maze"
          open={howToPlayOpen}
          onStartPlay={launchGameRoundNow}
          onClose={() => setHowToPlayOpen(false)}
        />
      </div>
    );
  }

  const { puzzle, metadata } = generated;
  const gridSize = puzzle.gridSize;
  const showMemorizePreview = puzzleState.phase === 'memorize';
  const timerRatio = Math.max(0, Math.min(1, remainingSeconds / Math.max(1, metadata.timeLimitSeconds)));
  const ringRadius = 22;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - timerRatio);

  const isCellBlockedByWall = (r: number, c: number): boolean => {
    return (
      puzzle.staticWalls.some((w) => w.row === r && w.col === c) ||
      puzzle.hazards.some((h) => h.row === r && h.col === c)
    );
  };

  // Check if the border edge between (r1, c1) and (r2, c2) is currently flashing red from a collision
  const isEdgeFlashing = (r1: number, c1: number, r2: number, c2: number): boolean => {
    if (!flashedWallEdge) return false;
    return (
      (flashedWallEdge.from.row === r1 &&
        flashedWallEdge.from.col === c1 &&
        flashedWallEdge.to.row === r2 &&
        flashedWallEdge.to.col === c2) ||
      (flashedWallEdge.from.row === r2 &&
        flashedWallEdge.from.col === c2 &&
        flashedWallEdge.to.row === r1 &&
        flashedWallEdge.to.col === c1)
    );
  };

  // In Beginner Flash-Preview mode, show edge walls briefly during the memorize phase only
  const isEdgePreviewVisible = (r1: number, c1: number, r2: number, c2: number): boolean => {
    if (!showMemorizePreview) return false;
    return isCellBlockedByWall(r1, c1) !== isCellBlockedByWall(r2, c2);
  };

  const handleSelectGridKeyOption = (opt: MemoryMazeGridKeyOption) => {
    const isAlreadyThisGrid = gridSize === opt.gridSize;
    setDifficulty(opt.defaultDifficulty);
    setGridSizeOverride(opt.gridSize);
    setSelectedArchetypeId(opt.defaultArchetypeId);
    if (isAlreadyThisGrid) {
      const currentIdx = opt.allowedKeyCounts.indexOf(
        keyCountOverride ?? puzzle.keysOrder.length
      );
      const nextKeyCount =
        opt.allowedKeyCounts[(currentIdx + 1) % opt.allowedKeyCounts.length];
      setKeyCountOverride(nextKeyCount);
    } else {
      setKeyCountOverride(opt.allowedKeyCounts[0]);
    }
    setSeed(createDeterministicSeed('MM'));
  };

  const activeGridAllowedKeys = getAllowedKeyCountsForGridSize(gridSize);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Top Game Header + Preset Tabs */}
      <header className="bg-[#0E152B] border border-violet-500/30 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="p-2 rounded-xl bg-[#070B19] border border-slate-800 text-slate-300 hover:text-white"
            aria-label="Exit to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-300 font-mono">
              <span className="text-violet-300 font-bold">Memory Maze</span>
              <span aria-hidden="true">·</span>
              <span>{metadata.archetypeTitle}</span>
              <span aria-hidden="true">·</span>
              <span className="uppercase text-violet-300">{metadata.difficulty}</span>
              <span aria-hidden="true">·</span>
              <span>
                {gridSize}×{gridSize} Grid ({puzzle.keysOrder.length}{' '}
                {puzzle.keysOrder.length === 1 ? 'Key' : 'Keys'})
              </span>
              {isExamMode && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-violet-300">
                    <ShieldAlert className="w-3 h-3" /> Exam Mode
                  </span>
                </>
              )}
            </div>
            <h1 className="text-base font-bold text-white font-mono tabular-nums">
              Maze {questionIndex + 1} of {config.questionCount}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleResetPosition}
            disabled={stage !== 'playing'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#070B19] border border-slate-800 text-slate-200 hover:text-white disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Position</span>
          </button>
          {!isExamMode && (
            <>
              <button
                type="button"
                onClick={handlePeekHint}
                disabled={stage !== 'playing' || puzzleState.hintRevealed}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#070B19] border border-slate-800 text-violet-300 hover:text-violet-200 disabled:opacity-40 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Peek Barriers</span>
              </button>
              <button
                type="button"
                onClick={handleTogglePause}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                {stage === 'paused' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{stage === 'paused' ? 'Resume' : 'Pause'}</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleFinishEarly}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#070B19] border border-slate-700 text-slate-200 hover:text-white cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5 text-violet-400" />
            <span>Finish Early</span>
          </button>
        </div>
      </header>

      {/* Preset Pill Switcher: 3×3 (1/2 Keys) | 4×4 (2/3 Keys) | 5×5 (2/3/4 Keys) | 6×6 (3/4/5 Keys) */}
      {!isExamMode && (
        <div
          data-testid="memory-maze-options-bar"
          className="flex flex-wrap items-center justify-between gap-2.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            {MEMORY_MAZE_GRID_KEY_OPTIONS.map((opt) => {
              const isActiveGrid = gridSize === opt.gridSize;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={opt.id}
                  onClick={() => handleSelectGridKeyOption(opt)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    isActiveGrid
                      ? 'bg-indigo-600 text-white shadow-md border border-indigo-400'
                      : 'bg-[#121A35] text-slate-200 border border-slate-700 hover:border-indigo-400'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Direct Key-Count Selector for Active Grid Size */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-slate-400 mr-1">
              {gridSize}×{gridSize} Keys:
            </span>
            {activeGridAllowedKeys.map((kCount) => {
              const isSelectedKeyCount = puzzle.keysOrder.length === kCount;
              return (
                <button
                  key={`key-count-${kCount}`}
                  type="button"
                  data-testid={`mm-key-count-${kCount}`}
                  onClick={() => {
                    setGridSizeOverride(gridSize);
                    setKeyCountOverride(kCount);
                    setSeed(createDeterministicSeed('MM'));
                  }}
                  className={`px-3 py-1 rounded-full text-[11px] font-mono font-bold transition-all cursor-pointer ${
                    isSelectedKeyCount
                      ? 'bg-amber-500/25 text-amber-200 border border-amber-400/70 shadow-xs'
                      : 'bg-[#0E152B] text-slate-300 border border-slate-700 hover:border-amber-400/50'
                  }`}
                >
                  {kCount} {kCount === 1 ? 'Key' : 'Keys'}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Stage Card — Matching PDF Page 3 Layout + Right Controller */}
      <section className="bg-[#F4F4F6] text-slate-900 border-2 border-slate-700/80 rounded-3xl p-4 sm:p-6 relative overflow-hidden shadow-2xl">
        {stage === 'paused' && (
          <div className="absolute inset-0 z-30 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <h2 className="text-xl font-bold text-white">Maze Paused</h2>
            <p className="text-xs text-slate-300 max-w-sm">
              Grid coordinates are hidden while paused.
            </p>
            <button
              type="button"
              onClick={handleTogglePause}
              className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 rounded-full hover:bg-indigo-500 cursor-pointer"
            >
              Resume Session
            </button>
          </div>
        )}

        {/* Centered Stage Title & Subtitle */}
        <div className="text-center mb-4">
          <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900">
            {metadata.archetypeTitle}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium">
            {gridSize}×{gridSize} grid, {puzzle.keysOrder.length} key
            {puzzle.keysOrder.length === 1 ? '' : 's'}, {metadata.timeLimitSeconds} seconds
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-center">
          {/* Left/Center: Interactive Square Maze Grid with Edge-Based Walls */}
          <div className="lg:col-span-7 flex flex-col items-center w-full">
            <div className="p-2 sm:p-3 w-full flex justify-center">
              <div
                role="grid"
                aria-label={`Memory Maze ${gridSize} by ${gridSize} grid`}
                className="grid gap-0 w-full max-w-[340px] sm:max-w-[390px] aspect-square rounded-2xl bg-white border-[2.5px] border-slate-900 shadow-lg overflow-visible"
                style={{
                  gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: gridSize }).map((_, r) =>
                  Array.from({ length: gridSize }).map((__, c) => {
                    const coord = { row: r, col: c };
                    const isPlayer = sameCoord(puzzleState.player, coord);
                    const isStart = sameCoord(puzzle.start, coord);
                    const isGoal = sameCoord(puzzle.goal, coord);
                    const isDecoy = puzzle.decoyExit ? sameCoord(puzzle.decoyExit, coord) : false;
                    const isVisited = puzzleState.visitedPath.some((v) => sameCoord(v, coord));

                    const keyItem = puzzle.keysOrder.find((k) => sameCoord(k.coord, coord));
                    const isKeyCollected = keyItem
                      ? puzzleState.collectedKeyIds.includes(keyItem.id)
                      : false;

                    const doorItem = puzzle.doors.find((d) => sameCoord(d.coord, coord));
                    const isDoorUnlocked = doorItem
                      ? puzzleState.collectedKeyIds.includes(doorItem.requiresKeyId)
                      : false;

                    const oneWay = puzzle.oneWayDoors.find((o) => sameCoord(o.coord, coord));
                    const isOptimalHint =
                      puzzleState.hintRevealed && puzzle.optimalPath.some((p) => sameCoord(p, coord));

                    // Edge-based walls: cells themselves never render full-cell red "WALL" blocks
                    let cellBg = 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700';
                    if (isPlayer) {
                      cellBg =
                        'bg-[#1F1D2B] border-2 border-indigo-600 text-white z-20 shadow-[0_0_20px_rgba(79,70,229,0.35)]';
                    } else if (isGoal) {
                      cellBg = 'bg-[#E5E4EE] border-slate-300 text-slate-800';
                    } else if (keyItem && !isKeyCollected) {
                      cellBg = 'bg-amber-50/70 border-slate-200 text-amber-900';
                    } else if (doorItem && !isDoorUnlocked) {
                      cellBg = 'bg-violet-100/80 border-violet-300 text-violet-900';
                    } else if (isOptimalHint) {
                      cellBg = 'bg-indigo-50 border-indigo-300 text-indigo-900';
                    } else if (isVisited) {
                      cellBg = 'bg-slate-50 border-slate-200 text-slate-600';
                    }

                    const roundedCorner =
                      r === 0 && c === 0
                        ? 'rounded-tl-[13px]'
                        : r === 0 && c === gridSize - 1
                        ? 'rounded-tr-[13px]'
                        : r === gridSize - 1 && c === 0
                        ? 'rounded-bl-[13px]'
                        : r === gridSize - 1 && c === gridSize - 1
                        ? 'rounded-br-[13px]'
                        : '';

                    const flashTop = r > 0 && isEdgeFlashing(r, c, r - 1, c);
                    const flashBottom = r < gridSize - 1 && isEdgeFlashing(r, c, r + 1, c);
                    const flashLeft = c > 0 && isEdgeFlashing(r, c, r, c - 1);
                    const flashRight = c < gridSize - 1 && isEdgeFlashing(r, c, r, c + 1);

                    const previewTop = r > 0 && isEdgePreviewVisible(r, c, r - 1, c);
                    const previewBottom = r < gridSize - 1 && isEdgePreviewVisible(r, c, r + 1, c);
                    const previewLeft = c > 0 && isEdgePreviewVisible(r, c, r, c - 1);
                    const previewRight = c < gridSize - 1 && isEdgePreviewVisible(r, c, r, c + 1);

                    const isCompactCell = gridSize >= 5;

                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`relative w-full h-full border border-slate-200/90 ${roundedCorner}`}
                      >
                        <button
                          type="button"
                          role="gridcell"
                          data-testid={`maze-cell-${r}-${c}`}
                          onClick={() => handleCellClick(r, c)}
                          disabled={stage !== 'playing'}
                          aria-label={`Row ${r + 1} Column ${c + 1}${
                            isPlayer
                              ? ', Player position'
                              : isGoal
                              ? ', Exit Portal'
                              : keyItem && !isKeyCollected
                              ? `, ${keyItem.label}`
                              : ''
                          }`}
                          className={`w-full h-full flex flex-col items-center justify-center text-[10px] font-mono select-none transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-600 ${cellBg} ${roundedCorner}`}
                        >
                          {/* Player Figure Avatar (Matching PDF Page 3) */}
                          {isPlayer && (
                            <svg
                              viewBox="0 0 44 52"
                              className={
                                isCompactCell
                                  ? 'w-5 h-6 sm:w-7 sm:h-8'
                                  : 'w-7 h-8 sm:w-9 sm:h-10'
                              }
                              aria-hidden="true"
                            >
                              {/* Golden Head */}
                              <circle cx="22" cy="11" r="6.5" fill="#FBBF24" />
                              {/* Arms & Torso */}
                              <path
                                d="M11 26 L22 19 L33 26"
                                fill="none"
                                stroke="#F59E0B"
                                strokeWidth="4.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <line
                                x1="22"
                                y1="19"
                                x2="22"
                                y2="32"
                                stroke="#F59E0B"
                                strokeWidth="4.8"
                                strokeLinecap="round"
                              />
                              {/* Legs */}
                              <path
                                d="M16 46 L20 31 L24 31 L28 46"
                                fill="none"
                                stroke="#818CF8"
                                strokeWidth="4.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}

                          {/* Golden Key SVG (Matching PDF Page 3) */}
                          {!isPlayer && keyItem && !isKeyCollected && (
                            <span className="inline-flex flex-col items-center justify-center">
                              <svg
                                viewBox="0 0 36 36"
                                className={
                                  isCompactCell
                                    ? 'w-5 h-5 sm:w-7 sm:h-7'
                                    : 'w-7 h-7 sm:w-8 sm:h-8'
                                }
                                aria-hidden="true"
                              >
                                <circle
                                  cx="24"
                                  cy="12"
                                  r="6.5"
                                  fill="#FBBF24"
                                  stroke="#D97706"
                                  strokeWidth="2"
                                />
                                <circle cx="24" cy="12" r="2.2" fill="#FFFFFF" />
                                <path
                                  d="M19 17 L8 28 M11 25 L14 28 M14 22 L17 25"
                                  stroke="#D97706"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                />
                              </svg>
                              {puzzle.keysOrder.length > 1 && (
                                <span className="text-[8px] sm:text-[9px] font-extrabold text-amber-800 -mt-1">
                                  {keyItem.label.replace('Key ', 'K-')}
                                </span>
                              )}
                            </span>
                          )}

                          {/* Locked Intermediate Gate */}
                          {!isPlayer && doorItem && !isDoorUnlocked && (
                            <span className="inline-flex flex-col items-center font-bold text-violet-800">
                              <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-600" />
                              <span className="text-[8px] sm:text-[9px]">GATE</span>
                            </span>
                          )}

                          {/* One-Way Turnstile Arrow */}
                          {!isPlayer && oneWay && (
                            <span className="text-xs font-extrabold text-indigo-700">{oneWay.label}</span>
                          )}

                          {/* Exit Wooden Door SVG (Matching PDF Page 3) */}
                          {!isPlayer && isGoal && (
                            <span className="inline-flex flex-col items-center justify-center">
                              <svg
                                viewBox="0 0 36 44"
                                className={
                                  isCompactCell
                                    ? 'w-5 h-6 sm:w-7 sm:h-8'
                                    : 'w-7 h-8 sm:w-8 sm:h-9'
                                }
                                aria-hidden="true"
                              >
                                <rect
                                  x="7"
                                  y="4"
                                  width="22"
                                  height="36"
                                  rx="2"
                                  fill="#D6BFA9"
                                  stroke="#A68A71"
                                  strokeWidth="2"
                                />
                                <rect
                                  x="11"
                                  y="8"
                                  width="14"
                                  height="11"
                                  fill="#C8AD93"
                                  stroke="#A68A71"
                                  strokeWidth="1.2"
                                />
                                <rect
                                  x="11"
                                  y="23"
                                  width="14"
                                  height="12"
                                  fill="#C8AD93"
                                  stroke="#A68A71"
                                  strokeWidth="1.2"
                                />
                                <circle cx="24" cy="22" r="1.6" fill="#785A40" />
                              </svg>
                            </span>
                          )}

                          {!isPlayer && isDecoy && (
                            <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold">DECOY</span>
                          )}

                          {!isPlayer &&
                            !isGoal &&
                            !(keyItem && !isKeyCollected) &&
                            !(doorItem && !isDoorUnlocked) &&
                            isStart && (
                              <span className="text-[8px] sm:text-[9px] text-slate-400 font-semibold">START</span>
                            )}
                        </button>

                        {/* Edge-Based Wall Overlays: Hidden by default, flash high-contrast red on collision for 360ms then fade */}
                        {(flashTop || previewTop) && (
                          <div
                            data-testid={`wall-edge-top-${r}-${c}`}
                            className={`pointer-events-none absolute -top-[3px] left-0 right-0 h-[6px] z-30 rounded-full transition-opacity duration-200 ${
                              flashTop
                                ? 'bg-red-600 shadow-[0_0_14px_#EF4444]'
                                : 'bg-red-500/75'
                            }`}
                          />
                        )}
                        {(flashBottom || previewBottom) && (
                          <div
                            data-testid={`wall-edge-bottom-${r}-${c}`}
                            className={`pointer-events-none absolute -bottom-[3px] left-0 right-0 h-[6px] z-30 rounded-full transition-opacity duration-200 ${
                              flashBottom
                                ? 'bg-red-600 shadow-[0_0_14px_#EF4444]'
                                : 'bg-red-500/75'
                            }`}
                          />
                        )}
                        {(flashLeft || previewLeft) && (
                          <div
                            data-testid={`wall-edge-left-${r}-${c}`}
                            className={`pointer-events-none absolute -left-[3px] top-0 bottom-0 w-[6px] z-30 rounded-full transition-opacity duration-200 ${
                              flashLeft
                                ? 'bg-red-600 shadow-[0_0_14px_#EF4444]'
                                : 'bg-red-500/75'
                            }`}
                          />
                        )}
                        {(flashRight || previewRight) && (
                          <div
                            data-testid={`wall-edge-right-${r}-${c}`}
                            className={`pointer-events-none absolute -right-[3px] top-0 bottom-0 w-[6px] z-30 rounded-full transition-opacity duration-200 ${
                              flashRight
                                ? 'bg-red-600 shadow-[0_0_14px_#EF4444]'
                                : 'bg-red-500/75'
                            }`}
                          />
                        )}

                        {/* On-Square Edge Arrow Buttons on the Dark Player Cell (Matching PDF Page 3) */}
                        {isPlayer && stage === 'playing' && (
                          <>
                            {r > 0 && (
                              <button
                                type="button"
                                aria-label="Step Up"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMove('up');
                                }}
                                className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#373547] hover:bg-indigo-600 text-white shadow-md border border-white/20 flex items-center justify-center cursor-pointer"
                              >
                                <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              </button>
                            )}
                            {r < gridSize - 1 && (
                              <button
                                type="button"
                                aria-label="Step Down"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMove('down');
                                }}
                                className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-30 w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#373547] hover:bg-indigo-600 text-white shadow-md border border-white/20 flex items-center justify-center cursor-pointer"
                              >
                                <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              </button>
                            )}
                            {c > 0 && (
                              <button
                                type="button"
                                aria-label="Step Left"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMove('left');
                                }}
                                className="absolute -left-3 top-1/2 -translate-y-1/2 z-30 w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#373547] hover:bg-indigo-600 text-white shadow-md border border-white/20 flex items-center justify-center cursor-pointer"
                              >
                                <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              </button>
                            )}
                            {c < gridSize - 1 && (
                              <button
                                type="button"
                                aria-label="Step Right"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMove('right');
                                }}
                                className="absolute -right-3 top-1/2 -translate-y-1/2 z-30 w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#373547] hover:bg-indigo-600 text-white shadow-md border border-white/20 flex items-center justify-center cursor-pointer"
                              >
                                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Bottom Status & Action Bar (Matching PDF Page 3) */}
            <div className="w-full max-w-[460px] mt-4 sm:mt-5 pt-4 border-t border-slate-300 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
                {/* Circular Timer Ring */}
                <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 56 56" className="w-12 h-12 sm:w-14 sm:h-14 -rotate-90" aria-hidden="true">
                    <circle
                      cx="28"
                      cy="28"
                      r={ringRadius}
                      fill="none"
                      stroke="#CBD5E1"
                      strokeWidth="4.5"
                    />
                    <circle
                      cx="28"
                      cy="28"
                      r={ringRadius}
                      fill="none"
                      stroke={remainingSeconds <= 6 ? '#E11D48' : '#1E293B'}
                      strokeWidth="4.5"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringDashOffset}
                    />
                  </svg>
                  <span className="absolute font-mono text-xs font-extrabold text-slate-900 tabular-nums">
                    {formatSecondsMMSS(remainingSeconds)}
                  </span>
                </div>

                <div className="text-xs sm:text-sm text-slate-800 flex-1 min-w-[140px]">
                  Collect{' '}
                  <strong className="font-extrabold">
                    {puzzle.keysOrder.length} {puzzle.keysOrder.length === 1 ? 'KEY' : 'KEYS'}
                  </strong>{' '}
                  then get to the <strong className="font-extrabold">DOOR</strong>
                </div>

                <div className="flex items-center gap-3 text-xs sm:text-sm font-mono text-slate-800">
                  <span>
                    Attempts: <strong className="font-extrabold">{puzzleState.mistakesCount}</strong>
                  </span>
                  <span>
                    Keys:{' '}
                    <strong className="font-extrabold">
                      {puzzleState.collectedKeyIds.length} / {puzzle.keysOrder.length}
                    </strong>
                  </span>
                </div>
              </div>

              <p className="text-center text-xs text-slate-600">
                Go! Use the arrows on the dark square, or your keyboard.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={handleResetPosition}
                  className="px-4 py-2 min-h-[40px] rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 hover:bg-slate-100 shadow-xs cursor-pointer"
                >
                  Restart this maze
                </button>
                <button
                  type="button"
                  onClick={() => setSeed(createDeterministicSeed('MM'))}
                  className="px-4 py-2 min-h-[40px] rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 hover:bg-slate-100 shadow-xs cursor-pointer"
                >
                  New maze
                </button>
              </div>

              {!isExamMode && (
                <label className="flex items-center justify-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={challengeMode === 'flash-pattern-recall'}
                    onChange={(e) =>
                      setChallengeMode(
                        e.target.checked ? 'flash-pattern-recall' : 'hidden-barrier-discovery'
                      )
                    }
                    className="h-4 w-4 rounded accent-indigo-600 shrink-0"
                  />
                  <span>Beginner mode: show the walls briefly before navigation starts</span>
                </label>
              )}
            </div>
          </div>

          {/* Right Column: Telemetry & Tactile D-Pad */}
          <div className="lg:col-span-5 space-y-4 w-full">
            <div className="rounded-2xl bg-[#0E152B] text-slate-100 border border-slate-800 p-4 space-y-2.5 shadow-lg">
              <div className="text-xs font-bold text-white">{metadata.promptText}</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Invisible walls sit along cell borders. Hitting any wall edge flashes it red briefly
                and resets you to Start!
              </p>

              <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-[#070B19] border border-slate-800">
                  <div className="text-[10px] text-slate-400">KEYS COLLECTED</div>
                  <div className="text-sm font-bold text-amber-300">
                    {puzzleState.collectedKeyIds.length} / {puzzle.keysOrder.length}
                  </div>
                  {puzzle.keysOrder.length > 0 && (
                    <div className="text-[10px] text-slate-400 mt-0.5 break-words">
                      Order: {puzzle.keysOrder.map((k) => k.label).join(' → ')}
                    </div>
                  )}
                </div>

                <div className="p-2.5 rounded-xl bg-[#070B19] border border-slate-800">
                  <div className="text-[10px] text-slate-400">MOVES / OPTIMAL</div>
                  <div className="text-sm font-bold text-cyan-300">
                    {puzzleState.movesCount} / {puzzle.optimalMoveCount}
                    {puzzle.moveBudget ? ` (Cap ${puzzle.moveBudget})` : ''}
                  </div>
                  <div className="text-[10px] text-rose-300 mt-0.5">
                    Wall Collisions: {puzzleState.mistakesCount}
                  </div>
                </div>
              </div>
            </div>

            {/* Tactile Directional Pad (Preserving exact aria-labels & data-testids) */}
            <div className="rounded-2xl bg-[#0E152B] text-slate-100 border border-slate-800 p-4 space-y-2 shadow-lg">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-bold text-white">Directional Controls</span>
                <span className="font-mono text-[11px] text-violet-300">WASD / Arrows / Tap</span>
              </div>

              <div className="grid grid-cols-3 gap-2 max-w-[204px] mx-auto pt-1">
                <div />
                <button
                  type="button"
                  data-testid="maze-move-up"
                  aria-label="Move Up"
                  onClick={() => handleMove('up')}
                  disabled={stage !== 'playing'}
                  className="h-12 sm:h-11 rounded-xl bg-[#151F3D] border border-slate-700 hover:border-violet-400 flex items-center justify-center text-white active:scale-95 cursor-pointer"
                >
                  <ArrowUp className="w-5 h-5" />
                </button>
                <div />

                <button
                  type="button"
                  data-testid="maze-move-left"
                  aria-label="Move Left"
                  onClick={() => handleMove('left')}
                  disabled={stage !== 'playing'}
                  className="h-12 sm:h-11 rounded-xl bg-[#151F3D] border border-slate-700 hover:border-violet-400 flex items-center justify-center text-white active:scale-95 cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  data-testid="maze-move-down"
                  aria-label="Move Down"
                  onClick={() => handleMove('down')}
                  disabled={stage !== 'playing'}
                  className="h-12 sm:h-11 rounded-xl bg-[#151F3D] border border-slate-700 hover:border-violet-400 flex items-center justify-center text-white active:scale-95 cursor-pointer"
                >
                  <ArrowDown className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  data-testid="maze-move-right"
                  aria-label="Move Right"
                  onClick={() => handleMove('right')}
                  disabled={stage !== 'playing'}
                  className="h-12 sm:h-11 rounded-xl bg-[#151F3D] border border-slate-700 hover:border-violet-400 flex items-center justify-center text-white active:scale-95 cursor-pointer"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <TimerBar
              remainingSeconds={remainingSeconds}
              totalSeconds={metadata.timeLimitSeconds}
              visible={settings.showTimerCountdown}
              label="Maze Countdown"
            />

            <FeedbackBanner message={puzzleState.lastFeedback} tone={feedbackTone} />
          </div>
        </div>
      </section>
    </div>
  );
};
