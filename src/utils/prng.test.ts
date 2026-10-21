import test from 'node:test';
import assert from 'node:assert/strict';
import { SeededRandom, createDeterministicSeed } from './prng.ts';

test('SeededRandom produces identical sequences for identical seeds', () => {
  const rngA = new SeededRandom('CGL-TEST-2026');
  const rngB = new SeededRandom('CGL-TEST-2026');

  const seqA = Array.from({ length: 20 }, () => rngA.nextInt(1, 1000));
  const seqB = Array.from({ length: 20 }, () => rngB.nextInt(1, 1000));

  assert.deepEqual(seqA, seqB);
});

test('SeededRandom produces distinct sequences for different seeds', () => {
  const rngA = new SeededRandom('SEED-ALPHA');
  const rngB = new SeededRandom('SEED-BETA');

  const seqA = Array.from({ length: 12 }, () => rngA.nextInt(1, 10000));
  const seqB = Array.from({ length: 12 }, () => rngB.nextInt(1, 10000));

  assert.notDeepEqual(seqA, seqB);
});

test('SeededRandom shuffle is deterministic and preserves all elements', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const rng1 = new SeededRandom('SHUFFLE-99');
  const rng2 = new SeededRandom('SHUFFLE-99');

  const s1 = rng1.shuffle(items);
  const s2 = rng2.shuffle(items);

  assert.deepEqual(s1, s2);
  assert.deepEqual([...s1].sort((a, b) => a - b), items);
});

test('createDeterministicSeed returns prefixed non-empty seed string', () => {
  const seed = createDeterministicSeed('MB');
  assert.equal(seed.startsWith('MB-'), true);
  assert.equal(seed.length >= 8, true);
});
