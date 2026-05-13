/**
 * Public mount facade for the Three.js penalty shootout.
 *
 * Runtime systems live in focused controllers; this module wires them together,
 * owns the RAF loop, and exposes the small handle used by the host page.
 */
import { BALL_START } from "./constants";
import { BallPostShotController } from "./ball-post-shot-controller";
import { BallShotController } from "./ball-shot-controller";
import { GoalkeeperController } from "./goalkeeper-controller";
import { OverlayFeedback } from "./overlay-feedback";
import { PenaltyAudio } from "./penalty-audio";
import { PenaltyScene } from "./penalty-scene";
import {
  mergeThreeGameSessionConfig,
  resolveSessionPlan,
  type ThreeGameSessionConfig,
} from "./session-config";
import { SessionHud } from "./session-hud";
import { SessionRuntime } from "./session-runtime";
import { SwipeShootInput } from "./swipe-shoot-input";

export type ThreeGameMountHandle = {
  dispose: () => void;
  applySessionConfig: (patch: Partial<ThreeGameSessionConfig>) => void;
  /** New session: re-rolls scenario / forced misses (per config) and resets score. */
  restartSession: () => void;
};

export function mount(
  stage: HTMLElement,
  config?: Partial<ThreeGameSessionConfig>,
): ThreeGameMountHandle {
  let liveConfig = mergeThreeGameSessionConfig(config);

  const scene = new PenaltyScene(stage, {
    logoUrl: liveConfig.adBoardLogoUrl,
    backgroundUrl: liveConfig.stadiumBackgroundUrl,
    standsVariant: liveConfig.standsVariant,
  });
  const overlay = new OverlayFeedback(stage, scene.canvas);
  const audio = new PenaltyAudio();
  const keeper = new GoalkeeperController(scene.scene);
  const session = new SessionRuntime(
    resolveSessionPlan(liveConfig),
    () => liveConfig,
    () => hud.refresh(session),
  );
  const hud = new SessionHud(stage, restartSession);

  const postShot = new BallPostShotController(
    scene.ball,
    scene.ballShadow,
    resetBall,
  );
  const shot = new BallShotController({
    ball: scene.ball,
    ballShadow: scene.ballShadow,
    session,
    getConfig: () => liveConfig,
    keeper,
    postShot,
    audio,
    overlay,
    shakeNet: scene.shakeNet,
    resetBall,
  });
  const input = new SwipeShootInput(scene.canvas, {
    canStart: () => !session.complete && !shot.active && !postShot.busy,
    onShoot: (dx, speed) => shot.shoot(dx, speed),
    pushTrail: (clientX, clientY) => overlay.pushTrail(clientX, clientY),
    clearTrail: () => overlay.clearTransientState(),
  });

  function resetBall() {
    scene.ball.position.copy(BALL_START);
    scene.ball.rotation.set(0, 0, 0);
    scene.ballShadow.visible = true;
    postShot.clear();
    shot.reset();
    keeper.reset();
  }

  function restartSession() {
    if (shot.active || postShot.busy) return;
    session.restart(resolveSessionPlan(liveConfig));
    shot.reset();
    postShot.clear();
    overlay.clearTransientState();
    input.cancel();
    resetBall();
    hud.refresh(session);
  }

  hud.refresh(session);

  function resize() {
    const { width, height } = scene.resize();
    overlay.resize(width, height);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  let raf = 0;
  let prev = performance.now();
  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;

    keeper.tick(dt);
    shot.tick(dt);
    postShot.tick(dt);
    scene.tickNet();
    scene.render();

    overlay.draw(now / 1000, stage.clientWidth, stage.clientHeight);
  }
  raf = requestAnimationFrame(tick);

  function dispose() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    input.dispose();
    hud.dispose();
    keeper.dispose();
    scene.dispose();
    overlay.dispose();
  }

  function applySessionConfig(patch: Partial<ThreeGameSessionConfig>) {
    liveConfig = mergeThreeGameSessionConfig({ ...liveConfig, ...patch });
    if (patch.adBoardLogoUrl !== undefined) {
      scene.setLogoUrl(liveConfig.adBoardLogoUrl);
    }
    if (patch.stadiumBackgroundUrl !== undefined) {
      scene.setBackgroundUrl(liveConfig.stadiumBackgroundUrl);
    }
    if (patch.standsVariant !== undefined) {
      scene.setStandsVariant(liveConfig.standsVariant);
    }
    if (
      patch.sessionScenario !== undefined ||
      patch.shotsPerSession !== undefined ||
      patch.randomizeForcedMisses !== undefined
    ) {
      restartSession();
    } else {
      hud.refresh(session);
    }
  }

  return { dispose, applySessionConfig, restartSession };
}