// Travel time constants
export const BASE_TRAVEL_TIME_SECONDS = 600; // 10 minutes base
export const DISTANCE_MULTIPLIER = 1.5; // Each additional step costs 50% more
export const NIGHT_START_HOUR = 0; // 00:00
export const NIGHT_END_HOUR = 7; // 07:00
export const NIGHT_TIME_MULTIPLIER = 2.5;
export const NIGHT_COST_MULTIPLIER = 2.0;
export const BASE_COST_PER_STEP = 100; // Base gold cost per step

// Region order for distance calculation
export const REGION_ORDER: Record<string, number> = {
  verdant: 0,
  quarry: 1,
  dunes: 2,
  obsidian: 3,
  dragonspire: 4,
  frozen_wastes: 5,
  void_realm: 6,
};

// Check if current time is night (server time)
export function isNightTime(serverTime?: Date): boolean {
  const now = serverTime || new Date();
  const hour = now.getUTCHours(); // Use UTC for server time
  return hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR;
}

// Calculate travel distance between two regions
export function calculateTravelDistance(fromRegion: string, toRegion: string): number {
  const fromOrder = REGION_ORDER[fromRegion] ?? 0;
  const toOrder = REGION_ORDER[toRegion] ?? 0;
  return Math.abs(toOrder - fromOrder);
}

// Calculate dynamic travel time in seconds
export function calculateTravelTime(fromRegion: string, toRegion: string, serverTime?: Date): number {
  const distance = calculateTravelDistance(fromRegion, toRegion);
  if (distance === 0) return 0;
  
  // Progressive time: 10m for 1 step, 25m for 2 steps, 47m for 3 steps, etc.
  // Formula: base * (1 + 1.5 + 1.5^2 + ... + 1.5^(distance-1))
  let totalTime = 0;
  for (let i = 0; i < distance; i++) {
    totalTime += BASE_TRAVEL_TIME_SECONDS * Math.pow(DISTANCE_MULTIPLIER, i);
  }
  
  // Apply night multiplier
  if (isNightTime(serverTime)) {
    totalTime *= NIGHT_TIME_MULTIPLIER;
  }
  
  return Math.floor(totalTime);
}

// Calculate dynamic travel cost
export function calculateTravelCost(fromRegion: string, toRegion: string, baseCostPerStep: number = BASE_COST_PER_STEP, serverTime?: Date): number {
  const distance = calculateTravelDistance(fromRegion, toRegion);
  if (distance === 0) return 0;
  
  // Progressive cost similar to time
  let totalCost = 0;
  for (let i = 0; i < distance; i++) {
    totalCost += baseCostPerStep * Math.pow(DISTANCE_MULTIPLIER, i);
  }
  
  // Apply night multiplier
  if (isNightTime(serverTime)) {
    totalCost *= NIGHT_COST_MULTIPLIER;
  }
  
  return Math.floor(totalCost);
}

// Format travel time for display
export function formatTravelDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
