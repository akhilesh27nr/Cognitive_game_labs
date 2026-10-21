import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
  computeHistoricalPerformance,
  exportStoreToJson,
  getDefaultStore,
  importStoreFromJson,
  loadActiveAssessmentSnapshot,
  loadPersistedStore,
  migrateStoreToLatest,
  saveActiveAssessmentSnapshot,
  savePersistedStore,
  type StorageLike,
} from './persistence.ts';
import type { ActiveAssessmentSnapshot, SessionRecord } from '../types/domain.ts';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  public throwOnWrite = false;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.throwOnWrite) {
      throw new Error('QuotaExceededError');
    }
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function createSampleSession(id: string): SessionRecord {
  return {
    sessionId: id,
    mode: 'standalone',
    evaluationMode: 'practice',
    gameType: 'math-bubbles',
    status: 'completed',
    startedAtIso: '2026-10-18T10:00:00.000Z',
    completedAtIso: '2026-10-18T10:03:00.000Z',
    seed: 'MB-SEED01',
    difficulty: 'intermediate',
    config: {
      gameType: 'math-bubbles',
      difficulty: 'intermediate',
      evaluationMode: 'practice',
      questionCount: 2,
      timeLimitSeconds: 30,
      perQuestionTimeSeconds: 15,
      seed: 'MB-SEED01',
      practiceRules: {
        allowUndo: true,
        showLiveValidation: true,
        strictOrderPenalty: false,
      },
    },
    score: {
      totalScore: 280,
      maxPossibleScore: 320,
      NormalizedScore: 875,
      accuracyPercent: 100,
      correctCount: 2,
      incorrectCount: 0,
      timeoutCount: 0,
      totalQuestions: 2,
      questionsAttempted: 2,
      questionsRemaining: 0,
      averageResponseMs: 4200,
      totalElapsedMs: 8400,
      streakBest: 2,
      speedBonusTotal: 45,
      precisionBonusTotal: 35,
    },
    questionResults: [
      {
        puzzleId: 'mb-1',
        gameType: 'math-bubbles',
        archetypeId: 'mb-01',
        archetypeTitle: 'MB-01 · Addition of Integers',
        difficulty: 'intermediate',
        seed: 'MB-SEED01::q0',
        questionIndex: 0,
        isCorrect: true,
        partialCredit: 1,
        scoreEarned: 140,
        maxPossibleScore: 160,
        elapsedMs: 4000,
        timeLimitMs: 15000,
        timeoutStatus: 'within-limit',
        attemptsCount: 3,
        mistakesCount: 0,
        errorCategory: 'none',
        summaryText: 'Ordered 3 bubbles',
      },
      {
        puzzleId: 'mb-2',
        gameType: 'math-bubbles',
        archetypeId: 'mb-02',
        archetypeTitle: 'MB-02 · Subtraction of Integers',
        difficulty: 'intermediate',
        seed: 'MB-SEED01::q1',
        questionIndex: 1,
        isCorrect: true,
        partialCredit: 1,
        scoreEarned: 140,
        maxPossibleScore: 160,
        elapsedMs: 4400,
        timeLimitMs: 15000,
        timeoutStatus: 'within-limit',
        attemptsCount: 3,
        mistakesCount: 0,
        errorCategory: 'none',
        summaryText: 'Ordered 3 bubbles',
      },
    ],
  };
}

test('loadPersistedStore returns clean default store when storage is empty', () => {
  const mem = new MemoryStorage();
  const res = loadPersistedStore(mem);
  assert.equal(res.ok, true);
  assert.equal(res.storageAvailable, true);
  assert.equal(res.data.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(res.data.sessions.length, 0);
  assert.equal(res.data.settings.defaultMathBubbleTimerSeconds, 15);
  assert.equal(res.data.settings.defaultAssessmentDurationMinutes, 20);
});

test('savePersistedStore and loadPersistedStore round-trip sessions and settings', () => {
  const mem = new MemoryStorage();
  const store = getDefaultStore();
  store.settings.defaultDifficulty = 'advanced';
  store.sessions.push(createSampleSession('s-101'));

  const saved = savePersistedStore(store, mem);
  assert.equal(saved.ok, true);

  const loaded = loadPersistedStore(mem);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.data.settings.defaultDifficulty, 'advanced');
  assert.equal(loaded.data.sessions.length, 1);
  assert.equal(loaded.data.sessions[0].sessionId, 's-101');
});

test('loadPersistedStore recovers safely from malformed JSON', () => {
  const mem = new MemoryStorage();
  mem.setItem(STORAGE_KEY, '{corrupted-json');
  const loaded = loadPersistedStore(mem);
  assert.equal(loaded.ok, false);
  assert.equal(loaded.data.sessions.length, 0);
  assert.equal(typeof loaded.warning, 'string');
});

test('savePersistedStore handles QuotaExceededError gracefully with in-memory fallback warning', () => {
  const mem = new MemoryStorage();
  mem.throwOnWrite = true;
  const store = getDefaultStore();
  store.sessions.push(createSampleSession('quota-test-1'));

  const res = savePersistedStore(store, mem);
  assert.equal(res.ok, false);
  assert.equal(res.storageAvailable, false);
  assert.equal(typeof res.warning, 'string');
  assert.equal(res.data.sessions.length, 1);
});

test('migrateStoreToLatest upgrades v0 unversioned store and normalizes legacy difficulty aliases', () => {
  const rawV0 = {
    settings: { defaultDifficulty: 'hard', soundEnabled: false },
    sessions: [createSampleSession('valid-1'), { invalid: true }],
  };
  const migrated = migrateStoreToLatest(rawV0);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.store.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.store.settings.defaultDifficulty, 'advanced');
  assert.equal(migrated.store.settings.soundEnabled, false);
  assert.equal(migrated.store.sessions.length, 1);
  assert.equal(migrated.store.sessions[0].sessionId, 'valid-1');
});

test('exportStoreToJson and importStoreFromJson validate and restore store', () => {
  const store = getDefaultStore();
  store.sessions.push(createSampleSession('exp-1'));
  const json = exportStoreToJson(store);

  const imported = importStoreFromJson(json);
  assert.equal(imported.ok, true);
  if (imported.ok) {
    assert.equal(imported.store.sessions.length, 1);
    assert.equal(imported.store.sessions[0].sessionId, 'exp-1');
  }

  const badImport = importStoreFromJson('not json');
  assert.equal(badImport.ok, false);

  const emptyObjImport = importStoreFromJson(JSON.stringify({ unrelated: 123 }));
  assert.equal(emptyObjImport.ok, false);
});

test('saveActiveAssessmentSnapshot and loadActiveAssessmentSnapshot round-trip and clear cleanly', () => {
  const mem = new MemoryStorage();
  const snap: ActiveAssessmentSnapshot = {
    assessmentId: 'snap-1',
    orchestratorMode: 'custom-assessment',
    evaluationMode: 'practice',
    difficulty: 'intermediate',
    seed: 'ASSESS-101',
    startedAtIso: '2026-10-18T10:00:00.000Z',
    globalTimeLimitSeconds: 1200,
    elapsedGlobalSeconds: 140,
    currentItemIndex: 1,
    sequence: [
      {
        globalIndex: 0,
        stageNumber: 1,
        gameType: 'math-bubbles',
        stageQuestionIndex: 0,
        uniqueInstanceKey: 'ASSESS-101::0',
      },
    ],
    questionResults: createSampleSession('s-snap').questionResults,
  };

  saveActiveAssessmentSnapshot(snap, mem);
  const loaded = loadActiveAssessmentSnapshot(mem);
  assert.ok(loaded);
  assert.equal(loaded?.assessmentId, 'snap-1');
  assert.equal(loaded?.currentItemIndex, 1);

  saveActiveAssessmentSnapshot(null, mem);
  assert.equal(loadActiveAssessmentSnapshot(mem), null);
});

test('computeHistoricalPerformance derives accurate zero, populated, and per-archetype stats', () => {
  const emptyPerf = computeHistoricalPerformance([]);
  assert.equal(emptyPerf.totalSessionsCompleted, 0);
  assert.equal(emptyPerf.overallAccuracyPercent, 0);

  const populatedPerf = computeHistoricalPerformance([createSampleSession('s-1')]);
  assert.equal(populatedPerf.totalSessionsCompleted, 1);
  assert.equal(populatedPerf.totalQuestionsAnswered, 2);
  assert.equal(populatedPerf.overallAccuracyPercent, 100);
  assert.equal(populatedPerf.byGame['math-bubbles'].bestNormalizedScore, 875);
  assert.equal(populatedPerf.byGame['math-bubbles'].archetypesMastered.length, 2);
  assert.equal(populatedPerf.byGame['math-bubbles'].accuracyByArchetype?.['mb-01']?.accuracyPercent, 100);
});
