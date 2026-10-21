import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpNarrowWide,
  Check,
  Clock,
  Flag,
  KeyRound,
  Layers,
  Lock,
  Play,
  Repeat,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { useLab } from '../context/LabContext.tsx';
import {
  aggregateSessionScore,
  clonePathFinderBoard,
  createScrambledPathFinderBoard,
  cyclePathFinderPieceArrows,
  evaluatePathFinderBoard,
  mathBubblesEngine,
  memoryMazeEngine,
  pathRotationEngine,
  swapPathFinderPieces,
  type MoveDirection,
  type PathFinderPiece,
} from '../engine/index.ts';
import {
  normalizeDifficulty,
  type ActiveAssessmentSnapshot,
  type AssessmentOrchestratorMode,
  type Difficulty,
  type EvaluationMode,
  type GameConfig,
  type GameType,
  type QuestionResult,
  type SessionRecord,
} from '../types/domain.ts';
import {
  loadActiveAssessmentSnapshot,
  saveActiveAssessmentSnapshot,
} from '../storage/persistence.ts';
import { createDeterministicSeed } from '../utils/prng.ts';
import { soundFX } from '../utils/sound.ts';
import {
  DifficultySelector,
  EvaluationModeSelector,
  FeedbackBanner,
  TimerBar,
} from '../components/SharedControls.tsx';
import { TileConduitSvg } from './PathRotationPage.tsx';

interface SequenceItem {
  globalIndex: number;
  stageNumber: number;
  gameType: GameType;
  stageQuestionIndex: number;
  uniqueInstanceKey: string;
}

function buildAssessmentSequence(
  orchestratorMode: AssessmentOrchestratorMode,
  gameOrder: GameType[],
  questionsPerGame: number
): SequenceItem[] {
  const items: SequenceItem[] = [];
  let globalIndex = 0;

  if (orchestratorMode === 'mixed-practice') {
    for (let q = 0; q < questionsPerGame; q++) {
      gameOrder.forEach((gt, stageIdx) => {
        items.push({
          globalIndex,
          stageNumber: stageIdx + 1,
          gameType: gt,
          stageQuestionIndex: q,
          uniqueInstanceKey: `${gt}-${q}-${globalIndex}`,
        });
        globalIndex += 1;
      });
    }
    return items;
  }

  gameOrder.forEach((gt, stageIdx) => {
    for (let q = 0; q < questionsPerGame; q++) {
      items.push({
        globalIndex,
        stageNumber: stageIdx + 1,
        gameType: gt,
        stageQuestionIndex: q,
        uniqueInstanceKey: `${gt}-${q}-${globalIndex}`,
      });
      globalIndex += 1;
    }
  });

  return items;
}

export const AssessmentPage: React.FC = () => {
  const { settings, recordSession } = useLab();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const querySeed = searchParams.get('seed');
  const autostart = searchParams.get('autostart') === '1';

  const [orchestratorMode, setOrchestratorMode] =
    useState<AssessmentOrchestratorMode>('full-timed-assessment');
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>(
    settings.defaultEvaluationMode
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(settings.defaultDifficulty);
  const [seed, setSeed] = useState<string>(querySeed || createDeterministicSeed('ASSESS'));
  const [globalDurationMinutes, setGlobalDurationMinutes] = useState<number>(
    settings.defaultAssessmentDurationMinutes || 20
  );
  const [questionsPerModule, setQuestionsPerModule] = useState<number>(3);
  const [selectedGames, setSelectedGames] = useState<GameType[]>([
    'math-bubbles',
    'memory-maze',
    'path-rotation',
  ]);

  const [savedSnapshot, setSavedSnapshot] = useState<ActiveAssessmentSnapshot | null>(() =>
    loadActiveAssessmentSnapshot()
  );

  const [stage, setStage] = useState<'setup' | 'running'>(autostart ? 'running' : 'setup');
  const [assessmentId, setAssessmentId] = useState<string>(
    () => `assess-${Date.now().toString(36)}`
  );
  const [startedAtIso, setStartedAtIso] = useState<string>(() => new Date().toISOString());
  const [sequence, setSequence] = useState<SequenceItem[]>(() =>
    buildAssessmentSequence(
      'full-timed-assessment',
      ['math-bubbles', 'memory-maze', 'path-rotation'],
      3
    )
  );
  const [currentItemIndex, setCurrentItemIndex] = useState<number>(0);
  const [questionResults, setQuestionResults] = useState<QuestionResult[]>([]);
  const [elapsedGlobalSeconds, setElapsedGlobalSeconds] = useState<number>(0);

  const finalizedRef = useRef<boolean>(false);
  const advancingRef = useRef<boolean>(false);
  const questionStartRef = useRef<number>(performance.now());

  const activeItem = sequence[currentItemIndex] ?? sequence[0];
  const globalTimeLimitSeconds = globalDurationMinutes * 60;

  const activeGameConfig: GameConfig = useMemo(
    () => ({
      gameType: activeItem?.gameType ?? 'math-bubbles',
      difficulty,
      evaluationMode,
      questionCount: sequence.length,
      timeLimitSeconds: globalTimeLimitSeconds,
      perQuestionTimeSeconds: activeItem?.gameType === 'math-bubbles' ? 15 : 35,
      seed: `${seed}::item-${activeItem?.globalIndex ?? 0}`,
      practiceRules: {
        ...settings.practiceRules,
        allowUndo: evaluationMode === 'practice',
        showLiveValidation: evaluationMode === 'practice',
        strictOrderPenalty: true,
      },
    }),
    [activeItem, difficulty, evaluationMode, sequence.length, globalTimeLimitSeconds, seed, settings.practiceRules]
  );

  const mbGenerated = useMemo(
    () => mathBubblesEngine.generatePuzzle(activeGameConfig, activeItem?.stageQuestionIndex ?? 0),
    [activeGameConfig, activeItem]
  );
  const mmGenerated = useMemo(
    () => memoryMazeEngine.generatePuzzle(activeGameConfig, activeItem?.stageQuestionIndex ?? 0),
    [activeGameConfig, activeItem]
  );
  const prGenerated = useMemo(
    () => pathRotationEngine.generatePuzzle(activeGameConfig, activeItem?.stageQuestionIndex ?? 0),
    [activeGameConfig, activeItem]
  );

  const prScrambledInitial = useMemo(
    () =>
      createScrambledPathFinderBoard(prGenerated.puzzle, prGenerated.metadata.seed).initialBoard,
    [prGenerated]
  );

  const [mbState, setMbState] = useState(mbGenerated.initialState);
  const [mmState, setMmState] = useState(mmGenerated.initialState);
  const [prState, setPrState] = useState(prGenerated.initialState);
  const [prBoard, setPrBoard] = useState<PathFinderPiece[][]>(() =>
    clonePathFinderBoard(prScrambledInitial)
  );
  const [prMoves, setPrMoves] = useState<number>(0);
  const [feedbackTone, setFeedbackTone] = useState<'neutral' | 'success' | 'error'>('neutral');
  const [mbFailReveal, setMbFailReveal] = useState<boolean>(false);
  const [mmFlashedEdgeKey, setMmFlashedEdgeKey] = useState<string | null>(null);
  const [prSelectedCoord, setPrSelectedCoord] = useState<{ row: number; col: number } | null>(null);
  const [questionRemainingSec, setQuestionRemainingSec] = useState<number>(
    activeGameConfig.perQuestionTimeSeconds
  );

  useEffect(() => {
    setMbState(mbGenerated.initialState);
    setMmState(mmGenerated.initialState);
    setPrState(prGenerated.initialState);
    setPrBoard(clonePathFinderBoard(prScrambledInitial));
    setPrMoves(0);
    setFeedbackTone('neutral');
    setMbFailReveal(false);
    setMmFlashedEdgeKey(null);
    setPrSelectedCoord(null);
    setQuestionRemainingSec(activeGameConfig.perQuestionTimeSeconds);
    questionStartRef.current = performance.now();
    advancingRef.current = false;
  }, [
    mbGenerated,
    mmGenerated,
    prGenerated,
    prScrambledInitial,
    activeGameConfig.perQuestionTimeSeconds,
  ]);

  // Persist snapshot whenever running
  useEffect(() => {
    if (stage !== 'running' || finalizedRef.current) return;
    const snap: ActiveAssessmentSnapshot = {
      assessmentId,
      orchestratorMode,
      evaluationMode,
      difficulty,
      seed,
      startedAtIso,
      globalTimeLimitSeconds,
      elapsedGlobalSeconds,
      currentItemIndex,
      sequence,
      questionResults,
    };
    saveActiveAssessmentSnapshot(snap);
  }, [
    stage,
    assessmentId,
    orchestratorMode,
    evaluationMode,
    difficulty,
    seed,
    startedAtIso,
    globalTimeLimitSeconds,
    elapsedGlobalSeconds,
    currentItemIndex,
    sequence,
    questionResults,
  ]);

  const finalizeAssessment = useCallback(
    (finalList: QuestionResult[], status: 'completed' | 'abandoned') => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      saveActiveAssessmentSnapshot(null);
      setSavedSnapshot(null);

      const sessionId = `ses-assess-${Date.now().toString(36)}`;
      const score = aggregateSessionScore(finalList, sequence.length);
      const record: SessionRecord = {
        sessionId,
        mode: 'assessment',
        orchestratorMode,
        evaluationMode,
        gameType: 'combined-assessment',
        status,
        startedAtIso,
        completedAtIso: new Date().toISOString(),
        seed,
        difficulty,
        config: activeGameConfig,
        globalTimeLimitSeconds,
        gameOrder: selectedGames,
        score,
        questionResults: finalList,
      };
      recordSession(record);
      soundFX.playComplete(settings.soundEnabled);
      navigate(`/results/${sessionId}`);
    },
    [
      sequence.length,
      orchestratorMode,
      evaluationMode,
      startedAtIso,
      seed,
      difficulty,
      activeGameConfig,
      globalTimeLimitSeconds,
      selectedGames,
      recordSession,
      settings.soundEnabled,
      navigate,
    ]
  );

  const recordCurrentItemAndAdvance = useCallback(
    (qResult: QuestionResult) => {
      if (advancingRef.current) return;
      advancingRef.current = true;

      const updated = [...questionResults, qResult];
      setQuestionResults(updated);

      if (currentItemIndex + 1 < sequence.length) {
        setCurrentItemIndex((prev) => prev + 1);
      } else {
        finalizeAssessment(updated, 'completed');
      }
    },
    [questionResults, currentItemIndex, sequence.length, finalizeAssessment]
  );

  // Global & per-question timer
  useEffect(() => {
    if (stage !== 'running') return;

    const interval = window.setInterval(() => {
      setElapsedGlobalSeconds((prev) => {
        const next = prev + 0.2;
        if (next >= globalTimeLimitSeconds && !finalizedRef.current) {
          finalizeAssessment(questionResults, 'completed');
        }
        return next;
      });

      const qElapsed = (performance.now() - questionStartRef.current) / 1000;
      const nextQRem = Math.max(0, activeGameConfig.perQuestionTimeSeconds - qElapsed);
      setQuestionRemainingSec(nextQRem);

      if (nextQRem <= 0 && !advancingRef.current) {
        const elapsedMs = activeGameConfig.perQuestionTimeSeconds * 1000;
        let qRes: QuestionResult;
        if (activeItem.gameType === 'math-bubbles') {
          qRes = mathBubblesEngine.calculateQuestionResult({
            metadata: mbGenerated.metadata,
            puzzle: mbGenerated.puzzle,
            finalState: mbState,
            elapsedMs,
            timedOut: true,
          });
        } else if (activeItem.gameType === 'memory-maze') {
          qRes = memoryMazeEngine.calculateQuestionResult({
            metadata: mmGenerated.metadata,
            puzzle: mmGenerated.puzzle,
            finalState: mmState,
            elapsedMs,
            timedOut: true,
          });
        } else {
          qRes = pathRotationEngine.calculateQuestionResult({
            metadata: prGenerated.metadata,
            puzzle: prGenerated.puzzle,
            finalState: prState,
            elapsedMs,
            timedOut: true,
          });
        }
        recordCurrentItemAndAdvance(qRes);
      }
    }, 200);

    return () => window.clearInterval(interval);
  }, [
    stage,
    globalTimeLimitSeconds,
    activeGameConfig.perQuestionTimeSeconds,
    activeItem,
    mbGenerated,
    mmGenerated,
    prGenerated,
    mbState,
    mmState,
    prState,
    questionResults,
    finalizeAssessment,
    recordCurrentItemAndAdvance,
  ]);

  const handleStartFresh = () => {
    finalizedRef.current = false;
    const seq = buildAssessmentSequence(orchestratorMode, selectedGames, questionsPerModule);
    setSequence(seq);
    setAssessmentId(`assess-${Date.now().toString(36)}`);
    setStartedAtIso(new Date().toISOString());
    setCurrentItemIndex(0);
    setQuestionResults([]);
    setElapsedGlobalSeconds(0);
    setStage('running');
  };

  const handleResumeSnapshot = () => {
    if (!savedSnapshot) return;
    finalizedRef.current = false;
    setAssessmentId(savedSnapshot.assessmentId);
    setOrchestratorMode(savedSnapshot.orchestratorMode);
    setEvaluationMode(savedSnapshot.evaluationMode);
    setDifficulty(savedSnapshot.difficulty);
    setSeed(savedSnapshot.seed);
    setStartedAtIso(savedSnapshot.startedAtIso);
    setSequence(savedSnapshot.sequence);
    setCurrentItemIndex(savedSnapshot.currentItemIndex);
    setQuestionResults(savedSnapshot.questionResults);
    setElapsedGlobalSeconds(savedSnapshot.elapsedGlobalSeconds);
    setStage('running');
  };

  const handleEarlySubmit = () => {
    if (questionResults.length > 0) {
      finalizeAssessment(questionResults, 'completed');
      return;
    }
    const elapsedMs = Math.max(50, Math.round(performance.now() - questionStartRef.current));
    const qRes = mathBubblesEngine.calculateQuestionResult({
      metadata: mbGenerated.metadata,
      puzzle: mbGenerated.puzzle,
      finalState: mbState,
      elapsedMs,
      timedOut: false,
    });
    finalizeAssessment([qRes], 'completed');
  };

  // Sub-game action handlers
  const handleSelectBubble = (bubbleId: string) => {
    if (mbFailReveal || advancingRef.current) return;

    const outcome = mathBubblesEngine.validateAction(mbGenerated.puzzle, mbState, {
      type: 'select-bubble',
      bubbleId,
    });
    if (!outcome.valid) return;
    setMbState(outcome.nextState);

    const isSequenceFull =
      outcome.nextState.selectedIds.length === mbGenerated.puzzle.expectedSequenceIds.length;
    if (!isSequenceFull) {
      setFeedbackTone('neutral');
      return;
    }

    const isAllCorrect = mathBubblesEngine.isPuzzleComplete(mbGenerated.puzzle, outcome.nextState);
    setMbFailReveal(true);
    setFeedbackTone(isAllCorrect ? 'success' : 'error');

    const elapsedMs = Math.max(50, Math.round(performance.now() - questionStartRef.current));
    const qRes = mathBubblesEngine.calculateQuestionResult({
      metadata: mbGenerated.metadata,
      puzzle: mbGenerated.puzzle,
      finalState: outcome.nextState,
      elapsedMs,
      timedOut: false,
    });
    window.setTimeout(() => {
      recordCurrentItemAndAdvance(qRes);
    }, 680);
  };

  const handleMazeMove = (direction: MoveDirection) => {
    const prevPlayer = mmState.player;
    const outcome = memoryMazeEngine.validateAction(mmGenerated.puzzle, mmState, {
      type: 'move',
      direction,
    });
    setMmState(outcome.nextState);
    if (!outcome.valid) {
      const edgeKey = `${prevPlayer.row}-${prevPlayer.col}-${direction}`;
      setMmFlashedEdgeKey(edgeKey);
      window.setTimeout(() => {
        setMmFlashedEdgeKey((curr) => (curr === edgeKey ? null : curr));
      }, 360);
    }
    if (outcome.isComplete) {
      const elapsedMs = Math.max(50, Math.round(performance.now() - questionStartRef.current));
      const qRes = memoryMazeEngine.calculateQuestionResult({
        metadata: mmGenerated.metadata,
        puzzle: mmGenerated.puzzle,
        finalState: outcome.nextState,
        elapsedMs,
        timedOut: false,
      });
      recordCurrentItemAndAdvance(qRes);
    }
  };

  const handlePathTileClick = (row: number, col: number) => {
    const clickedPiece = prBoard[row]?.[col];
    const baseTile = prGenerated.puzzle.tiles[row]?.[col];
    if (
      !clickedPiece ||
      clickedPiece.locked ||
      clickedPiece.isBlocker ||
      baseTile?.locked ||
      baseTile?.shape === 'blocker'
    ) {
      setPrSelectedCoord(null);
      setFeedbackTone('error');
      return;
    }

    if (!prSelectedCoord) {
      setPrSelectedCoord({ row, col });
      setFeedbackTone('neutral');
      return;
    }

    if (prSelectedCoord.row === row && prSelectedCoord.col === col) {
      setPrSelectedCoord(null);
      return;
    }

    const swapOut = swapPathFinderPieces(prBoard, prSelectedCoord, { row, col });
    if (swapOut.swapped) {
      setPrBoard(swapOut.nextBoard);
      setPrMoves((m) => m + 1);
      setPrSelectedCoord(null);
      setFeedbackTone('neutral');
    }
  };

  const handlePathCycleArrows = () => {
    if (!prSelectedCoord) return;
    const cycleOut = cyclePathFinderPieceArrows(
      prBoard,
      prSelectedCoord.row,
      prSelectedCoord.col
    );
    if (cycleOut.cycled) {
      setPrBoard(cycleOut.nextBoard);
      setPrMoves((m) => m + 1);
      setFeedbackTone('neutral');
    }
  };

  const toggleModuleInclusion = (gt: GameType) => {
    if (selectedGames.includes(gt)) {
      if (selectedGames.length <= 1) return;
      setSelectedGames((prev) => prev.filter((item) => item !== gt));
    } else {
      setSelectedGames((prev) => [...prev, gt]);
    }
  };

  const globalRemainingSec = Math.max(0, Math.round(globalTimeLimitSeconds - elapsedGlobalSeconds));
  const globalMins = Math.floor(globalRemainingSec / 60);
  const globalSecs = globalRemainingSec % 60;

  if (stage === 'setup') {
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
          <span className="text-xs font-mono text-cyan-400">
            Multi-Stage Assessment Orchestrator · Session Snapshot Recovery
          </span>
        </div>

        {savedSnapshot && (
          <div className="bg-cyan-950/50 border border-cyan-500/50 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                Saved In-Progress Assessment Found
              </div>
              <p className="text-xs text-slate-300 mt-0.5 font-mono">
                Seed: {savedSnapshot.seed} · Item {savedSnapshot.currentItemIndex + 1} of{' '}
                {savedSnapshot.sequence.length}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResumeSnapshot}
                className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-lg hover:bg-cyan-300 cursor-pointer"
              >
                Resume Assessment
              </button>
              <button
                type="button"
                onClick={() => {
                  saveActiveAssessmentSnapshot(null);
                  setSavedSnapshot(null);
                }}
                className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 rounded-lg hover:bg-slate-700 cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        <section className="bg-[#111726] border border-slate-800/90 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
              <Layers className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">
                Cognitive Assessment Orchestrator
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Execute a sequenced multi-game cognitive assessment under a global countdown timer
                with automatic refresh-resilient snapshot persistence.
              </p>
            </div>
          </div>

          <div className="space-y-5 pt-3 border-t border-slate-800/80">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Select Assessment Orchestrator Mode (5 Configurations)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {[
                  {
                    id: 'full-timed-assessment' as AssessmentOrchestratorMode,
                    title: 'Full Timed Assessment',
                    desc: 'All 3 modules sequentially under global clock',
                  },
                  {
                    id: 'custom-assessment' as AssessmentOrchestratorMode,
                    title: 'Custom Multi-Stage Battery',
                    desc: 'Configure modules, lengths & timer',
                  },
                  {
                    id: 'mixed-practice' as AssessmentOrchestratorMode,
                    title: 'Interleaved Mixed Practice',
                    desc: 'Alternates questions across modules',
                  },
                  {
                    id: 'single-game-challenge' as AssessmentOrchestratorMode,
                    title: 'Single-Game Timed Sprint',
                    desc: 'Focused timed benchmark on 1 module',
                  },
                  {
                    id: 'free-practice' as AssessmentOrchestratorMode,
                    title: 'Free Practice Battery',
                    desc: 'Untimed exploration with live hints',
                  },
                ].map((m) => {
                  const active = orchestratorMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setOrchestratorMode(m.id)}
                      className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                        active
                          ? 'bg-cyan-950/60 border-cyan-400 text-slate-100'
                          : 'bg-[#090D16] border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-semibold">{m.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{m.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Evaluation Mode
              </label>
              <EvaluationModeSelector
                value={evaluationMode}
                onChange={setEvaluationMode}
                idPrefix="assess-eval"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Difficulty Tier
              </label>
              <DifficultySelector
                value={difficulty}
                onChange={setDifficulty}
                idPrefix="assess-diff"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Questions Per Module
                </label>
                <select
                  value={questionsPerModule}
                  onChange={(e) => setQuestionsPerModule(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-[#090D16] border border-slate-800 rounded-lg text-slate-200"
                >
                  <option value={2}>2 Questions / Module (Quick)</option>
                  <option value={3}>3 Questions / Module (Standard)</option>
                  <option value={5}>5 Questions / Module (Full)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Global Time Limit (Minutes)
                </label>
                <select
                  value={globalDurationMinutes}
                  onChange={(e) => setGlobalDurationMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-[#090D16] border border-slate-800 rounded-lg text-slate-200"
                >
                  <option value={10}>10 Minutes</option>
                  <option value={20}>20 Minutes (Standard)</option>
                  <option value={30}>30 Minutes</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Master Seed
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-[#090D16] border border-slate-800 rounded-lg text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setSeed(createDeterministicSeed('ASSESS'))}
                    className="p-2 text-slate-400 hover:text-white bg-[#090D16] border border-slate-800 rounded-lg cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Included Modules
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(['math-bubbles', 'memory-maze', 'path-rotation'] as GameType[]).map((gt) => {
                  const active = selectedGames.includes(gt);
                  return (
                    <button
                      key={gt}
                      type="button"
                      onClick={() => toggleModuleInclusion(gt)}
                      className={`p-3 rounded-lg border text-left text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-cyan-950/60 border-cyan-400 text-slate-100'
                          : 'bg-[#090D16] border-slate-800 text-slate-400'
                      }`}
                    >
                      {gt === 'math-bubbles'
                        ? '01 · Math Bubble Arena'
                        : gt === 'memory-maze'
                        ? '02 · Memory Maze'
                        : '03 · Path Rotation'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800">
            <div className="text-xs text-slate-400 font-mono">
              Total Items: {selectedGames.length * questionsPerModule} · Global Clock:{' '}
              {globalDurationMinutes}:00
            </div>
            <button
              type="button"
              data-start="true"
              onClick={handleStartFresh}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-slate-950 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Launch Full Assessment</span>
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Global Assessment Orchestrator Header */}
      <header className="bg-[#111726] border border-slate-800/90 rounded-xl px-4 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 rounded-md bg-cyan-500/15 border border-cyan-500/30 font-mono text-xs font-bold text-cyan-300">
            ITEM {currentItemIndex + 1} / {sequence.length}
          </span>
          <div>
            <div className="text-xs font-mono text-slate-400 uppercase">
              Stage {activeItem.stageNumber} · {activeItem.gameType}
            </div>
            <h1 className="text-sm sm:text-base font-bold text-slate-100">
              Full Cognitive Assessment Battery
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#090D16] border border-slate-800 font-mono text-xs font-semibold text-cyan-300">
            <Clock className="w-3.5 h-3.5" />
            <span>
              Global Clock: {globalMins}:{globalSecs.toString().padStart(2, '0')}
            </span>
          </div>

          <button
            type="button"
            onClick={handleEarlySubmit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#090D16] border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5 text-cyan-400" />
            <span>Submit Assessment Early</span>
          </button>
        </div>
      </header>

      <TimerBar
        remainingSeconds={questionRemainingSec}
        totalSeconds={activeGameConfig.perQuestionTimeSeconds}
        visible={settings.showTimerCountdown}
        label="Item Countdown"
      />

      {/* Active Sub-Game View */}
      {activeItem.gameType === 'math-bubbles' && (
        <section className="bg-[#111726] border border-slate-800/90 rounded-2xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase text-cyan-300">
              {mbGenerated.puzzle.orderRule === 'ascending' ? (
                <>
                  <ArrowUpNarrowWide className="w-4 h-4" /> Order: LOWEST → HIGHEST
                </>
              ) : (
                <>
                  <ArrowDownWideNarrow className="w-4 h-4" /> Order: HIGHEST → LOWEST
                </>
              )}
            </span>
            <span className="font-mono text-xs text-slate-400">
              Selected {mbState.selectedIds.length} / {mbGenerated.puzzle.expectedSequenceIds.length}
            </span>
          </div>

          <div className="py-4 sm:py-5 px-2 rounded-2xl bg-[#090D16]/90 border border-slate-800/70 grid grid-cols-2 sm:grid-cols-4 place-items-center gap-3 sm:gap-4">
            {mbGenerated.puzzle.bubbles.map((bubble) => {
              const selIdx = mbState.selectedIds.indexOf(bubble.id);
              const isSelected = selIdx !== -1;
              const expectedIdAtSlot =
                selIdx >= 0 ? mbGenerated.puzzle.expectedSequenceIds[selIdx] : undefined;
              const expectedBubbleAtSlot = expectedIdAtSlot
                ? mbGenerated.puzzle.bubbles.find((b) => b.id === expectedIdAtSlot)
                : undefined;
              const isSlotCorrect =
                isSelected &&
                (bubble.id === expectedIdAtSlot ||
                  (expectedBubbleAtSlot !== undefined &&
                    bubble.exactScaledValue === expectedBubbleAtSlot.exactScaledValue));

              return (
                <button
                  key={bubble.id}
                  type="button"
                  onClick={() => handleSelectBubble(bubble.id)}
                  disabled={isSelected || mbFailReveal}
                  className={`relative w-[118px] h-[118px] sm:w-[144px] sm:h-[144px] rounded-full border flex flex-col items-center justify-between p-3 sm:p-4 text-center cursor-pointer transition-all ${
                    mbFailReveal && isSelected
                      ? isSlotCorrect
                        ? 'border-[3px] border-emerald-500 ring-4 ring-emerald-500/30 bg-emerald-950/40'
                        : 'border-[3px] border-rose-500 ring-4 ring-rose-500/30 bg-rose-950/40'
                      : isSelected
                      ? 'bubble-orb-selected border-cyan-300 scale-95'
                      : 'bubble-orb-idle border-slate-700/90 hover:border-cyan-400'
                  }`}
                >
                  {isSelected && (
                    <span
                      className={`absolute -top-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold text-white shadow-md ${
                        mbFailReveal
                          ? isSlotCorrect
                            ? 'bg-emerald-500 border-2 border-white'
                            : 'bg-rose-500 border-2 border-white'
                          : 'bg-cyan-500 border-2 border-slate-950'
                      }`}
                    >
                      {selIdx + 1}
                    </span>
                  )}
                  <span className="text-[10px] sm:text-[11px] font-mono text-slate-400">
                    Key [{bubble.shortcutKey}]
                  </span>
                  <span className="text-sm sm:text-xl font-bold font-mono text-slate-100 break-words max-w-full">
                    {bubble.label}
                  </span>
                  <span
                    className={`text-[10px] sm:text-[11px] font-mono ${
                      mbFailReveal && isSelected
                        ? isSlotCorrect
                          ? 'text-emerald-300 font-bold'
                          : 'text-rose-300 font-bold'
                        : 'text-cyan-300'
                    }`}
                  >
                    {isSelected ? `#${selIdx + 1}` : `Tap / [${bubble.shortcutKey}]`}
                  </span>
                </button>
              );
            })}
          </div>
          <FeedbackBanner message={mbState.lastFeedback} tone={feedbackTone} />
        </section>
      )}

      {activeItem.gameType === 'memory-maze' && (
        <section className="bg-[#111726] border border-slate-800/90 rounded-2xl p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-7 flex justify-center">
            <div
              role="grid"
              className="grid gap-0 w-full max-w-[340px] aspect-square rounded-2xl bg-[#090D16] border-2 border-slate-700 overflow-hidden"
              style={{
                gridTemplateColumns: `repeat(${mmGenerated.puzzle.gridSize}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${mmGenerated.puzzle.gridSize}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: mmGenerated.puzzle.gridSize }).map((_, r) =>
                Array.from({ length: mmGenerated.puzzle.gridSize }).map((__, c) => {
                  const isPlayer = mmState.player.row === r && mmState.player.col === c;
                  const isGoal =
                    mmGenerated.puzzle.goal.row === r && mmGenerated.puzzle.goal.col === c;
                  const keyItem = mmGenerated.puzzle.keysOrder.find(
                    (k) => k.coord.row === r && k.coord.col === c
                  );
                  const isKeyCollected = keyItem
                    ? mmState.collectedKeyIds.includes(keyItem.id)
                    : false;

                  const flashTop =
                    mmFlashedEdgeKey === `${r}-${c}-up` ||
                    mmFlashedEdgeKey === `${r - 1}-${c}-down`;
                  const flashBottom =
                    mmFlashedEdgeKey === `${r}-${c}-down` ||
                    mmFlashedEdgeKey === `${r + 1}-${c}-up`;
                  const flashLeft =
                    mmFlashedEdgeKey === `${r}-${c}-left` ||
                    mmFlashedEdgeKey === `${r}-${c - 1}-right`;
                  const flashRight =
                    mmFlashedEdgeKey === `${r}-${c}-right` ||
                    mmFlashedEdgeKey === `${r}-${c + 1}-left`;

                  return (
                    <div
                      key={`${r}-${c}`}
                      className={`relative flex items-center justify-center border border-slate-800 text-[10px] font-mono font-bold ${
                        isPlayer
                          ? 'bg-cyan-400/20 text-cyan-200'
                          : isGoal
                          ? 'bg-emerald-950/60 text-emerald-200'
                          : keyItem && !isKeyCollected
                          ? 'bg-amber-950/60 text-amber-200'
                          : 'bg-slate-900/80 text-slate-400'
                      }`}
                    >
                      {flashTop && (
                        <span className="pointer-events-none absolute top-0 inset-x-0 h-[4px] bg-rose-500 shadow-[0_0_10px_#f43f5e] z-20" />
                      )}
                      {flashBottom && (
                        <span className="pointer-events-none absolute bottom-0 inset-x-0 h-[4px] bg-rose-500 shadow-[0_0_10px_#f43f5e] z-20" />
                      )}
                      {flashLeft && (
                        <span className="pointer-events-none absolute left-0 inset-y-0 w-[4px] bg-rose-500 shadow-[0_0_10px_#f43f5e] z-20" />
                      )}
                      {flashRight && (
                        <span className="pointer-events-none absolute right-0 inset-y-0 w-[4px] bg-rose-500 shadow-[0_0_10px_#f43f5e] z-20" />
                      )}
                      {isPlayer
                        ? 'YOU'
                        : keyItem && !isKeyCollected
                        ? keyItem.label
                        : isGoal
                        ? 'EXIT'
                        : ''}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="grid grid-cols-3 gap-2 max-w-[180px] mx-auto">
              <div />
              <button
                type="button"
                onClick={() => handleMazeMove('up')}
                className="h-11 rounded-xl bg-[#090D16] border border-slate-700 flex items-center justify-center text-slate-100"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
              <div />
              <button
                type="button"
                onClick={() => handleMazeMove('left')}
                className="h-11 rounded-xl bg-[#090D16] border border-slate-700 flex items-center justify-center text-slate-100"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => handleMazeMove('down')}
                className="h-11 rounded-xl bg-[#090D16] border border-slate-700 flex items-center justify-center text-slate-100"
              >
                <ArrowDown className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => handleMazeMove('right')}
                className="h-11 rounded-xl bg-[#090D16] border border-slate-700 flex items-center justify-center text-slate-100"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
            <FeedbackBanner message={mmState.lastFeedback} tone={feedbackTone} />
          </div>
        </section>
      )}

      {activeItem.gameType === 'path-rotation' && (
        <section
          onClick={() => setPrSelectedCoord(null)}
          className="bg-[#111726] border border-slate-800/90 rounded-2xl p-5 flex flex-col items-center space-y-4"
        >
          <div className="relative px-8 py-5 w-full flex justify-center">
            <div
              role="grid"
              onClick={(e) => e.stopPropagation()}
              className="relative grid gap-0 w-full max-w-[350px] aspect-square rounded-2xl bg-white border-2 border-slate-700 overflow-visible"
              style={{
                gridTemplateColumns: `repeat(${prGenerated.puzzle.gridSize}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${prGenerated.puzzle.gridSize}, minmax(0, 1fr))`,
              }}
            >
              {prGenerated.puzzle.tiles.map((rowTiles, r) =>
                rowTiles.map((tile, c) => {
                  const placedPiece = prBoard[r]?.[c];
                  const prEval = evaluatePathFinderBoard(prGenerated.puzzle, prBoard);
                  const isEnergized = prEval.energizedCoords.some(
                    (ec) => ec.row === r && ec.col === c
                  );
                  const isSelected = prSelectedCoord?.row === r && prSelectedCoord?.col === c;
                  const isLockedCell =
                    Boolean(placedPiece?.locked) ||
                    Boolean(placedPiece?.isBlocker) ||
                    tile.locked ||
                    tile.shape === 'blocker';
                  const activeRoute =
                    placedPiece && placedPiece.routeConfigs.length > 0
                      ? placedPiece.routeConfigs[
                          placedPiece.routeIndex % placedPiece.routeConfigs.length
                        ]
                      : undefined;
                  const outEdge = prEval.outEdgeSide;

                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePathTileClick(r, c);
                      }}
                      className={`relative flex items-center justify-center border border-slate-400 bg-white ${
                        isLockedCell ? 'cursor-not-allowed' : 'cursor-pointer'
                      } ${isSelected ? 'z-20 ring-2 ring-[#F5B700]' : ''}`}
                    >
                      {tile.isSource && (
                        <span className="pointer-events-none absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full bg-[#10B981] border-2 border-white text-white font-mono text-[10px] font-extrabold shadow-md whitespace-nowrap">
                          IN →
                        </span>
                      )}
                      {tile.isSink && (
                        <span
                          className={`pointer-events-none absolute ${
                            outEdge === 'S'
                              ? 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2'
                              : 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2'
                          } z-30 inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full bg-[#F59E0B] border-2 border-white text-white font-mono text-[10px] font-extrabold shadow-md whitespace-nowrap`}
                        >
                          {outEdge === 'S' ? 'OUT ↓' : 'OUT →'}
                        </span>
                      )}
                      <TileConduitSvg
                        sides={placedPiece?.lockedPorts ?? []}
                        energized={isEnergized}
                        isSource={tile.isSource}
                        isSink={tile.isSink}
                        isWaypoint={tile.isWaypoint}
                        isBlocker={Boolean(placedPiece?.isBlocker || tile.shape === 'blocker')}
                        isEmptySlot={Boolean(placedPiece?.isEmptySlot)}
                        isConnectedToSink={prEval.isSolved}
                        lockedPorts={placedPiece?.lockedPorts ?? []}
                        activeRoute={activeRoute}
                        isSelectedPiece={isSelected}
                      />
                      {isLockedCell && !placedPiece?.isBlocker && tile.shape !== 'blocker' && (
                        <span className="pointer-events-none absolute bottom-1 right-1 p-0.5 rounded bg-slate-900/80 text-amber-300 z-20">
                          <Lock className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col items-center gap-2"
          >
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setPrBoard(clonePathFinderBoard(prScrambledInitial));
                  setPrMoves(0);
                  setPrSelectedCoord(null);
                }}
                className="w-11 h-11 rounded-2xl bg-[#2D3139] hover:bg-[#3B404A] text-white flex items-center justify-center shadow-md cursor-pointer"
                aria-label="Reset board"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handlePathCycleArrows}
                className="w-11 h-11 rounded-2xl bg-[#2D3139] hover:bg-[#3B404A] ring-2 ring-[#F5B700]/80 text-white flex items-center justify-center shadow-md cursor-pointer"
                aria-label="Cycle internal arrows inside selected piece"
              >
                <Repeat className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const prEval = evaluatePathFinderBoard(prGenerated.puzzle, prBoard);
                  if (prEval.isSolved) {
                    const elapsedMs = Math.max(
                      50,
                      Math.round(performance.now() - questionStartRef.current)
                    );
                    const solvedState = {
                      ...prState,
                      isConnectedToSink: true,
                      allWaypointsEnergized: true,
                      checkpointOrderValid: true,
                      arrowConstraintsValid: true,
                      movesCount: prMoves,
                      energizedCoords: prEval.energizedCoords,
                    };
                    const qRes = pathRotationEngine.calculateQuestionResult({
                      metadata: prGenerated.metadata,
                      puzzle: prGenerated.puzzle,
                      finalState: solvedState,
                      elapsedMs,
                      timedOut: false,
                    });
                    recordCurrentItemAndAdvance(qRes);
                  } else {
                    setFeedbackTone('error');
                  }
                }}
                className="w-11 h-11 rounded-2xl bg-[#2D3139] hover:bg-[#3B404A] text-white flex items-center justify-center shadow-md cursor-pointer"
                aria-label="Submit route"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs font-mono text-slate-400">Moves: {prMoves}</div>
          </div>
          <FeedbackBanner message={prState.lastFeedback} tone={feedbackTone} />
        </section>
      )}
    </div>
  );
};
