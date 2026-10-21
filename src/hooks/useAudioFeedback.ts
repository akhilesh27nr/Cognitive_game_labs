import { useCallback, useRef, useState } from 'react';
import { soundFX, type SoundEventRecord } from '../utils/sound.ts';

export interface PathAudioFeedbackState {
  lastEvent: SoundEventRecord | null;
  rotateCount: number;
  submitCount: number;
}

export interface UseAudioFeedbackReturn {
  /** Triggers crisp mechanical 90° clockwise rotation audio feedback */
  triggerRotateAudio: (detail?: Record<string, unknown>) => SoundEventRecord;
  /** Alias for triggerRotateAudio */
  playRotateFeedback: (detail?: Record<string, unknown>) => SoundEventRecord;
  /** Triggers route verification audio feedback when Submit (✓) is clicked */
  triggerSubmitAudio: (isSolved?: boolean, detail?: Record<string, unknown>) => SoundEventRecord;
  /** Alias for triggerSubmitAudio */
  playSubmitFeedback: (isSolved?: boolean, detail?: Record<string, unknown>) => SoundEventRecord;
  /** Triggers tile swap audio feedback */
  triggerSwapAudio: (detail?: Record<string, unknown>) => SoundEventRecord;
  /** Triggers locked tile / error audio feedback */
  triggerErrorAudio: (detail?: Record<string, unknown>) => SoundEventRecord;
  /** Most recent audio feedback event triggered through this hook */
  lastAudioEvent: SoundEventRecord | null;
  /** Total number of piece rotation audio events triggered in this session */
  rotateAudioCount: number;
  /** Total number of submit button audio events triggered in this session */
  submitAudioCount: number;
}

/**
 * Pure dispatcher for successful path piece 90° rotation audio feedback.
 */
export function triggerPieceRotateAudio(
  enabled: boolean,
  detail?: Record<string, unknown>
): SoundEventRecord {
  return soundFX.playRotate(enabled, detail);
}

/**
 * Pure dispatcher for Submit (✓) button click audio feedback.
 */
export function triggerRouteSubmitAudio(
  enabled: boolean,
  isSolved = true,
  detail?: Record<string, unknown>
): SoundEventRecord {
  return soundFX.playSubmit(enabled, isSolved, detail);
}

/**
 * React hook to trigger synthesized Web Audio feedback when a path piece is
 * successfully rotated (90° clockwise) or when the Submit (✓) button is clicked.
 */
export function useAudioFeedback(enabled = true): UseAudioFeedbackReturn {
  const [lastAudioEvent, setLastAudioEvent] = useState<SoundEventRecord | null>(null);
  const [rotateAudioCount, setRotateAudioCount] = useState(0);
  const [submitAudioCount, setSubmitAudioCount] = useState(0);

  const rotateCountRef = useRef(0);
  const submitCountRef = useRef(0);

  const triggerRotateAudio = useCallback(
    (detail?: Record<string, unknown>): SoundEventRecord => {
      const event = triggerPieceRotateAudio(enabled, detail);
      rotateCountRef.current += 1;
      setRotateAudioCount(rotateCountRef.current);
      setLastAudioEvent(event);
      return event;
    },
    [enabled]
  );

  const triggerSubmitAudio = useCallback(
    (isSolved = true, detail?: Record<string, unknown>): SoundEventRecord => {
      const event = triggerRouteSubmitAudio(enabled, isSolved, detail);
      submitCountRef.current += 1;
      setSubmitAudioCount(submitCountRef.current);
      setLastAudioEvent(event);
      return event;
    },
    [enabled]
  );

  const triggerSwapAudio = useCallback(
    (detail?: Record<string, unknown>): SoundEventRecord => {
      const event = soundFX.playTone(enabled, 'step', { detail });
      setLastAudioEvent(event);
      return event;
    },
    [enabled]
  );

  const triggerErrorAudio = useCallback(
    (detail?: Record<string, unknown>): SoundEventRecord => {
      const event = soundFX.playTone(enabled, 'mistake', { outcome: 'error', detail });
      setLastAudioEvent(event);
      return event;
    },
    [enabled]
  );

  return {
    triggerRotateAudio,
    playRotateFeedback: triggerRotateAudio,
    triggerSubmitAudio,
    playSubmitFeedback: triggerSubmitAudio,
    triggerSwapAudio,
    triggerErrorAudio,
    lastAudioEvent,
    rotateAudioCount,
    submitAudioCount,
  };
}

export const usePathAudioFeedback = useAudioFeedback;
