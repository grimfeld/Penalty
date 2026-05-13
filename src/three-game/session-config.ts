/**
 * Session-level options for the Three.js penalty engine. Pass a partial
 * object to `mount`; unknown keys are ignored via merge with defaults.
 *
 * Runtime updates: use the handle returned from `mount` and call
 * `applySessionConfig(partial)` to change logo/background URLs or stadium variant
 * without remounting.
 */

/** Procedural crowd / stand appearance (see `procedural.ts`). */
export type StadiumStandsVariant = "day" | "night";

/** How the narrative arc is chosen before kickoff. */
export type SessionScenario = "random" | "win" | "lose";

export type SessionEndPayload = {
  goals: number;
  shots: number;
  /** True when every kick was scripted to score (keeper never saves). */
  predeterminedWinScenario: boolean;
  /**
   * Lose arc only: the scripted shot that cannot be a goal, guaranteeing the
   * session has at least one miss or save.
   */
  forcedNonGoalShotIndices: readonly number[];
};

export type ThreeGameSessionConfig = {
  /** Kicks per session (default 3). */
  shotsPerSession: number;
  /** Win / lose / random narrative before choosing the guaranteed lose shot. */
  sessionScenario: SessionScenario;
  /**
   * Lose arc only: randomise which shot is guaranteed not to score. When false,
   * the first shot is forced instead.
   */
  randomizeForcedMisses: boolean;
  /** HTTPS URL for the ad-board logo (must allow CORS for canvas painting). */
  adBoardLogoUrl: string;
  /** HTTPS URL for the stadium stand background image (must allow CORS). */
  stadiumBackgroundUrl: string;
  /** Procedural crowd look; switch at runtime via `applySessionConfig`. */
  standsVariant: StadiumStandsVariant;
  /**
   * When the player is not on a forced-save index (lose arc), probability the
   * keeper makes a competitive save. Win arc ignores this (shots always score).
   */
  competitiveKeeperSaveChance: number;
  /** Fired after the last attempt of the session is fully resolved. */
  onSessionEnd?: (payload: SessionEndPayload) => void;
};

export const DEFAULT_THREE_GAME_SESSION_CONFIG: ThreeGameSessionConfig = {
  shotsPerSession: 3,
  sessionScenario: "random",
  randomizeForcedMisses: true,
  // Picsum allows cross-origin canvas reads; swap for your own CDN asset.
  adBoardLogoUrl: "https://picsum.photos/seed/kadow-penalty/640/200",
  stadiumBackgroundUrl: "https://picsum.photos/seed/kadow-stadium/1600/600",
  standsVariant: "day",
  competitiveKeeperSaveChance: 0.34,
};

export type ResolvedSessionPlan = {
  shotsPerSession: number;
  predeterminedWinScenario: boolean;
  forcedNonGoalShots: ReadonlySet<number>;
};

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Turns user config into concrete session rules. Win sessions contain only
 * goals; lose sessions choose exactly one shot that must not score.
 */
export function resolveSessionPlan(
  config: ThreeGameSessionConfig,
  rng: () => number = Math.random,
): ResolvedSessionPlan {
  const shotsPerSession = Math.max(1, Math.min(12, Math.floor(config.shotsPerSession)));
  const predeterminedWinScenario =
    config.sessionScenario === "win"
      ? true
      : config.sessionScenario === "lose"
        ? false
        : rng() < 0.5;

  const forcedNonGoalShots = new Set<number>();
  if (!predeterminedWinScenario) {
    const forcedIndex = config.randomizeForcedMisses
      ? Math.floor(rng() * shotsPerSession)
      : 0;
    forcedNonGoalShots.add(forcedIndex);
  }

  return { shotsPerSession, predeterminedWinScenario, forcedNonGoalShots };
}

export function mergeThreeGameSessionConfig(
  partial?: Partial<ThreeGameSessionConfig>,
): ThreeGameSessionConfig {
  return { ...DEFAULT_THREE_GAME_SESSION_CONFIG, ...partial };
}

/** Deterministic plan (e.g. tests) from an integer seed. */
export function resolveSessionPlanSeeded(
  config: ThreeGameSessionConfig,
  seed: number,
): ResolvedSessionPlan {
  return resolveSessionPlan(config, mulberry32(seed >>> 0));
}
