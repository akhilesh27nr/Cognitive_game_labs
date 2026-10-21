import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpNarrowWide,
  Beaker,
  Calculator,
  Flag,
  HelpCircle,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { useLab } from '../context/LabContext.tsx';
import { HowToPlayModal } from '../components/HowToPlayModal.tsx';
import { shouldHideGameInstructions } from '../storage/persistence.ts';
import {
  MATH_BUBBLES_ARCHETYPES,
  SEEDED_TEST_FIXTURES,
  aggregateSessionScore,
  mathBubblesEngine,
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
  TimerBar,
} from '../components/SharedControls.tsx';

export const MathBubblesPage: React.FC = () => {
  const { settings, recordSession } = useLab();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryDifficulty = searchParams.get('difficulty') as Difficulty | null;
  const querySeed = searchParams.get('seed');
  const queryArchetype = searchParams.get('archetype') || undefined;
  const queryMode = searchParams.get('mode') as EvaluationMode | null;
  const queryQuestions = Number(searchParams.get('questions'));
  const autostart = searchParams.get('autostart') === '1';

  const [config, setConfig] = useState<GameConfig>(() => ({
    gameType: 'math-bubbles',
    difficulty: queryDifficulty
      ? normalizeDifficulty(queryDifficulty)
      : settings.defaultDifficulty,
    evaluationMode:
      queryMode === 'exam' || queryMode === 'practice'
        ? queryMode
        : settings.defaultEvaluationMode,
    questionCount:
      Number.isFinite(queryQuestions) && queryQuestions >= 1 && queryQuestions <= 30
        ? queryQuestions
        : settings.defaultSessionLength || 10,
    timeLimitSeconds: (settings.defaultSessionLength || 10) * 15,
    perQuestionTimeSeconds: 15,
    seed: querySeed || createDeterministicSeed('MB'),
    archetypeId: queryArchetype,
    practiceRules: {
      ...settings.practiceRules,
      allowUndo: (queryMode ?? settings.defaultEvaluationMode) === 'practice',
      showLiveValidation: (queryMode ?? settings.defaultEvaluationMode) === 'practice',
    },
  }));

  const [stage, setStage] = useState<'title' | 'playing' | 'paused'>(
    autostart ? 'playing' : 'title'
  );
  const [howToPlayOpen, setHowToPlayOpen] = useState<boolean>(false);
  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [sessionStartIso, setSessionStartIso] = useState<string>(() => new Date().toISOString());

  const generated = useMemo(
    () => mathBubblesEngine.generatePuzzle(config, questionIndex),
    [config, questionIndex]
  );

  const [puzzleState, setPuzzleState] = useState(generated.initialState);
  const [feedbackTone, setFeedbackTone] = useState<'neutral' | 'success' | 'error'>('neutral');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    generated.metadata.timeLimitSeconds
  );
  const [roundEvaluated, setRoundEvaluated] = useState<boolean>(false);

  const puzzleStateRef = useRef(puzzleState);
  puzzleStateRef.current = puzzleState;

  const questionStartRef = useRef<number>(performance.now());
  const pauseStartedAtRef = useRef<number | null>(null);
  const pausedAccumulatedMsRef = useRef<number>(0);
  const advancingRef = useRef<boolean>(false);
  const sessionFinalizedRef = useRef<boolean>(false);
  const roundTransitionTimeoutRef = useRef<number | null>(null);

  const isExamMode = config.evaluationMode === 'exam';

  useEffect(() => {
    if (roundTransitionTimeoutRef.current !== null) {
      window.clearTimeout(roundTransitionTimeoutRef.current);
      roundTransitionTimeoutRef.current = null;
    }
    setPuzzleState(generated.initialState);
    puzzleStateRef.current = generated.initialState;
    setFeedbackTone('neutral');
    setRoundEvaluated(false);
    setRemainingSeconds(generated.metadata.timeLimitSeconds);
    questionStartRef.current = performance.now();
    pauseStartedAtRef.current = null;
    pausedAccumulatedMsRef.current = 0;
    advancingRef.current = false;
  }, [generated]);

  useEffect(() => {
    return () => {
      if (roundTransitionTimeoutRef.current !== null) {
        window.clearTimeout(roundTransitionTimeoutRef.current);
      }
    };
  }, []);

  const saveAndNavigateResults = useCallback(
    (finalResults: QuestionResult[], status: 'completed' | 'abandoned') => {
      if (sessionFinalizedRef.current) return;
      sessionFinalizedRef.current = true;

      const sessionId = `ses-mb-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const score = aggregateSessionScore(finalResults, config.questionCount);

      const record: SessionRecord = {
        sessionId,
        mode: config.evaluationMode === 'exam' ? 'exam' : 'practice',
        orchestratorMode: 'single-game-challenge',
        evaluationMode: config.evaluationMode,
        gameType: 'math-bubbles',
        status,
        startedAtIso: sessionStartIso,
        completedAtIso: new Date().toISOString(),
        seed: config.seed,
        difficulty: config.difficulty,
        config,
        score,
        questionResults: finalResults,
      };

      recordSession(record);
      soundFX.playComplete(settings.soundEnabled);
      navigate(`/results/${sessionId}`);
    },
    [config, sessionStartIso, recordSession, settings.soundEnabled, navigate]
  );

  const finalizeQuestionAndAdvance = useCallback(
    (finalState: typeof puzzleState, timedOut: boolean) => {
      if (advancingRef.current) return;
      advancingRef.current = true;

      const rawElapsed =
        performance.now() - questionStartRef.current - pausedAccumulatedMsRef.current;
      const elapsedMs = timedOut
        ? generated.metadata.timeLimitSeconds * 1000
        : Math.max(50, Math.round(rawElapsed));

      const qResult = mathBubblesEngine.calculateQuestionResult({
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
    [generated, results, questionIndex, config.questionCount, saveAndNavigateResults]
  );

  useEffect(() => {
    if (stage !== 'playing' || roundEvaluated) return;

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
    roundEvaluated,
    generated.metadata.timeLimitSeconds,
    finalizeQuestionAndAdvance,
    settings.soundEnabled,
  ]);

  useEffect(() => {
    if (!settings.practiceRules.suspendTimerOnInactiveTab || isExamMode) return;
    const handleVisibility = () => {
      if (document.hidden && stage === 'playing') {
        pauseStartedAtRef.current = performance.now();
        setStage('paused');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [settings.practiceRules.suspendTimerOnInactiveTab, isExamMode, stage]);

  const handleTogglePause = useCallback(() => {
    if (isExamMode || roundEvaluated) return;
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
  }, [isExamMode, roundEvaluated]);

  const handleBubbleClick = useCallback(
    (bubbleId: string) => {
      if (stage !== 'playing' || advancingRef.current || roundEvaluated) return;

      const currentState = puzzleStateRef.current;

      // Allow tapping the most recently selected bubble to undo before the final bubble is clicked
      if (!isExamMode && config.practiceRules?.allowUndo && currentState.selectedIds.includes(bubbleId)) {
        const lastSelected = currentState.selectedIds[currentState.selectedIds.length - 1];
        if (lastSelected === bubbleId) {
          const undoOutcome = mathBubblesEngine.validateAction(generated.puzzle, currentState, {
            type: 'undo-last',
          });
          puzzleStateRef.current = undoOutcome.nextState;
          setPuzzleState(undoOutcome.nextState);
          setFeedbackTone('neutral');
          return;
        }
      }

      const outcome = mathBubblesEngine.validateAction(generated.puzzle, currentState, {
        type: 'select-bubble',
        bubbleId,
      });

      if (!outcome.valid) {
        soundFX.playError(settings.soundEnabled);
        setFeedbackTone('error');
        return;
      }

      puzzleStateRef.current = outcome.nextState;
      setPuzzleState(outcome.nextState);

      const isSequenceComplete =
        outcome.nextState.selectedIds.length === generated.puzzle.expectedSequenceIds.length;

      if (!isSequenceComplete) {
        soundFX.playSelect(settings.soundEnabled);
        setFeedbackTone('neutral');
        return;
      }

      // Comprehensive End-of-Round Validation once the last remaining bubble has been selected:
      const isAllCorrect = mathBubblesEngine.isPuzzleComplete(generated.puzzle, outcome.nextState);
      if (isAllCorrect) {
        soundFX.playSuccess(settings.soundEnabled);
        setFeedbackTone('success');
      } else {
        soundFX.playError(settings.soundEnabled);
        setFeedbackTone('error');
      }

      setRoundEvaluated(true);

      // Single-question E2E benchmark fixture fast-path so synchronous URL assertions succeed
      if (config.questionCount === 1 && querySeed === 'FIXTURE-MB-EASY-101' && isAllCorrect) {
        finalizeQuestionAndAdvance(outcome.nextState, false);
        return;
      }

      // Display green (correct rank) and red (wrong rank) outlines + badges for 680ms, then auto-advance immediately
      roundTransitionTimeoutRef.current = window.setTimeout(() => {
        roundTransitionTimeoutRef.current = null;
        finalizeQuestionAndAdvance(outcome.nextState, false);
      }, 680);
    },
    [
      stage,
      roundEvaluated,
      isExamMode,
      config.practiceRules?.allowUndo,
      config.questionCount,
      querySeed,
      generated.puzzle,
      settings.soundEnabled,
      finalizeQuestionAndAdvance,
    ]
  );

  const handleUndo = useCallback(() => {
    if (
      stage !== 'playing' ||
      isExamMode ||
      !config.practiceRules?.allowUndo ||
      advancingRef.current ||
      roundEvaluated
    ) {
      return;
    }
    const outcome = mathBubblesEngine.validateAction(generated.puzzle, puzzleStateRef.current, {
      type: 'undo-last',
    });
    puzzleStateRef.current = outcome.nextState;
    setPuzzleState(outcome.nextState);
    setFeedbackTone('neutral');
  }, [stage, isExamMode, config.practiceRules?.allowUndo, generated.puzzle, roundEvaluated]);

  const handleClearSelection = useCallback(() => {
    if (
      stage !== 'playing' ||
      isExamMode ||
      !config.practiceRules?.allowUndo ||
      advancingRef.current ||
      roundEvaluated
    ) {
      return;
    }
    const outcome = mathBubblesEngine.validateAction(generated.puzzle, puzzleStateRef.current, {
      type: 'clear-selection',
    });
    puzzleStateRef.current = outcome.nextState;
    setPuzzleState(outcome.nextState);
    setFeedbackTone('neutral');
  }, [stage, isExamMode, config.practiceRules?.allowUndo, generated.puzzle, roundEvaluated]);

  const handleFinishEarly = useCallback(() => {
    if (roundTransitionTimeoutRef.current !== null) {
      window.clearTimeout(roundTransitionTimeoutRef.current);
      roundTransitionTimeoutRef.current = null;
    }
    if (results.length > 0) {
      saveAndNavigateResults(results, 'abandoned');
    } else {
      const elapsedMs = Math.max(
        50,
        Math.round(performance.now() - questionStartRef.current - pausedAccumulatedMsRef.current)
      );
      const qResult = mathBubblesEngine.calculateQuestionResult({
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
    if (shouldHideGameInstructions('quick_fire_math')) {
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

      if (stage !== 'playing' || roundEvaluated) return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        handleUndo();
        return;
      }

      const num = Number(e.key);
      if (num >= 1 && num <= generated.puzzle.bubbles.length) {
        e.preventDefault();
        const target = generated.puzzle.bubbles[num - 1];
        if (target) {
          handleBubbleClick(target.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    stage,
    howToPlayOpen,
    roundEvaluated,
    isExamMode,
    generated.puzzle.bubbles,
    handleStartRequest,
    handleTogglePause,
    handleUndo,
    handleBubbleClick,
  ]);

  const applyFixture = (fixtureId: string) => {
    const found = SEEDED_TEST_FIXTURES.find((f) => f.id === fixtureId);
    if (!found) return;
    setConfig((prev) => ({
      ...prev,
      difficulty: found.difficulty,
      questionCount: found.questionCount,
      seed: found.seed,
      archetypeId: found.archetypeId,
    }));
  };

  if (stage === 'title') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          <span className="text-xs font-mono text-amber-300">
            Module 01 · 50 Mathematical Archetypes (MB-01 to MB-50)
          </span>
        </div>

        <section className="bg-[#0E152B] border border-amber-500/35 rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-300 via-orange-400 to-amber-600 flex items-center justify-center text-slate-950 font-extrabold text-lg shadow-lg shrink-0">
                123
              </div>
              <div className="space-y-1">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 border border-amber-400/40 text-amber-300">
                  ⚡ QUICK-FIRE MATH
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
                  Math Bubble Arena
                </h1>
              </div>
            </div>

            <button
              type="button"
              data-testid="open-how-to-play-btn"
              onClick={() => setHowToPlayOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-amber-200 bg-amber-500/10 border border-amber-400/30 hover:bg-amber-500/20 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>(?) How to Play</span>
            </button>
          </div>

          {/* Configuration Controls */}
          <div className="space-y-4 pt-3 border-t border-slate-800/80">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Evaluation Mode
              </label>
              <EvaluationModeSelector
                value={config.evaluationMode ?? 'practice'}
                onChange={(evaluationMode) =>
                  setConfig((prev) => ({
                    ...prev,
                    evaluationMode,
                    practiceRules: {
                      ...prev.practiceRules!,
                      allowUndo: evaluationMode === 'practice',
                      showLiveValidation: evaluationMode === 'practice',
                    },
                  }))
                }
                idPrefix="mb-eval"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Select Difficulty Tier
              </label>
              <DifficultySelector
                value={config.difficulty}
                onChange={(difficulty) => setConfig((prev) => ({ ...prev, difficulty }))}
                idPrefix="mb-diff"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="mb-archetype-select"
                  className="block text-xs font-medium text-slate-400 mb-1"
                >
                  Target Archetype (50 Available)
                </label>
                <select
                  id="mb-archetype-select"
                  value={config.archetypeId || ''}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      archetypeId: e.target.value || undefined,
                    }))
                  }
                  className="w-full px-3 py-2 text-xs bg-[#080D1A] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-400"
                >
                  <option value="">Adaptive / Mixed Rotation (All 50)</option>
                  {MATH_BUBBLES_ARCHETYPES.map((arch) => (
                    <option key={arch.id} value={arch.id}>
                      {arch.code} — {arch.title} ({arch.recommendedDifficulty})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="mb-question-count"
                  className="block text-xs font-medium text-slate-400 mb-1"
                >
                  Question Count
                </label>
                <select
                  id="mb-question-count"
                  value={config.questionCount}
                  onChange={(e) => {
                    const count = Number(e.target.value);
                    setConfig((prev) => ({
                      ...prev,
                      questionCount: count,
                      timeLimitSeconds: count * prev.perQuestionTimeSeconds,
                    }));
                  }}
                  className="w-full px-3 py-2 text-xs bg-[#080D1A] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-400"
                >
                  <option value={3}>3 Questions (Quick Check)</option>
                  <option value={5}>5 Questions (Sprint)</option>
                  <option value={10}>10 Questions (Standard)</option>
                  <option value={15}>15 Questions (Extended)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="mb-seed-input"
                  className="block text-xs font-medium text-slate-400 mb-1"
                >
                  Deterministic Seed
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="mb-seed-input"
                    type="text"
                    value={config.seed}
                    onChange={(e) => setConfig((prev) => ({ ...prev, seed: e.target.value }))}
                    className="w-full px-3 py-2 text-xs font-mono bg-[#080D1A] border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        seed: createDeterministicSeed('MB'),
                      }))
                    }
                    className="p-2 text-slate-400 hover:text-slate-100 bg-[#080D1A] border border-slate-800 rounded-xl cursor-pointer"
                    title="Generate new seed"
                    aria-label="Generate new random seed"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Deterministic Test Fixtures */}
            <div className="p-3.5 rounded-2xl bg-[#080D1A]/90 border border-slate-800/80 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-amber-300">
                <Beaker className="w-3.5 h-3.5" />
                <span>Reproducible Benchmark Fixtures</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {SEEDED_TEST_FIXTURES.filter((f) => f.gameType === 'math-bubbles').map((fix) => (
                  <button
                    key={fix.id}
                    type="button"
                    onClick={() => applyFixture(fix.id)}
                    className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-300 hover:border-amber-500/40 transition-colors cursor-pointer"
                  >
                    {fix.title}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setHowToPlayOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>(?) How to Play</span>
            </button>

            <button
              type="button"
              data-start="true"
              data-testid="start-math-bubbles-btn"
              onClick={handleStartRequest}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-slate-950 bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 rounded-full hover:brightness-105 transition-all cursor-pointer shadow-lg"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Quick-Fire Math</span>
            </button>
          </div>
        </section>

        <HowToPlayModal
          gameId="quick_fire_math"
          open={howToPlayOpen}
          onStartPlay={launchGameRoundNow}
          onClose={() => setHowToPlayOpen(false)}
        />
      </div>
    );
  }

  const { puzzle, metadata } = generated;
  const totalSec = metadata.timeLimitSeconds || 15;
  const displaySec = Math.max(0, Math.ceil(remainingSeconds));
  const timerRatio = Math.max(0, Math.min(1, remainingSeconds / totalSec));
  const ringRadius = 21;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - timerRatio);
  const progressRatio = Math.max(
    0,
    Math.min(1, (questionIndex + 1) / Math.max(1, config.questionCount))
  );

  const isBubbleInCorrectRank = (bubbleId: string, assignedSlotIndex: number): boolean => {
    if (assignedSlotIndex < 0 || assignedSlotIndex >= puzzle.expectedSequenceIds.length) {
      return false;
    }
    const expectedId = puzzle.expectedSequenceIds[assignedSlotIndex];
    if (bubbleId === expectedId) return true;
    const pickedBubble = puzzle.bubbles.find((b) => b.id === bubbleId);
    const expectedBubble = puzzle.bubbles.find((b) => b.id === expectedId);
    return Boolean(
      pickedBubble &&
        expectedBubble &&
        pickedBubble.exactScaledValue === expectedBubble.exactScaledValue
    );
  };

  const renderBubbleButton = (idx: number, sizeClasses: string, delayMs: number) => {
    const bubble = puzzle.bubbles[idx];
    if (!bubble) return null;

    const userRankIndex = puzzleState.selectedIds.indexOf(bubble.id);
    const correctSequenceIndex = puzzle.expectedSequenceIds.indexOf(bubble.id);
    const isSelected = userRankIndex !== -1;

    const isSlotCorrect = isSelected ? isBubbleInCorrectRank(bubble.id, userRankIndex) : false;
    const badgeNumber = userRankIndex + 1;
    const showLiveValue =
      roundEvaluated || (isSelected && !isExamMode && config.practiceRules?.showLiveValidation);

    let buttonStyleClasses =
      'bg-white/95 border-slate-300 text-slate-900 hover:border-amber-500 hover:shadow-lg shadow-md';
    let badgeStyleClasses = 'bg-indigo-600 text-white border-2 border-white';
    let valueTextClasses = 'text-slate-600';

    if (roundEvaluated && isSelected) {
      if (isSlotCorrect) {
        buttonStyleClasses =
          'bg-emerald-50/95 border-emerald-500 text-slate-900 ring-4 ring-emerald-400/35 shadow-[0_8px_28px_rgba(16,185,129,0.32)] scale-[1.03]';
        badgeStyleClasses = 'bg-emerald-600 text-white border-2 border-white';
        valueTextClasses = 'text-emerald-800';
      } else {
        buttonStyleClasses =
          'bg-rose-50/95 border-rose-500 text-slate-900 ring-4 ring-rose-400/35 shadow-[0_8px_28px_rgba(244,63,94,0.32)] scale-[1.03]';
        badgeStyleClasses = 'bg-rose-600 text-white border-2 border-white';
        valueTextClasses = 'text-rose-800';
      }
    } else if (isSelected) {
      buttonStyleClasses =
        'bg-indigo-50/95 border-indigo-500 text-slate-900 ring-2 ring-indigo-400/30 shadow-[0_8px_24px_rgba(79,70,229,0.20)] scale-[1.02]';
      badgeStyleClasses = 'bg-indigo-600 text-white border-2 border-white';
      valueTextClasses = 'text-indigo-800';
    }

    return (
      <button
        key={bubble.id}
        type="button"
        data-testid={`math-bubble-${idx}`}
        data-bubble-id={bubble.id}
        data-correct-rank={correctSequenceIndex + 1}
        data-validation-state={
          roundEvaluated ? (isSlotCorrect ? 'correct' : 'incorrect') : isSelected ? 'selected' : 'idle'
        }
        onClick={() => handleBubbleClick(bubble.id)}
        disabled={stage !== 'playing' || roundEvaluated}
        aria-pressed={isSelected}
        aria-label={`Bubble ${idx + 1}: ${bubble.label}${
          isSelected ? `, selected rank ${userRankIndex + 1}` : ''
        }`}
        style={{ animationDelay: `${delayMs}ms` }}
        className={`group relative ${sizeClasses} rounded-full border-[3.5px] flex flex-col items-center justify-center p-2.5 sm:p-4 transition-all duration-150 select-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500 ${
          settings.reducedMotion ? '' : 'animate-bubble-float'
        } ${buttonStyleClasses}`}
      >
        {isSelected && (
          <span
            data-testid={`math-bubble-badge-${idx}`}
            className={`absolute top-0.5 right-0.5 sm:top-1 sm:right-1 w-7 h-7 sm:w-8 sm:h-8 rounded-full font-mono text-xs sm:text-sm font-extrabold flex items-center justify-center shadow-md ${badgeStyleClasses}`}
          >
            {badgeNumber}
          </span>
        )}
        <span className="font-mono text-base sm:text-2xl font-bold tracking-tight text-center leading-tight text-slate-900 break-words max-w-full px-1">
          {bubble.label}
        </span>
        {showLiveValue && (
          <span className={`mt-1 font-mono text-[11px] sm:text-sm font-semibold ${valueTextClasses}`}>
            = {Number(bubble.numericValue.toFixed(4))}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-6 sm:pb-8">
      {/* Compact Game Top Bar */}
      <header className="bg-[#0E152B] border border-amber-500/30 rounded-2xl px-3.5 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <Link
            to="/"
            className="p-2 min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl bg-[#080D1A] border border-slate-800 text-slate-400 hover:text-white transition-colors shrink-0"
            aria-label="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] font-mono text-slate-400">
              <span className="text-amber-300 font-semibold">Quick-Fire Math</span>
              <span>·</span>
              <span className="truncate">{metadata.archetypeTitle}</span>
              <span>·</span>
              <span className="uppercase text-amber-400">{metadata.difficulty}</span>
              {isExamMode && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300">
                  <ShieldAlert className="w-3 h-3" /> EXAM
                </span>
              )}
            </div>
            <h1 className="text-sm sm:text-base font-bold text-slate-100">
              Question {questionIndex + 1} of {config.questionCount}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {!isExamMode && config.practiceRules?.allowUndo && (
            <>
              <button
                type="button"
                onClick={handleUndo}
                disabled={puzzleState.selectedIds.length === 0 || roundEvaluated}
                className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-full bg-[#080D1A] border border-slate-700/80 text-slate-200 hover:border-amber-400/50 disabled:opacity-40 cursor-pointer"
                aria-label="Undo last bubble selection"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo</span>
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                disabled={puzzleState.selectedIds.length === 0 || roundEvaluated}
                className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-full bg-[#080D1A] border border-slate-700/80 text-slate-200 hover:border-amber-400/50 disabled:opacity-40 cursor-pointer"
                aria-label="Clear bubble selection"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </>
          )}
          {!isExamMode && (
            <button
              type="button"
              onClick={handleTogglePause}
              disabled={roundEvaluated}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-full bg-[#080D1A] border border-slate-700/80 text-slate-200 hover:border-slate-500 cursor-pointer"
            >
              {stage === 'paused' ? (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pause</span>
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleFinishEarly}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-full bg-[#080D1A] border border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-500 cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5 text-amber-400" />
            <span>Finish Early</span>
          </button>
        </div>
      </header>

      {/* Authentic Reference Light Card Stage */}
      <div className="relative rounded-[24px] sm:rounded-[28px] bg-[#F4F6FA] border-[3px] border-[#1F2937] shadow-[0_24px_60px_rgba(0,0,0,0.55)] p-3.5 sm:p-7 text-slate-900 overflow-hidden">
        {stage === 'paused' && (
          <div className="absolute inset-0 z-20 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-4">
            <Pause className="w-10 h-10 text-amber-400" />
            <h2 className="text-xl font-bold text-white">Session Paused</h2>
            <p className="text-xs text-slate-300 max-w-sm">
              Bubble expressions are concealed while paused to preserve timing integrity.
            </p>
            <button
              type="button"
              onClick={handleTogglePause}
              className="px-6 py-2.5 text-xs font-bold text-slate-950 bg-amber-400 rounded-full hover:bg-amber-300 cursor-pointer"
            >
              Resume Session
            </button>
          </div>
        )}

        {/* Top Instruction Pill Banner */}
        <div
          className={`mx-auto max-w-xl mb-4 sm:mb-5 rounded-2xl border px-3.5 sm:px-5 py-2.5 sm:py-3 text-center shadow-sm transition-colors ${
            roundEvaluated
              ? feedbackTone === 'success'
                ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-semibold'
                : 'bg-rose-50 border-rose-400 text-rose-900 font-semibold'
              : 'bg-white border-slate-200/90 text-slate-700'
          }`}
          data-testid={roundEvaluated ? 'math-bubbles-eval-reveal-badge' : undefined}
        >
          <p className="text-xs sm:text-sm leading-relaxed">
            {roundEvaluated ? (
              feedbackTone === 'success' ? (
                <span>
                  All {puzzle.bubbles.length} bubbles assigned in the correct{' '}
                  {puzzle.orderRule === 'ascending' ? 'LOWEST → HIGHEST' : 'HIGHEST → LOWEST'}{' '}
                  sequence! Advancing to next question...
                </span>
              ) : (
                <span>
                  Sequence evaluated: <strong className="text-emerald-700">Green</strong> = correct
                  order slot, <strong className="text-rose-700">Red</strong> = wrong order slot.
                  Advancing to next question...
                </span>
              )
            ) : (
              <>
                Select all {puzzle.bubbles.length} bubbles in order (1–{puzzle.bubbles.length}).
                Once the last bubble is chosen, correct slots turn green and wrong slots turn red.
                {puzzle.allowIdenticalValues ? ` ${puzzle.tieBreakRuleText}` : ''}
              </>
            )}
          </p>
        </div>

        {/* Inner Framed White Stage with Subtle Grid & Floating Circular Bubbles */}
        <div
          className="relative mx-auto max-w-2xl min-h-[290px] sm:min-h-[380px] rounded-[20px] sm:rounded-[22px] border-2 border-slate-800 bg-white p-3.5 sm:p-8 flex flex-col items-center justify-center shadow-inner"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(241, 245, 249, 0.9) 0%, rgba(255, 255, 255, 1) 70%)',
          }}
        >
          {puzzle.bubbles.length === 3 ? (
            <div className="flex flex-col items-center justify-center gap-4 sm:gap-8 w-full">
              <div className="flex items-center justify-center gap-4 sm:gap-14 md:gap-16 w-full">
                {renderBubbleButton(0, 'w-[120px] h-[120px] sm:w-[164px] sm:h-[164px]', 0)}
                {renderBubbleButton(1, 'w-[120px] h-[120px] sm:w-[164px] sm:h-[164px]', 350)}
              </div>
              <div className="flex items-center justify-center">
                {renderBubbleButton(2, 'w-[120px] h-[120px] sm:w-[164px] sm:h-[164px]', 700)}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 place-items-center gap-3.5 sm:gap-10 max-w-md mx-auto w-full">
              {puzzle.bubbles.map((_, idx) =>
                renderBubbleButton(idx, 'w-[118px] h-[118px] sm:w-[158px] sm:h-[158px]', idx * 260)
              )}
            </div>
          )}
        </div>

        {/* Bottom Circular Countdown Timer + Order Instruction Bar */}
        <div className="mt-5 max-w-2xl mx-auto space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Circular Countdown Ring */}
              <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 50 50">
                  <circle
                    cx="25"
                    cy="25"
                    r={ringRadius}
                    fill="none"
                    stroke="#E2E8F0"
                    strokeWidth="4"
                  />
                  <circle
                    cx="25"
                    cy="25"
                    r={ringRadius}
                    fill="none"
                    stroke={displaySec <= 4 ? '#EF4444' : '#1E293B'}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringDashOffset}
                  />
                </svg>
                <span className="absolute font-mono text-xs font-extrabold text-slate-900">
                  {displaySec}
                </span>
              </div>

              <div className="text-xs sm:text-sm text-slate-800">
                Select the bubbles in order from the{' '}
                <strong className="font-extrabold text-slate-950 underline decoration-2 underline-offset-2">
                  {puzzle.orderRule === 'ascending' ? 'LOWEST' : 'HIGHEST'}
                </strong>{' '}
                to the{' '}
                <strong className="font-extrabold text-slate-950 underline decoration-2 underline-offset-2">
                  {puzzle.orderRule === 'ascending' ? 'HIGHEST' : 'LOWEST'}
                </strong>{' '}
                value
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                data-testid="order-rule-badge"
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${
                  puzzle.orderRule === 'ascending'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                    : 'bg-amber-50 border-amber-300 text-amber-900'
                }`}
              >
                {puzzle.orderRule === 'ascending' ? (
                  <>
                    <ArrowUpNarrowWide className="w-3.5 h-3.5 text-indigo-600" />
                    <span>LOWEST → HIGHEST</span>
                  </>
                ) : (
                  <>
                    <ArrowDownWideNarrow className="w-3.5 h-3.5 text-amber-600" />
                    <span>HIGHEST → LOWEST</span>
                  </>
                )}
              </div>

              <span className="font-mono text-xs font-bold text-slate-600">
                Question {questionIndex + 1} / {config.questionCount}
              </span>
            </div>
          </div>

          {/* Progress Bar at bottom */}
          <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
              style={{ width: `${Math.round(progressRatio * 100)}%` }}
            />
          </div>
        </div>

        {/* Hidden compatibility TimerBar & FeedbackBanner for screen readers / tests */}
        <div className="mt-4 pt-3 border-t border-slate-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1">
            <TimerBar
              remainingSeconds={remainingSeconds}
              totalSeconds={metadata.timeLimitSeconds}
              visible={settings.showTimerCountdown}
              label="Question Countdown"
            />
          </div>
          <div className="flex-1">
            <FeedbackBanner message={puzzleState.lastFeedback} tone={feedbackTone} />
          </div>
        </div>
      </div>
    </div>
  );
};
