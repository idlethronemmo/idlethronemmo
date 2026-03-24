const MAX_LEVEL = 99;

export function getXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) {
    total += Math.floor(l + 300 * Math.pow(2, l / 7));
  }
  return Math.floor(total / 3.2);
}

export function getLevelFromXp(xp: number): number {
  for (let l = 1; l <= MAX_LEVEL; l++) {
    if (xp < getXpForLevel(l + 1)) {
      return l;
    }
  }
  return MAX_LEVEL;
}
