import { DeterministicRng, hashSeed } from "../shared/deterministicRng";
import { processCombatStep } from "../shared/combatEngine";
import { createCombatStateFromAdapter, type ShadowAdapterInput } from "../shared/combatShadowAdapter";
import { compareCombatSnapshots, extractSnapshot, type CombatSnapshot } from "../shared/combatComparator";
import type { CombatState } from "../shared/combatTypes";

const SHADOW_ENABLED = true;

interface ShadowSession {
  state: CombatState;
  rng: DeterministicRng;
  divergenceCount: number;
  lastSampleTime: number;
}

const shadowSessions = new Map<number, ShadowSession>();

export function initServerShadow(playerId: number, input: ShadowAdapterInput): void {
  if (!SHADOW_ENABLED) return;
  const seedStr = `server_${playerId}_${input.monsterId}_${input.playerHp}_${input.monsterHp}`;
  const seed = hashSeed(seedStr);
  const rng = new DeterministicRng(seed);
  const state = createCombatStateFromAdapter(input);
  shadowSessions.set(playerId, {
    state,
    rng,
    divergenceCount: 0,
    lastSampleTime: Date.now(),
  });
}

export function sampleServerShadow(
  playerId: number,
  legacySnapshot: CombatSnapshot,
  deltaMs: number
): void {
  if (!SHADOW_ENABLED) return;
  const session = shadowSessions.get(playerId);
  if (!session) return;

  const result = processCombatStep(session.state, deltaMs, session.rng);
  session.state = result.state;

  const unifiedSnapshot = extractSnapshot(result.state);
  const comparison = compareCombatSnapshots(legacySnapshot, unifiedSnapshot);

  if (!comparison.match) {
    session.divergenceCount++;
    if (session.divergenceCount <= 5) {
      console.log(`[ServerShadow] Player ${playerId} divergence:`, comparison.divergences);
    }
  }

  session.lastSampleTime = Date.now();
}

export function clearServerShadow(playerId: number): void {
  shadowSessions.delete(playerId);
}
