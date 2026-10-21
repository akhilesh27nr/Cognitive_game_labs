import test from 'node:test';
import assert from 'node:assert/strict';
import { soundFX } from './sound.ts';
import {
  triggerPieceRotateAudio,
  triggerRouteSubmitAudio,
} from '../hooks/useAudioFeedback.ts';

test('triggerPieceRotateAudio records a rotate sound event with metadata', () => {
  soundFX.clearHistory();
  const evt = triggerPieceRotateAudio(true, { row: 1, col: 2, rotationDeg: 90 });

  assert.equal(evt.kind, 'rotate');
  assert.equal(evt.enabled, true);
  assert.deepEqual(evt.detail, { row: 1, col: 2, rotationDeg: 90 });
  assert.equal(soundFX.getLastEvent()?.kind, 'rotate');
  assert.equal(soundFX.getHistory().length, 1);
});

test('triggerRouteSubmitAudio records submit sound events for both solved and unsolved states', () => {
  soundFX.clearHistory();

  const unsolvedEvt = triggerRouteSubmitAudio(true, false, {
    isGeometricallyConnected: false,
  });
  assert.equal(unsolvedEvt.kind, 'submit');
  assert.equal(unsolvedEvt.outcome, 'error');

  const solvedEvt = triggerRouteSubmitAudio(true, true, {
    isGeometricallyConnected: true,
    isDirectionallyAligned: true,
  });
  assert.equal(solvedEvt.kind, 'submit');
  assert.equal(solvedEvt.outcome, 'success');
  assert.equal(soundFX.getHistory().length, 2);
});
