import * as THREE from "three";
import {
  BALL_R,
  BALL_START,
  GOAL_H,
  KEEPER_Z,
  SHOT_DURATION_FAST,
  SHOT_DURATION_SLOW,
  SWIPE_SPEED_FAST,
  SWIPE_SPEED_SLOW,
} from "./constants";
import { BallPostShotController } from "./ball-post-shot-controller";
import {
  GoalkeeperController,
  SAVE_FLIGHT_TIME,
} from "./goalkeeper-controller";
import { OverlayFeedback } from "./overlay-feedback";
import { PenaltyAudio } from "./penalty-audio";
import type { SessionRuntime } from "./session-runtime";
import { resolveShotOutcome, type ShotOutcome } from "./shot-rules";
import {
  isTargetInsideScoringFrame,
  selectTrajectoryLoseArc,
  selectTrajectoryWinArc,
  TRAJECTORIES,
  type TrajectorySpec,
} from "./shot-trajectory";
import type { ThreeGameSessionConfig } from "./session-config";

type Shot = {
  t: number;
  duration: number;
  outcome: ShotOutcome;
  from: THREE.Vector3;
  target: THREE.Vector3;
  arcHeight: number;
  spinAxis: THREE.Vector3;
  spinSpeed: number;
};

export class BallShotController {
  private shot: Shot | null = null;
  private saveInterceptPoint: THREE.Vector3 | null = null;

  constructor(
    private readonly params: {
      ball: THREE.Group;
      ballShadow: THREE.Object3D;
      session: SessionRuntime;
      getConfig: () => ThreeGameSessionConfig;
      keeper: GoalkeeperController;
      postShot: BallPostShotController;
      audio: PenaltyAudio;
      overlay: OverlayFeedback;
      shakeNet: (point: THREE.Vector3) => void;
      resetBall: () => void;
    },
  ) {}

  get active() {
    return Boolean(this.shot);
  }

  shoot(swipeDx: number, swipeSpeed: number) {
    const { session, postShot } = this.params;
    if (this.shot || postShot.busy || session.complete || !session.shotsRemaining) {
      return;
    }

    session.beginAttempt();

    const speedNorm = THREE.MathUtils.clamp(
      (swipeSpeed - SWIPE_SPEED_SLOW) / (SWIPE_SPEED_FAST - SWIPE_SPEED_SLOW),
      0,
      1,
    );
    const duration = THREE.MathUtils.lerp(
      SHOT_DURATION_SLOW,
      SHOT_DURATION_FAST,
      speedNorm,
    );

    this.params.audio.playKick(0.45 + 0.45 * speedNorm);

    let trajectory = session.plan.predeterminedWinScenario
      ? selectTrajectoryWinArc(swipeDx)
      : selectTrajectoryLoseArc(swipeDx);
    const target = new THREE.Vector3(trajectory.x, trajectory.y, trajectory.z);
    if (
      session.plan.predeterminedWinScenario &&
      !isTargetInsideScoringFrame(target)
    ) {
      trajectory = TRAJECTORIES[0]!;
      target.set(trajectory.x, trajectory.y, trajectory.z);
    }

    const decision = resolveShotOutcome({
      sessionPlan: session.plan,
      onFrame: isTargetInsideScoringFrame(target),
      attemptIndex: session.shotsTaken,
      competitiveKeeperSaveChance: this.params.getConfig()
        .competitiveKeeperSaveChance,
    });
    this.startKeeperReaction(decision.keeperReaction, trajectory);

    const dir = target.clone().sub(BALL_START).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const spinAxis = new THREE.Vector3().crossVectors(up, dir).normalize();
    spinAxis.x += (Math.random() - 0.5) * 0.4;
    spinAxis.y += (Math.random() - 0.5) * 0.4;
    spinAxis.normalize();

    this.shot = {
      t: 0,
      duration: decision.outcome === "save" ? SAVE_FLIGHT_TIME : duration,
      outcome: decision.outcome,
      from: BALL_START.clone(),
      target,
      arcHeight:
        decision.outcome === "save"
          ? 0.35
          : (0.45 + Math.random() * 0.5) * (1 - 0.4 * speedNorm),
      spinAxis,
      spinSpeed: 22 + Math.random() * 10 + 18 * speedNorm,
    };
    this.params.ballShadow.visible = false;
  }

  tick(dt: number) {
    if (!this.shot) return;
    if (this.params.session.plan.predeterminedWinScenario) {
      this.saveInterceptPoint = null;
    }

    this.shot.t += dt;
    const u = Math.min(this.shot.t / this.shot.duration, 1);
    const ease = 1 - Math.pow(1 - u, 2);

    const px = THREE.MathUtils.lerp(this.shot.from.x, this.shot.target.x, ease);
    const pz = THREE.MathUtils.lerp(this.shot.from.z, this.shot.target.z, ease);
    const baseY = THREE.MathUtils.lerp(
      this.shot.from.y,
      this.shot.target.y,
      ease,
    );
    const arc = Math.sin(Math.PI * u) * this.shot.arcHeight;
    this.params.ball.position.set(px, baseY + arc, pz);

    const spin = this.shot.spinSpeed * dt * (1 - 0.4 * u);
    this.params.ball.rotateOnWorldAxis(this.shot.spinAxis, spin);

    if (
      !this.params.session.plan.predeterminedWinScenario &&
      this.shot.outcome === "save" &&
      this.saveInterceptPoint
    ) {
      const keeperPlaneZ = this.saveInterceptPoint.z;
      const closeToHands =
        this.params.ball.position.distanceTo(this.saveInterceptPoint) < 0.55;
      const crossedKeeperPlane = this.params.ball.position.z <= keeperPlaneZ;
      if (closeToHands || crossedKeeperPlane) {
        this.resolveSavedShot();
        return;
      }
    }

    if (u < 1) return;

    if (
      this.params.session.plan.predeterminedWinScenario ||
      this.shot.outcome === "win"
    ) {
      this.resolveGoal();
      return;
    }
    if (this.shot.outcome === "save") {
      this.resolveSavedShot();
      return;
    }
    this.resolveMiss();
  }

  reset() {
    this.shot = null;
    this.saveInterceptPoint = null;
  }

  private startKeeperReaction(
    reaction: "score" | "save",
    trajectory: TrajectorySpec,
  ) {
    if (reaction === "score") {
      this.params.keeper.playScoringReaction(trajectory);
      this.saveInterceptPoint = null;
      return;
    }

    this.params.keeper.startDive(trajectory);
    this.saveInterceptPoint = new THREE.Vector3(
      trajectory.keeperTargetX,
      THREE.MathUtils.clamp(trajectory.y, BALL_R + 0.1, GOAL_H - 0.2),
      KEEPER_Z + 0.05,
    );
  }

  private resolveGoal() {
    if (!this.shot) return;
    this.params.session.recordAttemptResult("goal");
    this.params.shakeNet(this.params.ball.position);
    this.params.audio.playCheer(0.6);
    this.params.overlay.announce("GOAL!", "#ffd440");

    const dir = this.shot.target.clone().sub(this.shot.from).normalize();
    const avgSpeed = this.shot.from.distanceTo(this.shot.target) / this.shot.duration;
    this.params.postShot.startGoalRoll(
      new THREE.Vector3(dir.x * avgSpeed * 0.35, -1.2, dir.z * avgSpeed * 0.08),
    );
    this.shot = null;
  }

  private resolveSavedShot() {
    if (!this.shot || this.shot.outcome !== "save") return;
    this.params.session.recordAttemptResult("save");
    this.params.audio.playBoo(0.5);
    this.params.overlay.announce("SAVED!", "#78c8ff");
    if (this.saveInterceptPoint) {
      this.params.ball.position.copy(this.saveInterceptPoint);
    }
    this.params.postShot.startMiserableRebound();
    this.shot = null;
  }

  private resolveMiss() {
    this.params.session.recordAttemptResult("miss");
    this.params.audio.playBoo(0.5);
    this.params.overlay.announce("MISS", "#ff5a5a");
    window.setTimeout(this.params.resetBall, 950);
    this.shot = null;
  }
}
