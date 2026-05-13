/**
 * Physical layout, timing, and asset URLs for the Three.js penalty mode.
 *
 * Pitch dimensions follow IFAB Laws of the Game where noted; some values
 * are exaggerated for readability at the fixed camera distance.
 */
import * as THREE from "three";

/** Goal opening width (FIFA 7.32 m, scaled up for prominence). */
export const GOAL_W = 10;
/** Goal height (FIFA 2.44 m, scaled up ~20%). */
export const GOAL_H = 3;
export const GOAL_DEPTH = 1.8;
/** Goal line: front face of the goal in world +z. */
export const GOAL_Z = -22;

/** Penalty-area width (FIFA 40.32 m). */
export const PB_W = 40.32;
export const PB_DEPTH = 16.5;
export const PB_FRONT_Z = GOAL_Z + PB_DEPTH;
export const GA_W = 18.32;
export const GA_DEPTH = 5.5;

/** Ball-to-goal-line distance along z (FIFA spot is 11 m). */
export const PENALTY_DISTANCE = 7;
export const SPOT_Z = GOAL_Z + PENALTY_DISTANCE;
export const PEN_ARC_RADIUS = 9.15;
export const SPOT_RADIUS = 0.22;

/**
 * Ball radius in metres. Real ball ≈0.11 m; doubled so the ball reads
 * clearly from the kicker camera.
 */
export const BALL_R = 0.22;
export const BALL_START = new THREE.Vector3(0, BALL_R, SPOT_Z);

export const KEEPER_HEIGHT = 1.88 * 1.2;
export const KEEPER_Z = GOAL_Z + 0.2;

/** Shot flight time at slow vs fast swipe (seconds). */
export const SHOT_DURATION_SLOW = 0.85;
export const SHOT_DURATION_FAST = 0.32;
/** Swipe speed in px/ms; maps to shot duration. */
export const SWIPE_SPEED_SLOW = 0.5;
export const SWIPE_SPEED_FAST = 3.0;
export const FIRM_SWIPE_PX = 220;

export const SWIPE_MIN_UP = 30;
export const SWIPE_MAX_DURATION_MS = 1000;

/** Base rig; clips are separate GLBs merged at runtime. */
export const KEEPER_GLB_MODEL_URL = new URL("../assets/Ch38_nonPBR.glb", import.meta.url).href;

/** Per-action animation clip URLs (Mixamo-style exports). */
export const KEEPER_GLB_CLIP_URLS = {
  idle: new URL("../assets/Ch38_nonPBR@Goalkeeper Idle.glb", import.meta.url).href,
  stepL: new URL("../assets/Ch38_nonPBR@Goalkeeper Sidestep L.glb", import.meta.url).href,
  stepR: new URL("../assets/Ch38_nonPBR@Goalkeeper Sidestep R.glb", import.meta.url).href,
  diveL: new URL("../assets/Ch38_nonPBR@Goalkeeper Diving Save L.glb", import.meta.url).href,
  diveR: new URL("../assets/Ch38_nonPBR@Goalkeeper Diving Save R.glb", import.meta.url).href,
  diveC: new URL("../assets/Ch38_nonPBR@Goalkeeper Catch Low.glb", import.meta.url).href,
  scoop: new URL("../assets/Ch38_nonPBR@Goalkeeper Scoop.glb", import.meta.url).href,
  high: new URL("../assets/Ch38_nonPBR@Goalkeeper Catch High.glb", import.meta.url).href,
  jump: new URL("../assets/Ch38_nonPBR@Goalkeeper Catch Jump.glb", import.meta.url).href,
  blockL: new URL("../assets/Ch38_nonPBR@Goalkeeper Body Block L.glb", import.meta.url).href,
  blockR: new URL("../assets/Ch38_nonPBR@Goalkeeper Body Block R.glb", import.meta.url).href,
} as const;

export type KeeperClipKey = keyof typeof KEEPER_GLB_CLIP_URLS;
