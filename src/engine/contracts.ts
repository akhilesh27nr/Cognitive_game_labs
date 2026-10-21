import {
  normalizeDifficulty,
  type CanonicalDifficulty,
  type Difficulty,
  type GameConfig,
  type GameType,
  type PuzzleArchetype,
  type PuzzleMetadata,
  type QuestionResult,
  type SessionScore,
  type TimeoutStatus,
} from '../types/domain.ts';

export interface ValidationOutcome<TState> {
  valid: boolean;
  isComplete: boolean;
  isCorrect: boolean;
  mistakeMade: boolean;
  nextState: TState;
  feedbackMessage: string;
}

export interface GameEngine<TPuzzle, TState, TAction> {
  readonly gameType: GameType;
  readonly title: string;
  readonly shortDescription: string;
  readonly archetypes: readonly PuzzleArchetype[];

  generatePuzzle(config: GameConfig, questionIndex: number): {
    metadata: PuzzleMetadata;
    puzzle: TPuzzle;
    initialState: TState;
  };

  validateAction(puzzle: TPuzzle, state: TState, action: TAction): ValidationOutcome<TState>;

  isPuzzleComplete(puzzle: TPuzzle, state: TState): boolean;

  calculateQuestionResult(params: {
    metadata: PuzzleMetadata;
    puzzle: TPuzzle;
    finalState: TState;
    elapsedMs: number;
    timedOut: boolean;
  }): QuestionResult;
}

export function getDifficultyMultiplier(difficulty: Difficulty): number {
  const norm = normalizeDifficulty(difficulty);
  switch (norm) {
    case 'beginner':
      return 0.9;
    case 'easy':
      return 1.0;
    case 'intermediate':
      return 1.25;
    case 'advanced':
      return 1.5;
    case 'expert':
      return 1.75;
    case 'adaptive':
      return 1.35;
  }
}

export function determineTimeoutStatus(
  elapsedMs: number,
  timeLimitMs: number,
  timedOut: boolean
): TimeoutStatus {
  if (timedOut || elapsedMs >= timeLimitMs) return 'timed-out';
  if (elapsedMs >= timeLimitMs * 0.8) return 'near-timeout';
  return 'within-limit';
}

export function computeQuestionScore(params: {
  isCorrect: boolean;
  partialCredit: number;
  difficulty: Difficulty;
  elapsedMs: number;
  timeLimitMs: number;
  mistakesCount: number;
  strictOrderPenalty?: boolean;
  enablePartialCredit?: boolean;
}): {
  scoreEarned: number;
  maxPossibleScore: number;
  speedBonus: number;
  precisionBonus: number;
} {
  const mult = getDifficultyMultiplier(params.difficulty);
  const baseMax = Math.round(100 * mult);
  const speedMax = Math.round(40 * mult);
  const precisionMax = Math.round(20 * mult);
  const maxPossibleScore = baseMax + speedMax + precisionMax;

  const allowPartial = params.enablePartialCredit !== false;
  const effectivePartial = allowPartial ? params.partialCredit : 0;

  if (!params.isCorrect && effectivePartial <= 0) {
    return {
      scoreEarned: 0,
      maxPossibleScore,
      speedBonus: 0,
      precisionBonus: 0,
    };
  }

  const credit = params.isCorrect ? 1 : Math.max(0, Math.min(0.85, effectivePartial));
  const baseEarned = Math.round(baseMax * credit);

  const timeRatio = Math.max(0, Math.min(1, 1 - params.elapsedMs / Math.max(1000, params.timeLimitMs)));
  const speedBonus = params.isCorrect
    ? Math.round(speedMax * timeRatio)
    : Math.round(speedMax * timeRatio * 0.35);

  const mistakePenaltyFactor = params.strictOrderPenalty ? 0.5 : 0.35;
  const precisionFactor = Math.max(0, 1 - params.mistakesCount * mistakePenaltyFactor);
  const precisionBonus = params.isCorrect ? Math.round(precisionMax * precisionFactor) : 0;

  const scoreEarned = Math.min(maxPossibleScore, Math.max(0, baseEarned + speedBonus + precisionBonus));

  return {
    scoreEarned,
    maxPossibleScore,
    speedBonus,
    precisionBonus,
  };
}

export function aggregateSessionScore(
  results: readonly QuestionResult[],
  configuredQuestionCount?: number
): SessionScore {
  const totalConfigured = configuredQuestionCount ?? results.length;
  if (results.length === 0) {
    return {
      totalScore: 0,
      maxPossibleScore: 100,
      NormalizedScore: 0,
      accuracyPercent: 0,
      correctCount: 0,
      incorrectCount: 0,
      timeoutCount: 0,
      totalQuestions: totalConfigured,
      questionsAttempted: 0,
      questionsRemaining: totalConfigured,
      averageResponseMs: 0,
      totalElapsedMs: 0,
      streakBest: 0,
      speedBonusTotal: 0,
      precisionBonusTotal: 0,
    };
  }

  let totalScore = 0;
  let maxPossibleScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let timeoutCount = 0;
  let totalElapsedMs = 0;
  let currentStreak = 0;
  let streakBest = 0;
  let speedBonusTotal = 0;
  let precisionBonusTotal = 0;

  for (const r of results) {
    totalScore += r.scoreEarned;
    maxPossibleScore += r.maxPossibleScore;
    totalElapsedMs += r.elapsedMs;

    if (r.timeoutStatus === 'timed-out') {
      timeoutCount += 1;
    }

    if (r.isCorrect) {
      correctCount += 1;
      currentStreak += 1;
      if (currentStreak > streakBest) streakBest = currentStreak;
    } else {
      incorrectCount += 1;
      currentStreak = 0;
    }

    const breakdown = computeQuestionScore({
      isCorrect: r.isCorrect,
      partialCredit: r.partialCredit,
      difficulty: r.difficulty,
      elapsedMs: r.elapsedMs,
      timeLimitMs: r.timeLimitMs,
      mistakesCount: r.mistakesCount,
    });
    speedBonusTotal += breakdown.speedBonus;
    precisionBonusTotal += breakdown.precisionBonus;
  }

  const totalQuestions = Math.max(results.length, totalConfigured);
  const accuracyPercent = Math.round((correctCount / results.length) * 100);
  const averageResponseMs = Math.round(totalElapsedMs / results.length);
  const NormalizedScore =
    maxPossibleScore > 0
      ? Math.min(1000, Math.max(0, Math.round((totalScore / maxPossibleScore) * 1000)))
      : 0;

  return {
    totalScore,
    maxPossibleScore,
    NormalizedScore,
    accuracyPercent,
    correctCount,
    incorrectCount,
    timeoutCount,
    totalQuestions,
    questionsAttempted: results.length,
    questionsRemaining: Math.max(0, totalQuestions - results.length),
    averageResponseMs,
    totalElapsedMs,
    streakBest,
    speedBonusTotal,
    precisionBonusTotal,
  };
}

export function resolveEffectiveDifficulty(
  configured: Difficulty,
  questionIndex: number,
  recentResults?: readonly QuestionResult[]
): CanonicalDifficulty {
  const norm = normalizeDifficulty(configured);
  if (norm !== 'adaptive') return norm;

  const ladder: CanonicalDifficulty[] = ['beginner', 'easy', 'intermediate', 'advanced', 'expert'];

  if (!recentResults || recentResults.length === 0) {
    const idx = Math.min(ladder.length - 1, Math.floor(questionIndex / 2));
    return ladder[idx];
  }

  const lastTwo = recentResults.slice(-2);
  const allCorrectFast = lastTwo.every((r) => r.isCorrect && r.elapsedMs < r.timeLimitMs * 0.55);
  const allCorrect = lastTwo.every((r) => r.isCorrect);
  const anyFailed = lastTwo.some((r) => !r.isCorrect);

  if (allCorrectFast && questionIndex >= 4) return 'expert';
  if (allCorrect && questionIndex >= 2) return 'advanced';
  if (anyFailed && questionIndex < 2) return 'beginner';
  if (anyFailed) return 'easy';
  return 'intermediate';
}
