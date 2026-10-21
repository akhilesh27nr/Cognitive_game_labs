/**
 * Deterministic Seeded Pseudo-Random Number Generator (FNV-1a hash + Mulberry32)
 * Guarantees reproducible puzzle generation from any seed string or number.
 */

export class SeededRandom {
  private state: number;
  public readonly seedString: string;

  constructor(seed: string | number) {
    this.seedString = String(seed).trim() || 'cgl-default-seed';
    this.state = SeededRandom.hashString(this.seedString);
  }

  public static hashString(input: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) || 0x9e3779b9;
  }

  /**
   * Returns a deterministic float in [0, 1)
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a deterministic integer in [min, max] inclusive
   */
  public nextInt(min: number, max: number): number {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return Math.floor(this.next() * (hi - lo + 1)) + lo;
  }

  /**
   * Returns true with probability p (default 0.5)
   */
  public nextBool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  /**
   * Picks a deterministic item from a non-empty array
   */
  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty array');
    }
    return items[this.nextInt(0, items.length - 1)];
  }

  /**
   * Returns a new deterministically shuffled copy of the array (Fisher-Yates)
   */
  public shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  /**
   * Forks a child SeededRandom with a sub-label
   */
  public fork(label: string | number): SeededRandom {
    return new SeededRandom(`${this.seedString}::${label}`);
  }
}

export function createDeterministicSeed(prefix = 'CGL'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const now = Date.now();
  let suffix = '';
  let n = now;
  for (let i = 0; i < 6; i++) {
    suffix += chars[n % chars.length];
    n = Math.floor(n / chars.length) ^ (i * 31);
  }
  return `${prefix}-${suffix}`;
}
