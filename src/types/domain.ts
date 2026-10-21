/**
 * Shared Domain Architecture for Cognitive Games Lab
 * Supports 5+1 Difficulty levels, Practice vs Exam modes, 50 Archetypes per game (150 total),
 * 5 Assessment Orchestrator modes, error categorization, and per-archetype telemetry.
 */

export type GameType = 'math-bubbles' | 'memory-maze' | 'path-rotation';

export type Difficulty =
  | 'beginner'
  | 'easy'
  | 'intermediate'
  | 'advanced'
  | 'expert'
  | 'adaptive'
  | 'medium' // backward-compatible alias for intermediate
  | 'hard'; // backward-compatible alias for advanced

export type CanonicalDifficulty = 'beginner' | 'easy' | 'intermediate' | 'advanced' | 'expert' | 'adaptive';

export type SessionMode =
  | 'standalone'
  | 'practice'
  | 'exam'
  | 'assessment'
  | 'free-practice'
  | 'single-game-challenge'
  | 'mixed-practice'
  | 'full-timed-assessment'
  | 'custom-assessment';

export type AssessmentOrchestratorMode =
  | 'free-practice'
  | 'single-game-challenge'
  | 'mixed-practice'
  | 'full-timed-assessment'
  | 'custom-assessment';

export type EvaluationMode = 'practice' | 'exam';

export type SessionStatus =
  | 'idle'
  | 'configuring'
  | 'instructions'
  | 'in-progress'
  | 'paused'
  | 'completed'
  | 'abandoned';

export type TimeoutStatus = 'within-limit' | 'near-timeout' | 'timed-out';

export type RouteQualityClassification =
  | 'minimum-rotation-optimal'
  | 'shortest-valid-route'
  | 'valid-non-optimal'
  | 'invalid-disconnected';

export type CognitiveErrorCategory =
  | 'none'
  | 'order-inversion'
  | 'negative-sign-error'
  | 'operator-precedence-error'
  | 'close-value-precision-error'
  | 'fraction-decimal-conversion-error'
  | 'timeout-incomplete'
  | 'hidden-barrier-collision'
  | 'one-way-door-violation'
  | 'key-order-violation'
  | 'move-budget-exceeded'
  | 'disconnected-conduit'
  | 'bypassed-checkpoint'
  | 'directional-arrow-violation'
  | 'locked-tile-attempt'
  | 'non-optimal-rotations';

export interface PuzzleArchetype {
  id: string;
  gameType: GameType;
  index: number; // 1..50
  code: string;
  title: string;
  category: string;
  description: string;
  recommendedDifficulty: CanonicalDifficulty;
  eligibleGridSizes?: number[];
  validationRequirements?: string[];
  hasAutomatedTestCoverage?: boolean;
}

export interface GameConfig {
  gameType: GameType;
  difficulty: Difficulty;
  evaluationMode?: EvaluationMode; // 'practice' (immediate feedback, pause/undo/hint allowed) or 'exam' (delayed feedback, no pause/hint)
  questionCount: number; // 10, 25, 50, or custom
  timeLimitSeconds: number;
  perQuestionTimeSeconds: number; // default 15s for Math Bubbles
  seed: string;
  archetypeId?: string;
  gridSizeOverride?: number; // 3, 4, 5, or 6 for Path Rotation / Memory Maze
  keyCountOverride?: number; // 1..5 for Memory Maze
  allowedKeyCounts?: readonly number[]; // e.g. [1, 2], [2, 3], [2, 3, 4], [3, 4, 5] for Memory Maze
  mazeChallengeMode?: 'hidden-barrier-discovery' | 'flash-pattern-recall';
  practiceRules: {
    allowUndo: boolean;
    showLiveValidation: boolean;
    strictOrderPenalty: boolean;
    enablePartialCredit?: boolean;
    autoSubmitOnTimeout?: boolean;
    suspendTimerOnInactiveTab?: boolean;
  };
}

export interface PuzzleMetadata {
  puzzleId: string;
  gameType: GameType;
  archetypeId: string;
  archetypeTitle: string;
  category: string;
  difficulty: Difficulty;
  seed: string;
  questionIndex: number;
  timeLimitSeconds: number;
  promptText: string;
  ruleSubtext: string;
}

export interface UserAttempt {
  timestampMs: number;
  actionType: string;
  payload: unknown;
  valid: boolean;
  feedbackMessage?: string;
}

export interface QuestionResult {
  puzzleId: string;
  gameType: GameType;
  archetypeId: string;
  archetypeTitle: string;
  difficulty: Difficulty;
  seed: string;
  questionIndex: number;
  isCorrect: boolean;
  partialCredit: number; // 0..1
  scoreEarned: number;
  maxPossibleScore: number;
  elapsedMs: number;
  timeLimitMs: number;
  timeoutStatus: TimeoutStatus;
  attemptsCount: number;
  mistakesCount: number;
  hintsUsedCount?: number;
  rotationsCount?: number;
  flipsCount?: number;
  routeQuality?: RouteQualityClassification;
  errorCategory?: CognitiveErrorCategory;
  summaryText: string;
}

export interface SessionScore {
  totalScore: number;
  maxPossibleScore: number;
  NormalizedScore: number; // 0..1000 scale
  accuracyPercent: number; // 0..100
  correctCount: number;
  incorrectCount?: number;
  timeoutCount?: number;
  totalQuestions: number;
  questionsAttempted?: number;
  questionsRemaining?: number;
  averageResponseMs: number;
  totalElapsedMs: number;
  streakBest: number;
  speedBonusTotal: number;
  precisionBonusTotal: number;
}

export interface SessionRecord {
  sessionId: string;
  mode: SessionMode;
  orchestratorMode?: AssessmentOrchestratorMode;
  evaluationMode?: EvaluationMode;
  gameType: GameType | 'combined-assessment';
  status: SessionStatus;
  startedAtIso: string;
  completedAtIso: string;
  seed: string;
  difficulty: Difficulty;
  config: GameConfig;
  globalTimeLimitSeconds?: number;
  gameOrder?: GameType[];
  score: SessionScore;
  questionResults: QuestionResult[];
}

export interface AssessmentStageConfig {
  stageIndex: number;
  gameType: GameType;
  title: string;
  questionCount: number;
  stageTimeLimitSeconds: number;
  difficulty: Difficulty;
}

export interface AssessmentConfig {
  assessmentId: string;
  orchestratorMode: AssessmentOrchestratorMode;
  title: string;
  seed: string;
  difficulty: Difficulty;
  evaluationMode: EvaluationMode;
  globalTimeLimitSeconds: number; // Default 1200s (20 minutes) for full timed assessment
  gameOrder: GameType[];
  stages: AssessmentStageConfig[];
  includeBehaviouralModule?: boolean;
}

export interface ActiveAssessmentSnapshot {
  assessmentId: string;
  orchestratorMode: AssessmentOrchestratorMode;
  evaluationMode: EvaluationMode;
  difficulty: Difficulty;
  seed: string;
  startedAtIso: string;
  globalTimeLimitSeconds: number;
  elapsedGlobalSeconds: number;
  currentItemIndex: number;
  sequence: Array<{
    globalIndex: number;
    stageNumber: number;
    gameType: GameType;
    stageQuestionIndex: number;
    uniqueInstanceKey: string;
  }>;
  questionResults: QuestionResult[];
  submittedSessionId?: string;
}

export interface ArchetypeAccuracySummary {
  archetypeId: string;
  archetypeTitle: string;
  attempts: number;
  correct: number;
  accuracyPercent: number;
  averageResponseMs: number;
}

export interface GamePerformanceSummary {
  gameType: GameType;
  sessionsCompleted: number;
  questionsAnswered: number;
  bestNormalizedScore: number;
  averageNormalizedScore: number;
  accuracyPercent: number;
  averageResponseMs: number;
  timeoutsCount: number;
  lastPlayedIso: string | null;
  lastSessionId: string | null;
  archetypesMastered: string[];
  accuracyByArchetype?: Record<string, ArchetypeAccuracySummary>;
  errorCategoryCounts?: Partial<Record<CognitiveErrorCategory, number>>;
}

export interface HistoricalPerformance {
  totalSessionsCompleted: number;
  totalQuestionsAnswered: number;
  overallAccuracyPercent: number;
  overallAverageResponseMs: number;
  bestAssessmentScore: number;
  lastSessionId: string | null;
  byGame: Record<GameType, GamePerformanceSummary>;
}

export interface AppSettings {
  defaultDifficulty: CanonicalDifficulty;
  defaultEvaluationMode: EvaluationMode;
  defaultMathBubbleTimerSeconds: number;
  defaultAssessmentDurationMinutes: number; // Default 20 minutes
  defaultSessionLength: number;
  soundEnabled: boolean;
  reducedMotion: boolean;
  showTimerCountdown: boolean;
  keyboardHintsVisible: boolean;
  autoAdvanceOnComplete: boolean;
  practiceRules: {
    allowUndo: boolean;
    showLiveValidation: boolean;
    strictOrderPenalty: boolean;
    enablePartialCredit: boolean;
    autoSubmitOnTimeout: boolean;
    suspendTimerOnInactiveTab: boolean;
  };
}

export interface PersistedLabStoreV1 {
  schemaVersion: 1;
  updatedAtIso: string;
  settings: AppSettings;
  sessions: SessionRecord[];
}

export function normalizeDifficulty(diff: Difficulty): CanonicalDifficulty {
  if (diff === 'medium') return 'intermediate';
  if (diff === 'hard') return 'advanced';
  return diff;
}

export interface QuickFireMathHistoryItem {
  sessionId: string;
  playedAt: string;
  score: number;
  accuracyPercent: number;
  correctCount: number;
  totalQuestions: number;
  difficulty: Difficulty;
}

export interface MemoryMazeHistoryItem {
  sessionId: string;
  playedAt: string;
  score: number;
  wallHits: number;
  accuracyPercent: number;
  difficulty: Difficulty;
}

export interface PathFinderHistoryItem {
  sessionId: string;
  playedAt: string;
  score: number;
  moves: number;
  accuracyPercent: number;
  difficulty: Difficulty;
}

export interface AssessmentUserSession {
  playerName: string;
  createdAt: string;
  lastActive: string;
  gameStats: {
    quickFireMath: {
      gamesPlayed: number;
      highScore: number;
      history: QuickFireMathHistoryItem[];
    };
    memoryMaze: {
      gamesPlayed: number;
      wallHitsTotal: number;
      history: MemoryMazeHistoryItem[];
    };
    pathFinder: {
      gamesPlayed: number;
      bestMoves: number | null;
      history: PathFinderHistoryItem[];
    };
  };
}

