import { useRef, useCallback } from "react";
import { DeterministicRng, hashSeed } from "@shared/deterministicRng";
import { processCombatStep } from "@shared/combatEngine";
import { createCombatStateFromAdapter, type ShadowAdapterInput } from "@shared/combatShadowAdapter";
import { compareCombatSnapshots, extractSnapshot, type CombatSnapshot } from "@shared/combatComparator";

const SHADOW_SAMPLE_INTERVAL = 10_000;
const SHADOW_ENABLED = true;

export function useCombatShadow() {
  const lastSampleRef = useRef(0);
  const shadowStateRef = useRef<ReturnType<typeof createCombatStateFromAdapter> | null>(null);
  const rngRef = useRef<DeterministicRng | null>(null);
  const divergenceCountRef = useRef(0);

  const initShadow = useCallback((input: ShadowAdapterInput, fightId?: string) => {
    if (!SHADOW_ENABLED) return;
    const seedStr = fightId || `${input.monsterId}_${input.playerHp}_${input.monsterHp}`;
    const seed = hashSeed(seedStr);
    rngRef.current = new DeterministicRng(seed);
    shadowStateRef.current = createCombatStateFromAdapter(input);
    lastSampleRef.current = Date.now();
    divergenceCountRef.current = 0;
  }, []);

  const sampleShadow = useCallback((
    legacySnapshot: CombatSnapshot,
    deltaMs: number,
  ) => {
    if (!SHADOW_ENABLED) return;
    if (!shadowStateRef.current || !rngRef.current) return;

    const now = Date.now();
    if (now - lastSampleRef.current < SHADOW_SAMPLE_INTERVAL) return;
    lastSampleRef.current = now;

    const result = processCombatStep(shadowStateRef.current, deltaMs, rngRef.current);
    shadowStateRef.current = result.state;

    const unifiedSnapshot = extractSnapshot(result.state);
    const comparison = compareCombatSnapshots(legacySnapshot, unifiedSnapshot);

    if (!comparison.match) {
      divergenceCountRef.current++;
      if (divergenceCountRef.current <= 10) {
        console.log("[CombatShadow] Divergence detected:", comparison.divergences);
      }
    }
  }, []);

  const resetShadow = useCallback(() => {
    shadowStateRef.current = null;
    rngRef.current = null;
    divergenceCountRef.current = 0;
  }, []);

  return { initShadow, sampleShadow, resetShadow };
}
