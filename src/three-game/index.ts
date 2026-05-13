/**
 * Three.js penalty-shootout mode.
 *
 * - `session-config` — `ThreeGameSessionConfig`, defaults, session randomisation
 * - `constants` — pitch/goal numbers, swipe timing, keeper asset URLs
 * - `field` — grass and FIFA-style line markings
 * - `stadium` — crowd planes and pitch-side ad boards (runtime logo / variant)
 * - `goal-assembly` — goalpost GLB + net shake
 * - `ball` — ball group + shadow + optional `/ball.glb`
 * - `procedural` — crowd texture + primitive keeper fallback
 * - `mount` — renderer, game loop, keeper/shot logic, overlay UI
 */
export { mount, type ThreeGameMountHandle } from "./mount";
export {
  DEFAULT_THREE_GAME_SESSION_CONFIG,
  mergeThreeGameSessionConfig,
  resolveSessionPlan,
  resolveSessionPlanSeeded,
  type ResolvedSessionPlan,
  type SessionEndPayload,
  type SessionScenario,
  type StadiumStandsVariant,
  type ThreeGameSessionConfig,
} from "./session-config";
