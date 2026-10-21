import {
  normalizeDifficulty,
  type ActiveAssessmentSnapshot,
  type AppSettings,
  type ArchetypeAccuracySummary,
  type AssessmentOrchestratorMode,
  type CanonicalDifficulty,
  type CognitiveErrorCategory,
  type Difficulty,
  type EvaluationMode,
  type GamePerformanceSummary,
  type GameType,
  type HistoricalPerformance,
  type PersistedLabStoreV1,
  type QuestionResult,
  type RouteQualityClassification,
  type SessionMode,
  type SessionRecord,
  type SessionScore,
  type SessionStatus,
  type TimeoutStatus,
  type AssessmentUserSession,
} from '../types/domain.ts';

export const STORAGE_KEY = 'cognitive_games_lab_store_v1';
export const ACTIVE_ASSESSMENT_STORAGE_KEY = 'cognitive_games_lab_active_assessment_v1';
export const PLAYER_SESSION_STORAGE_KEY = 'assessment_user_session';
export const CURRENT_SCHEMA_VERSION = 1;

export interface StorageOperationResult<T> {
  ok: boolean;
  data: T;
  warning?: string;
  storageAvailable: boolean;
}

const VALID_GAME_TYPES: readonly GameType[] = ['math-bubbles', 'memory-maze', 'path-rotation'];
const VALID_DIFFICULTIES: readonly Difficulty[] = [
  'beginner',
  'easy',
  'intermediate',
  'advanced',
  'expert',
  'adaptive',
  'medium',
  'hard',
];
const VALID_MODES: readonly SessionMode[] = [
  'standalone',
  'practice',
  'exam',
  'assessment',
  'free-practice',
  'single-game-challenge',
  'mixed-practice',
  'full-timed-assessment',
  'custom-assessment',
];
const VALID_ORCHESTRATOR_MODES: readonly AssessmentOrchestratorMode[] = [
  'free-practice',
  'single-game-challenge',
  'mixed-practice',
  'full-timed-assessment',
  'custom-assessment',
];
const VALID_EVAL_MODES: readonly EvaluationMode[] = ['practice', 'exam'];
const VALID_STATUSES: readonly SessionStatus[] = [
  'idle',
  'configuring',
  'instructions',
  'in-progress',
  'paused',
  'completed',
  'abandoned',
];
const VALID_TIMEOUT_STATUSES: readonly TimeoutStatus[] = ['within-limit', 'near-timeout', 'timed-out'];
const VALID_ROUTE_QUALITIES: readonly RouteQualityClassification[] = [
  'minimum-rotation-optimal',
  'shortest-valid-route',
  'valid-non-optimal',
  'invalid-disconnected',
];

export function getDefaultSettings(): AppSettings {
  return {
    defaultDifficulty: 'intermediate',
    defaultEvaluationMode: 'practice',
    defaultMathBubbleTimerSeconds: 15,
    defaultAssessmentDurationMinutes: 20,
    defaultSessionLength: 10,
    soundEnabled: true,
    reducedMotion: false,
    showTimerCountdown: true,
    keyboardHintsVisible: true,
    autoAdvanceOnComplete: true,
    practiceRules: {
      allowUndo: true,
      showLiveValidation: true,
      strictOrderPenalty: false,
      enablePartialCredit: true,
      autoSubmitOnTimeout: true,
      suspendTimerOnInactiveTab: true,
    },
  };
}

export function getDefaultStore(): PersistedLabStoreV1 {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAtIso: new Date().toISOString(),
    settings: getDefaultSettings(),
    sessions: [],
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function isStorageAvailable(storage?: StorageLike | null): boolean {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return false;
  try {
    const probeKey = '__cgl_storage_probe__';
    target.setItem(probeKey, '1');
    target.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

export function validateSettings(raw: unknown): AppSettings {
  const defaults = getDefaultSettings();
  if (!isObject(raw)) return defaults;

  const rawDiff = VALID_DIFFICULTIES.includes(raw.defaultDifficulty as Difficulty)
    ? normalizeDifficulty(raw.defaultDifficulty as Difficulty)
    : defaults.defaultDifficulty;

  const defaultEvaluationMode = VALID_EVAL_MODES.includes(raw.defaultEvaluationMode as EvaluationMode)
    ? (raw.defaultEvaluationMode as EvaluationMode)
    : defaults.defaultEvaluationMode;

  const defaultMathBubbleTimerSeconds = isFiniteNumber(raw.defaultMathBubbleTimerSeconds)
    ? Math.max(5, Math.min(120, Math.round(raw.defaultMathBubbleTimerSeconds)))
    : defaults.defaultMathBubbleTimerSeconds;

  const defaultAssessmentDurationMinutes = isFiniteNumber(raw.defaultAssessmentDurationMinutes)
    ? Math.max(5, Math.min(60, Math.round(raw.defaultAssessmentDurationMinutes)))
    : defaults.defaultAssessmentDurationMinutes;

  const defaultSessionLength = isFiniteNumber(raw.defaultSessionLength)
    ? Math.max(1, Math.min(100, Math.round(raw.defaultSessionLength)))
    : defaults.defaultSessionLength;

  const practiceRaw = isObject(raw.practiceRules) ? raw.practiceRules : {};

  return {
    defaultDifficulty: rawDiff as CanonicalDifficulty,
    defaultEvaluationMode,
    defaultMathBubbleTimerSeconds,
    defaultAssessmentDurationMinutes,
    defaultSessionLength,
    soundEnabled: typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : defaults.soundEnabled,
    reducedMotion: typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : defaults.reducedMotion,
    showTimerCountdown:
      typeof raw.showTimerCountdown === 'boolean' ? raw.showTimerCountdown : defaults.showTimerCountdown,
    keyboardHintsVisible:
      typeof raw.keyboardHintsVisible === 'boolean' ? raw.keyboardHintsVisible : defaults.keyboardHintsVisible,
    autoAdvanceOnComplete:
      typeof raw.autoAdvanceOnComplete === 'boolean' ? raw.autoAdvanceOnComplete : defaults.autoAdvanceOnComplete,
    practiceRules: {
      allowUndo:
        typeof practiceRaw.allowUndo === 'boolean' ? practiceRaw.allowUndo : defaults.practiceRules.allowUndo,
      showLiveValidation:
        typeof practiceRaw.showLiveValidation === 'boolean'
          ? practiceRaw.showLiveValidation
          : defaults.practiceRules.showLiveValidation,
      strictOrderPenalty:
        typeof practiceRaw.strictOrderPenalty === 'boolean'
          ? practiceRaw.strictOrderPenalty
          : defaults.practiceRules.strictOrderPenalty,
      enablePartialCredit:
        typeof practiceRaw.enablePartialCredit === 'boolean'
          ? practiceRaw.enablePartialCredit
          : defaults.practiceRules.enablePartialCredit,
      autoSubmitOnTimeout:
        typeof practiceRaw.autoSubmitOnTimeout === 'boolean'
          ? practiceRaw.autoSubmitOnTimeout
          : defaults.practiceRules.autoSubmitOnTimeout,
      suspendTimerOnInactiveTab:
        typeof practiceRaw.suspendTimerOnInactiveTab === 'boolean'
          ? practiceRaw.suspendTimerOnInactiveTab
          : defaults.practiceRules.suspendTimerOnInactiveTab,
    },
  };
}

function validateQuestionResult(raw: unknown): QuestionResult | null {
  if (!isObject(raw)) return null;
  if (typeof raw.puzzleId !== 'string' || !raw.puzzleId) return null;
  if (!VALID_GAME_TYPES.includes(raw.gameType as GameType)) return null;
  if (typeof raw.archetypeId !== 'string' || typeof raw.archetypeTitle !== 'string') return null;
  if (!VALID_DIFFICULTIES.includes(raw.difficulty as Difficulty)) return null;
  if (typeof raw.seed !== 'string') return null;
  if (!isFiniteNumber(raw.questionIndex)) return null;
  if (typeof raw.isCorrect !== 'boolean') return null;
  if (!isFiniteNumber(raw.partialCredit)) return null;
  if (!isFiniteNumber(raw.scoreEarned) || !isFiniteNumber(raw.maxPossibleScore)) return null;
  if (!isFiniteNumber(raw.elapsedMs) || !isFiniteNumber(raw.timeLimitMs)) return null;
  const timeoutStatus = VALID_TIMEOUT_STATUSES.includes(raw.timeoutStatus as TimeoutStatus)
    ? (raw.timeoutStatus as TimeoutStatus)
    : 'within-limit';

  return {
    puzzleId: raw.puzzleId,
    gameType: raw.gameType as GameType,
    archetypeId: raw.archetypeId,
    archetypeTitle: raw.archetypeTitle,
    difficulty: raw.difficulty as Difficulty,
    seed: raw.seed,
    questionIndex: raw.questionIndex,
    isCorrect: raw.isCorrect,
    partialCredit: Math.max(0, Math.min(1, raw.partialCredit)),
    scoreEarned: Math.max(0, raw.scoreEarned),
    maxPossibleScore: Math.max(1, raw.maxPossibleScore),
    elapsedMs: Math.max(0, raw.elapsedMs),
    timeLimitMs: Math.max(1000, raw.timeLimitMs),
    timeoutStatus,
    attemptsCount: isFiniteNumber(raw.attemptsCount) ? Math.max(0, raw.attemptsCount) : 1,
    mistakesCount: isFiniteNumber(raw.mistakesCount) ? Math.max(0, raw.mistakesCount) : 0,
    hintsUsedCount: isFiniteNumber(raw.hintsUsedCount) ? Math.max(0, raw.hintsUsedCount) : undefined,
    rotationsCount: isFiniteNumber(raw.rotationsCount) ? Math.max(0, raw.rotationsCount) : undefined,
    flipsCount: isFiniteNumber(raw.flipsCount) ? Math.max(0, raw.flipsCount) : undefined,
    routeQuality: VALID_ROUTE_QUALITIES.includes(raw.routeQuality as RouteQualityClassification)
      ? (raw.routeQuality as RouteQualityClassification)
      : undefined,
    errorCategory: typeof raw.errorCategory === 'string' ? (raw.errorCategory as CognitiveErrorCategory) : undefined,
    summaryText: typeof raw.summaryText === 'string' ? raw.summaryText : '',
  };
}

function validateSessionScore(raw: unknown): SessionScore | null {
  if (!isObject(raw)) return null;
  if (!isFiniteNumber(raw.totalScore) || !isFiniteNumber(raw.maxPossibleScore)) return null;
  if (!isFiniteNumber(raw.NormalizedScore) || !isFiniteNumber(raw.accuracyPercent)) return null;
  if (!isFiniteNumber(raw.correctCount) || !isFiniteNumber(raw.totalQuestions)) return null;
  if (!isFiniteNumber(raw.averageResponseMs) || !isFiniteNumber(raw.totalElapsedMs)) return null;

  return {
    totalScore: Math.max(0, raw.totalScore),
    maxPossibleScore: Math.max(1, raw.maxPossibleScore),
    NormalizedScore: Math.max(0, Math.min(1000, Math.round(raw.NormalizedScore))),
    accuracyPercent: Math.max(0, Math.min(100, raw.accuracyPercent)),
    correctCount: Math.max(0, raw.correctCount),
    incorrectCount: isFiniteNumber(raw.incorrectCount) ? Math.max(0, raw.incorrectCount) : undefined,
    timeoutCount: isFiniteNumber(raw.timeoutCount) ? Math.max(0, raw.timeoutCount) : undefined,
    totalQuestions: Math.max(1, raw.totalQuestions),
    questionsAttempted: isFiniteNumber(raw.questionsAttempted) ? Math.max(0, raw.questionsAttempted) : undefined,
    questionsRemaining: isFiniteNumber(raw.questionsRemaining) ? Math.max(0, raw.questionsRemaining) : undefined,
    averageResponseMs: Math.max(0, raw.averageResponseMs),
    totalElapsedMs: Math.max(0, raw.totalElapsedMs),
    streakBest: isFiniteNumber(raw.streakBest) ? Math.max(0, raw.streakBest) : 0,
    speedBonusTotal: isFiniteNumber(raw.speedBonusTotal) ? Math.max(0, raw.speedBonusTotal) : 0,
    precisionBonusTotal: isFiniteNumber(raw.precisionBonusTotal) ? Math.max(0, raw.precisionBonusTotal) : 0,
  };
}

export function validateSessionRecord(raw: unknown): SessionRecord | null {
  if (!isObject(raw)) return null;
  if (typeof raw.sessionId !== 'string' || !raw.sessionId) return null;
  if (!VALID_MODES.includes(raw.mode as SessionMode)) return null;
  const isValidGameOrCombined =
    VALID_GAME_TYPES.includes(raw.gameType as GameType) || raw.gameType === 'combined-assessment';
  if (!isValidGameOrCombined) return null;
  const status = VALID_STATUSES.includes(raw.status as SessionStatus)
    ? (raw.status as SessionStatus)
    : 'completed';
  if (typeof raw.startedAtIso !== 'string' || typeof raw.completedAtIso !== 'string') return null;
  if (typeof raw.seed !== 'string' || !raw.seed) return null;
  if (!VALID_DIFFICULTIES.includes(raw.difficulty as Difficulty)) return null;

  const score = validateSessionScore(raw.score);
  if (!score) return null;

  if (!Array.isArray(raw.questionResults)) return null;
  const questionResults: QuestionResult[] = [];
  for (const item of raw.questionResults) {
    const validated = validateQuestionResult(item);
    if (validated) questionResults.push(validated);
  }

  const rawConfig = isObject(raw.config) ? raw.config : {};
  const configGameType = VALID_GAME_TYPES.includes(rawConfig.gameType as GameType)
    ? (rawConfig.gameType as GameType)
    : raw.gameType === 'combined-assessment'
    ? 'math-bubbles'
    : (raw.gameType as GameType);

  return {
    sessionId: raw.sessionId,
    mode: raw.mode as SessionMode,
    orchestratorMode: VALID_ORCHESTRATOR_MODES.includes(raw.orchestratorMode as AssessmentOrchestratorMode)
      ? (raw.orchestratorMode as AssessmentOrchestratorMode)
      : undefined,
    evaluationMode: VALID_EVAL_MODES.includes(raw.evaluationMode as EvaluationMode)
      ? (raw.evaluationMode as EvaluationMode)
      : 'practice',
    gameType: raw.gameType as GameType | 'combined-assessment',
    status,
    startedAtIso: raw.startedAtIso,
    completedAtIso: raw.completedAtIso,
    seed: raw.seed,
    difficulty: raw.difficulty as Difficulty,
    globalTimeLimitSeconds: isFiniteNumber(raw.globalTimeLimitSeconds)
      ? Math.max(10, raw.globalTimeLimitSeconds)
      : undefined,
    gameOrder: Array.isArray(raw.gameOrder)
      ? (raw.gameOrder.filter((g) => VALID_GAME_TYPES.includes(g as GameType)) as GameType[])
      : undefined,
    config: {
      gameType: configGameType,
      difficulty: raw.difficulty as Difficulty,
      evaluationMode: VALID_EVAL_MODES.includes(rawConfig.evaluationMode as EvaluationMode)
        ? (rawConfig.evaluationMode as EvaluationMode)
        : 'practice',
      questionCount: isFiniteNumber(rawConfig.questionCount)
        ? Math.max(1, rawConfig.questionCount)
        : Math.max(1, questionResults.length),
      timeLimitSeconds: isFiniteNumber(rawConfig.timeLimitSeconds) ? Math.max(5, rawConfig.timeLimitSeconds) : 150,
      perQuestionTimeSeconds: isFiniteNumber(rawConfig.perQuestionTimeSeconds)
        ? Math.max(5, rawConfig.perQuestionTimeSeconds)
        : 15,
      seed: raw.seed,
      archetypeId: typeof rawConfig.archetypeId === 'string' ? rawConfig.archetypeId : undefined,
      practiceRules: {
        allowUndo: true,
        showLiveValidation: true,
        strictOrderPenalty: false,
        enablePartialCredit: true,
        autoSubmitOnTimeout: true,
        suspendTimerOnInactiveTab: true,
      },
    },
    score,
    questionResults,
  };
}

export function migrateStoreToLatest(raw: unknown): {
  store: PersistedLabStoreV1;
  migrated: boolean;
  warning?: string;
} {
  if (!isObject(raw)) {
    return {
      store: getDefaultStore(),
      migrated: false,
      warning: 'Stored data was not a valid JSON object; initialized fresh store.',
    };
  }

  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;

  if (version === 0 || version === 1) {
    const settings = validateSettings(raw.settings);
    const rawSessions = Array.isArray(raw.sessions) ? raw.sessions : [];
    const validSessions: SessionRecord[] = [];
    let droppedCount = 0;

    for (const item of rawSessions) {
      const validated = validateSessionRecord(item);
      if (validated) {
        validSessions.push(validated);
      } else {
        droppedCount++;
      }
    }

    const warning =
      droppedCount > 0
        ? `Recovered store with ${droppedCount} malformed session record(s) skipped.`
        : version === 0
        ? 'Migrated legacy v0 store to schema v1.'
        : undefined;

    return {
      store: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        updatedAtIso: typeof raw.updatedAtIso === 'string' ? raw.updatedAtIso : new Date().toISOString(),
        settings,
        sessions: validSessions,
      },
      migrated: version === 0,
      warning,
    };
  }

  return {
    store: getDefaultStore(),
    migrated: false,
    warning: `Unsupported schema version (${String(version)}). Loaded safe defaults.`,
  };
}

export function loadPersistedStore(storage?: StorageLike | null): StorageOperationResult<PersistedLabStoreV1> {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  const available = isStorageAvailable(target);

  if (!available || !target) {
    return {
      ok: false,
      data: getDefaultStore(),
      warning:
        'Local storage is unavailable in this browser context. Progress will only persist for this tab session.',
      storageAvailable: false,
    };
  }

  try {
    const rawJson = target.getItem(STORAGE_KEY);
    if (!rawJson) {
      const fresh = getDefaultStore();
      return { ok: true, data: fresh, storageAvailable: true };
    }

    const parsed: unknown = JSON.parse(rawJson);
    const { store, warning } = migrateStoreToLatest(parsed);
    return {
      ok: true,
      data: store,
      warning,
      storageAvailable: true,
    };
  } catch {
    return {
      ok: false,
      data: getDefaultStore(),
      warning:
        'Stored progress data was corrupted and could not be parsed. Initialized a clean session store.',
      storageAvailable: true,
    };
  }
}

export function savePersistedStore(
  store: PersistedLabStoreV1,
  storage?: StorageLike | null
): StorageOperationResult<PersistedLabStoreV1> {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  const available = isStorageAvailable(target);

  const updated: PersistedLabStoreV1 = {
    ...store,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAtIso: new Date().toISOString(),
  };

  if (!available || !target) {
    return {
      ok: false,
      data: updated,
      warning: 'Unable to save to localStorage; storage is disabled or unavailable.',
      storageAvailable: false,
    };
  }

  try {
    target.setItem(STORAGE_KEY, JSON.stringify(updated));
    return { ok: true, data: updated, storageAvailable: true };
  } catch {
    return {
      ok: false,
      data: updated,
      warning:
        'Failed to write progress to localStorage (quota exceeded or write blocked). Running session continues in memory.',
      storageAvailable: false,
    };
  }
}

export function saveActiveAssessmentSnapshot(
  snapshot: ActiveAssessmentSnapshot | null,
  storage?: StorageLike | null
): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!isStorageAvailable(target) || !target) return;
  try {
    if (!snapshot) {
      target.removeItem(ACTIVE_ASSESSMENT_STORAGE_KEY);
    } else {
      target.setItem(ACTIVE_ASSESSMENT_STORAGE_KEY, JSON.stringify(snapshot));
    }
  } catch {
    // Ignore storage quota errors for transient snapshot
  }
}

export function loadActiveAssessmentSnapshot(
  storage?: StorageLike | null
): ActiveAssessmentSnapshot | null {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!isStorageAvailable(target) || !target) return null;
  try {
    const raw = target.getItem(ACTIVE_ASSESSMENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || typeof parsed.assessmentId !== 'string' || !Array.isArray(parsed.sequence)) {
      return null;
    }
    return parsed as unknown as ActiveAssessmentSnapshot;
  } catch {
    return null;
  }
}

export function exportStoreToJson(store: PersistedLabStoreV1): string {
  return JSON.stringify(
    {
      ...store,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAtIso: new Date().toISOString(),
      application: 'Cognitive Games Lab',
    },
    null,
    2
  );
}

export function importStoreFromJson(
  jsonString: string
): { ok: true; store: PersistedLabStoreV1; warning?: string } | { ok: false; error: string } {
  if (!jsonString || !jsonString.trim()) {
    return { ok: false, error: 'Import payload is empty.' };
  }
  try {
    const parsed: unknown = JSON.parse(jsonString);
    if (!isObject(parsed)) {
      return {
        ok: false,
        error: 'JSON root must be an object containing schemaVersion, settings, and sessions.',
      };
    }
    if (!('sessions' in parsed) && !('settings' in parsed)) {
      return { ok: false, error: 'JSON file does not match Cognitive Games Lab export schema.' };
    }
    const { store, warning } = migrateStoreToLatest(parsed);
    return { ok: true, store, warning };
  } catch {
    return { ok: false, error: 'Invalid JSON syntax. Please select a valid exported JSON file.' };
  }
}

export function computeHistoricalPerformance(sessions: readonly SessionRecord[]): HistoricalPerformance {
  const completedSessions = sessions.filter((s) => s.status === 'completed');

  const createEmptyGameSummary = (gameType: GameType): GamePerformanceSummary => ({
    gameType,
    sessionsCompleted: 0,
    questionsAnswered: 0,
    bestNormalizedScore: 0,
    averageNormalizedScore: 0,
    accuracyPercent: 0,
    averageResponseMs: 0,
    timeoutsCount: 0,
    lastPlayedIso: null,
    lastSessionId: null,
    archetypesMastered: [],
    accuracyByArchetype: {},
    errorCategoryCounts: {},
  });

  const byGame: Record<GameType, GamePerformanceSummary> = {
    'math-bubbles': createEmptyGameSummary('math-bubbles'),
    'memory-maze': createEmptyGameSummary('memory-maze'),
    'path-rotation': createEmptyGameSummary('path-rotation'),
  };

  if (completedSessions.length === 0) {
    return {
      totalSessionsCompleted: 0,
      totalQuestionsAnswered: 0,
      overallAccuracyPercent: 0,
      overallAverageResponseMs: 0,
      bestAssessmentScore: 0,
      lastSessionId: null,
      byGame,
    };
  }

  let totalQuestionsAnswered = 0;
  let totalCorrect = 0;
  let totalElapsedMs = 0;
  let bestAssessmentScore = 0;

  const sortedDesc = [...completedSessions].sort(
    (a, b) => new Date(b.completedAtIso).getTime() - new Date(a.completedAtIso).getTime()
  );

  const perGameNormSums: Record<GameType, number> = {
    'math-bubbles': 0,
    'memory-maze': 0,
    'path-rotation': 0,
  };
  const perGameCorrect: Record<GameType, number> = {
    'math-bubbles': 0,
    'memory-maze': 0,
    'path-rotation': 0,
  };
  const perGameElapsed: Record<GameType, number> = {
    'math-bubbles': 0,
    'memory-maze': 0,
    'path-rotation': 0,
  };
  const perGameArchetypes: Record<GameType, Set<string>> = {
    'math-bubbles': new Set(),
    'memory-maze': new Set(),
    'path-rotation': new Set(),
  };

  for (const session of sortedDesc) {
    if (
      session.mode === 'assessment' ||
      session.mode === 'full-timed-assessment' ||
      session.mode === 'custom-assessment' ||
      session.gameType === 'combined-assessment'
    ) {
      if (session.score.NormalizedScore > bestAssessmentScore) {
        bestAssessmentScore = session.score.NormalizedScore;
      }
    }

    if (session.gameType !== 'combined-assessment') {
      const gt = session.gameType;
      byGame[gt].sessionsCompleted += 1;
      perGameNormSums[gt] += session.score.NormalizedScore;
      if (session.score.NormalizedScore > byGame[gt].bestNormalizedScore) {
        byGame[gt].bestNormalizedScore = session.score.NormalizedScore;
      }
      if (!byGame[gt].lastPlayedIso) {
        byGame[gt].lastPlayedIso = session.completedAtIso;
        byGame[gt].lastSessionId = session.sessionId;
      }
    }

    for (const q of session.questionResults) {
      totalQuestionsAnswered += 1;
      if (q.isCorrect) totalCorrect += 1;
      totalElapsedMs += q.elapsedMs;

      const gt = q.gameType;
      byGame[gt].questionsAnswered += 1;
      if (q.timeoutStatus === 'timed-out') {
        byGame[gt].timeoutsCount += 1;
      }
      if (q.isCorrect) {
        perGameCorrect[gt] += 1;
        perGameArchetypes[gt].add(q.archetypeId);
      }
      perGameElapsed[gt] += q.elapsedMs;

      // Track accuracy by archetype
      const archMap = byGame[gt].accuracyByArchetype!;
      const existingArch: ArchetypeAccuracySummary = archMap[q.archetypeId] ?? {
        archetypeId: q.archetypeId,
        archetypeTitle: q.archetypeTitle,
        attempts: 0,
        correct: 0,
        accuracyPercent: 0,
        averageResponseMs: 0,
      };
      const newAttempts = existingArch.attempts + 1;
      const newCorrect = existingArch.correct + (q.isCorrect ? 1 : 0);
      const newAvgMs = Math.round(
        (existingArch.averageResponseMs * existingArch.attempts + q.elapsedMs) / newAttempts
      );
      archMap[q.archetypeId] = {
        archetypeId: q.archetypeId,
        archetypeTitle: q.archetypeTitle,
        attempts: newAttempts,
        correct: newCorrect,
        accuracyPercent: Math.round((newCorrect / newAttempts) * 100),
        averageResponseMs: newAvgMs,
      };

      // Track error categories
      if (q.errorCategory && q.errorCategory !== 'none') {
        const errCounts = byGame[gt].errorCategoryCounts!;
        errCounts[q.errorCategory] = (errCounts[q.errorCategory] ?? 0) + 1;
      }

      if (session.gameType === 'combined-assessment') {
        if (!byGame[gt].lastPlayedIso) {
          byGame[gt].lastPlayedIso = session.completedAtIso;
          byGame[gt].lastSessionId = session.sessionId;
        }
      }
    }
  }

  for (const gt of VALID_GAME_TYPES) {
    const summary = byGame[gt];
    if (summary.sessionsCompleted > 0) {
      summary.averageNormalizedScore = Math.round(perGameNormSums[gt] / summary.sessionsCompleted);
    } else if (summary.questionsAnswered > 0) {
      const ratio = perGameCorrect[gt] / summary.questionsAnswered;
      summary.averageNormalizedScore = Math.round(ratio * 1000);
      summary.bestNormalizedScore = summary.averageNormalizedScore;
    }

    if (summary.questionsAnswered > 0) {
      summary.accuracyPercent = Math.round((perGameCorrect[gt] / summary.questionsAnswered) * 100);
      summary.averageResponseMs = Math.round(perGameElapsed[gt] / summary.questionsAnswered);
    }
    summary.archetypesMastered = Array.from(perGameArchetypes[gt]);
  }

  return {
    totalSessionsCompleted: completedSessions.length,
    totalQuestionsAnswered,
    overallAccuracyPercent:
      totalQuestionsAnswered > 0 ? Math.round((totalCorrect / totalQuestionsAnswered) * 100) : 0,
    overallAverageResponseMs:
      totalQuestionsAnswered > 0 ? Math.round(totalElapsedMs / totalQuestionsAnswered) : 0,
    bestAssessmentScore,
    lastSessionId: sortedDesc[0]?.sessionId ?? null,
    byGame,
  };
}

/**
 * Validates a player's display name according to onboarding rules:
 * - Auto-trim leading and trailing whitespace
 * - Disallow purely blank/whitespace submissions
 * - Minimum 2 characters, maximum 25 characters
 */
export function validatePlayerName(rawInput: string): {
  valid: boolean;
  trimmedName: string;
  error?: string;
} {
  const trimmedName = (rawInput ?? '').trim();
  if (trimmedName.length === 0) {
    return {
      valid: false,
      trimmedName,
      error: 'Please enter your name (cannot be blank or whitespace only).',
    };
  }
  if (trimmedName.length < 2) {
    return {
      valid: false,
      trimmedName,
      error: 'Name must be at least 2 characters long.',
    };
  }
  if (trimmedName.length > 25) {
    return {
      valid: false,
      trimmedName,
      error: 'Name must be 25 characters or fewer.',
    };
  }
  return { valid: true, trimmedName };
}

export function createPlayerSessionProfile(
  rawName: string,
  nowIso: string = new Date().toISOString()
): AssessmentUserSession {
  const { trimmedName } = validatePlayerName(rawName);
  return {
    playerName: trimmedName || 'Player',
    createdAt: nowIso,
    lastActive: nowIso,
    gameStats: {
      quickFireMath: {
        gamesPlayed: 0,
        highScore: 0,
        history: [],
      },
      memoryMaze: {
        gamesPlayed: 0,
        wallHitsTotal: 0,
        history: [],
      },
      pathFinder: {
        gamesPlayed: 0,
        bestMoves: null,
        history: [],
      },
    },
  };
}

export function loadPlayerSessionProfile(
  storage?: StorageLike | null
): AssessmentUserSession | null {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target || !isStorageAvailable(target)) return null;

  try {
    const raw = target.getItem(PLAYER_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || typeof parsed.playerName !== 'string') return null;

    const nameCheck = validatePlayerName(parsed.playerName);
    if (!nameCheck.valid) return null;

    const nowIso = new Date().toISOString();
    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : nowIso;
    const lastActive = typeof parsed.lastActive === 'string' ? parsed.lastActive : nowIso;
    const rawStats = isObject(parsed.gameStats) ? parsed.gameStats : {};

    const rawMath = isObject(rawStats.quickFireMath) ? rawStats.quickFireMath : {};
    const rawMaze = isObject(rawStats.memoryMaze) ? rawStats.memoryMaze : {};
    const rawPath = isObject(rawStats.pathFinder) ? rawStats.pathFinder : {};

    return {
      playerName: nameCheck.trimmedName,
      createdAt,
      lastActive,
      gameStats: {
        quickFireMath: {
          gamesPlayed: isFiniteNumber(rawMath.gamesPlayed)
            ? Math.max(0, Math.round(rawMath.gamesPlayed))
            : 0,
          highScore: isFiniteNumber(rawMath.highScore)
            ? Math.max(0, Math.round(rawMath.highScore))
            : 0,
          history: Array.isArray(rawMath.history) ? rawMath.history : [],
        },
        memoryMaze: {
          gamesPlayed: isFiniteNumber(rawMaze.gamesPlayed)
            ? Math.max(0, Math.round(rawMaze.gamesPlayed))
            : 0,
          wallHitsTotal: isFiniteNumber(rawMaze.wallHitsTotal)
            ? Math.max(0, Math.round(rawMaze.wallHitsTotal))
            : 0,
          history: Array.isArray(rawMaze.history) ? rawMaze.history : [],
        },
        pathFinder: {
          gamesPlayed: isFiniteNumber(rawPath.gamesPlayed)
            ? Math.max(0, Math.round(rawPath.gamesPlayed))
            : 0,
          bestMoves:
            isFiniteNumber(rawPath.bestMoves) && rawPath.bestMoves >= 0
              ? Math.round(rawPath.bestMoves)
              : null,
          history: Array.isArray(rawPath.history) ? rawPath.history : [],
        },
      },
    };
  } catch {
    return null;
  }
}

export function savePlayerSessionProfile(
  profile: AssessmentUserSession,
  storage?: StorageLike | null
): AssessmentUserSession {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  const updated: AssessmentUserSession = {
    ...profile,
    playerName: profile.playerName.trim(),
    lastActive: new Date().toISOString(),
  };
  if (target && isStorageAvailable(target)) {
    try {
      target.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage quota errors
    }
  }
  return updated;
}

export function clearPlayerSessionProfile(storage?: StorageLike | null): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target || !isStorageAvailable(target)) return;
  try {
    target.removeItem(PLAYER_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function updatePlayerSessionWithRecord(
  currentProfile: AssessmentUserSession | null,
  session: SessionRecord,
  storage?: StorageLike | null
): AssessmentUserSession | null {
  if (!currentProfile) return null;

  const nowIso = session.completedAtIso || new Date().toISOString();
  const next: AssessmentUserSession = {
    ...currentProfile,
    lastActive: nowIso,
    gameStats: {
      quickFireMath: {
        ...currentProfile.gameStats.quickFireMath,
        history: [...currentProfile.gameStats.quickFireMath.history],
      },
      memoryMaze: {
        ...currentProfile.gameStats.memoryMaze,
        history: [...currentProfile.gameStats.memoryMaze.history],
      },
      pathFinder: {
        ...currentProfile.gameStats.pathFinder,
        history: [...currentProfile.gameStats.pathFinder.history],
      },
    },
  };

  const mathQuestions = session.questionResults.filter((q) => q.gameType === 'math-bubbles');
  const mazeQuestions = session.questionResults.filter((q) => q.gameType === 'memory-maze');
  const pathQuestions = session.questionResults.filter((q) => q.gameType === 'path-rotation');

  if (session.gameType === 'math-bubbles' || mathQuestions.length > 0) {
    const mathScore =
      session.gameType === 'math-bubbles'
        ? session.score.NormalizedScore
        : Math.round(mathQuestions.reduce((acc, q) => acc + q.scoreEarned, 0));
    const mathCorrect = mathQuestions.filter((q) => q.isCorrect).length;
    const mathAcc =
      mathQuestions.length > 0 ? Math.round((mathCorrect / mathQuestions.length) * 100) : 0;

    next.gameStats.quickFireMath.gamesPlayed += 1;
    next.gameStats.quickFireMath.highScore = Math.max(
      next.gameStats.quickFireMath.highScore,
      mathScore
    );
    next.gameStats.quickFireMath.history.unshift({
      sessionId: session.sessionId,
      playedAt: nowIso,
      score: mathScore,
      accuracyPercent: mathAcc,
      correctCount: mathCorrect,
      totalQuestions: mathQuestions.length,
      difficulty: session.difficulty,
    });
  }

  if (session.gameType === 'memory-maze' || mazeQuestions.length > 0) {
    const mazeScore =
      session.gameType === 'memory-maze'
        ? session.score.NormalizedScore
        : Math.round(mazeQuestions.reduce((acc, q) => acc + q.scoreEarned, 0));
    const wallHits = mazeQuestions.reduce((acc, q) => acc + (q.mistakesCount || 0), 0);
    const mazeCorrect = mazeQuestions.filter((q) => q.isCorrect).length;
    const mazeAcc =
      mazeQuestions.length > 0 ? Math.round((mazeCorrect / mazeQuestions.length) * 100) : 0;

    next.gameStats.memoryMaze.gamesPlayed += 1;
    next.gameStats.memoryMaze.wallHitsTotal += wallHits;
    next.gameStats.memoryMaze.history.unshift({
      sessionId: session.sessionId,
      playedAt: nowIso,
      score: mazeScore,
      wallHits,
      accuracyPercent: mazeAcc,
      difficulty: session.difficulty,
    });
  }

  if (session.gameType === 'path-rotation' || pathQuestions.length > 0) {
    const pathScore =
      session.gameType === 'path-rotation'
        ? session.score.NormalizedScore
        : Math.round(pathQuestions.reduce((acc, q) => acc + q.scoreEarned, 0));
    const totalMoves = pathQuestions.reduce((acc, q) => acc + Math.max(1, q.attemptsCount || 0), 0);
    const pathCorrect = pathQuestions.filter((q) => q.isCorrect).length;
    const pathAcc =
      pathQuestions.length > 0 ? Math.round((pathCorrect / pathQuestions.length) * 100) : 0;

    next.gameStats.pathFinder.gamesPlayed += 1;
    if (totalMoves > 0) {
      next.gameStats.pathFinder.bestMoves =
        next.gameStats.pathFinder.bestMoves === null
          ? totalMoves
          : Math.min(next.gameStats.pathFinder.bestMoves, totalMoves);
    }
    next.gameStats.pathFinder.history.unshift({
      sessionId: session.sessionId,
      playedAt: nowIso,
      score: pathScore,
      moves: totalMoves,
      accuracyPercent: pathAcc,
      difficulty: session.difficulty,
    });
  }

  return savePlayerSessionProfile(next, storage);
}

export type InstructionGameId = 'quick_fire_math' | 'memory_maze' | 'path_finder';

const INSTRUCTION_KEY_ALIASES: Record<InstructionGameId, readonly string[]> = {
  quick_fire_math: ['hide_instructions_quick_fire_math', 'hide_instructions_math-bubbles'],
  memory_maze: ['hide_instructions_memory_maze', 'hide_instructions_memory-maze'],
  path_finder: ['hide_instructions_path_finder', 'hide_instructions_path-rotation'],
};

export function getInstructionStorageKey(gameId: InstructionGameId): string {
  return `hide_instructions_${gameId}`;
}

export function shouldHideGameInstructions(
  gameId: InstructionGameId,
  storage?: StorageLike | null
): boolean {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target || !isStorageAvailable(target)) return false;
  try {
    const keys = INSTRUCTION_KEY_ALIASES[gameId] ?? [getInstructionStorageKey(gameId)];
    return keys.some((k) => target.getItem(k) === 'true');
  } catch {
    return false;
  }
}

export function setHideGameInstructions(
  gameId: InstructionGameId,
  hide: boolean,
  storage?: StorageLike | null
): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target || !isStorageAvailable(target)) return;
  try {
    const primaryKey = getInstructionStorageKey(gameId);
    if (hide) {
      target.setItem(primaryKey, 'true');
    } else {
      for (const k of INSTRUCTION_KEY_ALIASES[gameId] ?? [primaryKey]) {
        target.removeItem(k);
      }
    }
  } catch {
    // ignore storage errors
  }
}


