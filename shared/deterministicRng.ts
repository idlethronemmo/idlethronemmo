export function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) || 1;
}

export class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
    if (this.state === 0) this.state = 1;
  }

  next(): number {
    let t = this.state;
    t ^= t << 13;
    t ^= t >> 17;
    t ^= t << 5;
    this.state = t;
    return (t >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  nextFloat(): number {
    return this.next();
  }

  chance(percent: number): boolean {
    return this.next() * 100 <= percent;
  }

  getSeed(): number {
    return this.state;
  }
}
