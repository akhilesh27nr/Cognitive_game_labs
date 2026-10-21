/**
 * Synthesized Web Audio feedback for tactile game interactions
 * Respects user soundEnabled setting and gracefully degrades in headless/test environments.
 */

export type SoundToneKind =
  | 'click'
  | 'correct'
  | 'mistake'
  | 'complete'
  | 'rotate'
  | 'submit'
  | 'step';

export interface SoundEventRecord {
  kind: SoundToneKind;
  enabled: boolean;
  timestamp: number;
  outcome?: 'success' | 'error';
  detail?: Record<string, unknown>;
}

type SoundEventListener = (event: SoundEventRecord) => void;

class SoundController {
  private ctx: AudioContext | null = null;
  private history: SoundEventRecord[] = [];
  private listeners: Set<SoundEventListener> = new Set();

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private recordEvent(
    kind: SoundToneKind,
    enabled: boolean,
    outcome?: 'success' | 'error',
    detail?: Record<string, unknown>
  ): SoundEventRecord {
    const entry: SoundEventRecord = {
      kind,
      enabled,
      timestamp: Date.now(),
      outcome,
      detail,
    };
    this.history.push(entry);
    if (this.history.length > 100) {
      this.history.shift();
    }
    if (typeof window !== 'undefined') {
      (
        window as unknown as { __LAST_SOUND_EVENT__?: SoundEventRecord; __SOUND_HISTORY__?: SoundEventRecord[] }
      ).__LAST_SOUND_EVENT__ = entry;
      (
        window as unknown as { __LAST_SOUND_EVENT__?: SoundEventRecord; __SOUND_HISTORY__?: SoundEventRecord[] }
      ).__SOUND_HISTORY__ = this.history;
    }
    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch {
        // Ignore listener errors
      }
    });
    return entry;
  }

  public getHistory(): SoundEventRecord[] {
    return [...this.history];
  }

  public getLastEvent(): SoundEventRecord | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  public clearHistory(): void {
    this.history = [];
    if (typeof window !== 'undefined') {
      (
        window as unknown as { __LAST_SOUND_EVENT__?: SoundEventRecord | null; __SOUND_HISTORY__?: SoundEventRecord[] }
      ).__LAST_SOUND_EVENT__ = null;
      (
        window as unknown as { __LAST_SOUND_EVENT__?: SoundEventRecord | null; __SOUND_HISTORY__?: SoundEventRecord[] }
      ).__SOUND_HISTORY__ = [];
    }
  }

  public subscribe(listener: SoundEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public playTone(
    enabled: boolean,
    kind: SoundToneKind,
    options?: { outcome?: 'success' | 'error'; detail?: Record<string, unknown> }
  ): SoundEventRecord {
    const eventRecord = this.recordEvent(kind, enabled, options?.outcome, options?.detail);
    if (!enabled) return eventRecord;
    const ctx = this.getContext();
    if (!ctx) return eventRecord;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      switch (kind) {
        case 'click':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.exponentialRampToValueAtTime(640, now + 0.045);
          gain.gain.setValueAtTime(0.06, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          osc.start(now);
          osc.stop(now + 0.05);
          break;
        case 'rotate':
          // Crisp 2-stage mechanical indexing click for 90° clockwise path piece rotation
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(540, now);
          osc.frequency.setValueAtTime(760, now + 0.025);
          osc.frequency.exponentialRampToValueAtTime(820, now + 0.065);
          gain.gain.setValueAtTime(0.075, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
          osc.start(now);
          osc.stop(now + 0.07);
          break;
        case 'submit':
          if (options?.outcome === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(360, now);
            osc.frequency.setValueAtTime(220, now + 0.045);
            osc.frequency.linearRampToValueAtTime(165, now + 0.16);
            gain.gain.setValueAtTime(0.075, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
            osc.start(now);
            osc.stop(now + 0.17);
          } else {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.setValueAtTime(783.99, now + 0.05); // G5
            osc.frequency.setValueAtTime(1046.5, now + 0.11); // C6
            gain.gain.setValueAtTime(0.085, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc.start(now);
            osc.stop(now + 0.22);
          }
          break;
        case 'step':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(560, now + 0.05);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
          osc.start(now);
          osc.stop(now + 0.055);
          break;
        case 'correct':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(587.33, now); // D5
          osc.frequency.setValueAtTime(880, now + 0.06); // A5
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          osc.start(now);
          osc.stop(now + 0.16);
          break;
        case 'mistake':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.linearRampToValueAtTime(165, now + 0.14);
          gain.gain.setValueAtTime(0.07, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          osc.start(now);
          osc.stop(now + 0.15);
          break;
        case 'complete':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(523.25, now); // C5
          osc.frequency.setValueAtTime(659.25, now + 0.07); // E5
          osc.frequency.setValueAtTime(783.99, now + 0.14); // G5
          osc.frequency.setValueAtTime(1046.5, now + 0.21); // C6
          gain.gain.setValueAtTime(0.09, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
          osc.start(now);
          osc.stop(now + 0.34);
          break;
      }
    } catch {
      // Ignore audio errors
    }

    return eventRecord;
  }

  public playSelect(enabled: boolean): void {
    this.playTone(enabled, 'click');
  }

  public playClick(enabled: boolean): void {
    this.playTone(enabled, 'click');
  }

  public playRotate(enabled: boolean, detail?: Record<string, unknown>): SoundEventRecord {
    return this.playTone(enabled, 'rotate', { detail });
  }

  public playSubmit(
    enabled: boolean,
    isSuccess = true,
    detail?: Record<string, unknown>
  ): SoundEventRecord {
    return this.playTone(enabled, 'submit', {
      outcome: isSuccess ? 'success' : 'error',
      detail,
    });
  }

  public playMove(enabled: boolean): void {
    this.playTone(enabled, 'step');
  }

  public playSuccess(enabled: boolean): void {
    this.playTone(enabled, 'correct');
  }

  public playError(enabled: boolean): void {
    this.playTone(enabled, 'mistake');
  }

  public playComplete(enabled: boolean): void {
    this.playTone(enabled, 'complete');
  }
}

export const soundFX = new SoundController();
