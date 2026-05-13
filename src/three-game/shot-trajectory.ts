import * as THREE from "three";
import {
  BALL_R,
  FIRM_SWIPE_PX,
  GOAL_DEPTH,
  GOAL_H,
  GOAL_W,
  GOAL_Z,
  type KeeperClipKey,
} from "./constants";

export type TrajectoryKey =
  | "center"
  | "left"
  | "right"
  | "outsideLeft"
  | "outsideRight";

export type TrajectorySpec = {
  key: TrajectoryKey;
  x: number;
  y: number;
  z: number;
  keeperTargetX: number;
  keeperLift: number;
  keeperLean: number;
  saveAction: KeeperClipKey;
};

const SIDE_LIFT = 0.7;
const SIDE_LEAN = Math.PI / 6;
const SIDE_DIVE_X = Math.max(0, GOAL_W / 2 - 0.4);

export const TRAJECTORIES: readonly TrajectorySpec[] = [
  {
    key: "center",
    x: 0,
    y: 1.25,
    z: GOAL_Z - GOAL_DEPTH + 0.05,
    keeperTargetX: 0,
    keeperLift: 0,
    keeperLean: 0,
    saveAction: "diveC",
  },
  {
    key: "left",
    x: -GOAL_W * 0.27,
    y: 1.15,
    z: GOAL_Z - GOAL_DEPTH + 0.05,
    keeperTargetX: -SIDE_DIVE_X * 0.72,
    keeperLift: SIDE_LIFT * 0.45,
    keeperLean: SIDE_LEAN * 0.6,
    saveAction: "diveR",
  },
  {
    key: "right",
    x: GOAL_W * 0.27,
    y: 1.15,
    z: GOAL_Z - GOAL_DEPTH + 0.05,
    keeperTargetX: SIDE_DIVE_X * 0.72,
    keeperLift: SIDE_LIFT * 0.45,
    keeperLean: -SIDE_LEAN * 0.6,
    saveAction: "diveL",
  },
  {
    key: "outsideLeft",
    x: -GOAL_W * 0.62,
    y: 1.35,
    z: GOAL_Z - 0.05,
    keeperTargetX: -SIDE_DIVE_X,
    keeperLift: SIDE_LIFT * 0.25,
    keeperLean: SIDE_LEAN * 0.35,
    saveAction: "blockR",
  },
  {
    key: "outsideRight",
    x: GOAL_W * 0.62,
    y: 1.35,
    z: GOAL_Z - 0.05,
    keeperTargetX: SIDE_DIVE_X,
    keeperLift: SIDE_LIFT * 0.25,
    keeperLean: -SIDE_LEAN * 0.35,
    saveAction: "blockL",
  },
];

export function isTargetInsideScoringFrame(target: THREE.Vector3): boolean {
  const halfW = GOAL_W * 0.5 - BALL_R * 0.35;
  if (Math.abs(target.x) > halfW) return false;
  if (target.y < BALL_R * 1.1 || target.y > GOAL_H - BALL_R * 0.4) return false;
  if (target.z > GOAL_Z + 0.12) return false;
  if (target.z < GOAL_Z - GOAL_DEPTH - 0.35) return false;
  return true;
}

export function selectTrajectoryLoseArc(swipeDx: number): TrajectorySpec {
  const maxAim = GOAL_W * 0.62;
  const outsideSwipePx = 100;
  if (swipeDx <= -outsideSwipePx) {
    return TRAJECTORIES.find((t) => t.key === "outsideLeft") ?? TRAJECTORIES[0]!;
  }
  if (swipeDx >= outsideSwipePx) {
    return TRAJECTORIES.find((t) => t.key === "outsideRight") ?? TRAJECTORIES[0]!;
  }

  const firmPx = FIRM_SWIPE_PX * 0.78;
  const aimX = THREE.MathUtils.clamp((swipeDx / firmPx) * maxAim, -maxAim, maxAim);
  return closestTrajectory(TRAJECTORIES, aimX);
}

export function selectTrajectoryWinArc(swipeDx: number): TrajectorySpec {
  const maxAim = GOAL_W * 0.27;
  const aimX = THREE.MathUtils.clamp(
    (swipeDx / FIRM_SWIPE_PX) * maxAim,
    -maxAim,
    maxAim,
  );
  const inGoal = TRAJECTORIES.filter(
    (t) => t.key === "center" || t.key === "left" || t.key === "right",
  );
  return closestTrajectory(inGoal, aimX);
}

function closestTrajectory(
  trajectories: readonly TrajectorySpec[],
  aimX: number,
): TrajectorySpec {
  let best = trajectories[0]!;
  let bestDist = Math.abs(aimX - best.x);
  for (const trajectory of trajectories) {
    const distance = Math.abs(aimX - trajectory.x);
    if (distance < bestDist) {
      bestDist = distance;
      best = trajectory;
    }
  }
  return best;
}
