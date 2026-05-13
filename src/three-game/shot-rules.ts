import type { ResolvedSessionPlan } from "./session-config";

export type ShotOutcome = "win" | "save" | "miss";

export type ShotOutcomeDecision = {
  outcome: ShotOutcome;
  keeperReaction: "score" | "save";
};

export function resolveShotOutcome(params: {
  sessionPlan: ResolvedSessionPlan;
  onFrame: boolean;
  attemptIndex: number;
  competitiveKeeperSaveChance: number;
  rng?: () => number;
}): ShotOutcomeDecision {
  const rng = params.rng ?? Math.random;

  if (params.sessionPlan.predeterminedWinScenario) {
    return { outcome: "win", keeperReaction: "score" };
  }

  if (!params.onFrame) {
    return { outcome: "miss", keeperReaction: "score" };
  }

  const forcedNonGoal = params.sessionPlan.forcedNonGoalShots.has(
    params.attemptIndex,
  );
  const saveChance = Math.min(
    0.95,
    Math.max(0, params.competitiveKeeperSaveChance),
  );

  if (forcedNonGoal || rng() < saveChance) {
    return { outcome: "save", keeperReaction: "save" };
  }

  return { outcome: "win", keeperReaction: "score" };
}
