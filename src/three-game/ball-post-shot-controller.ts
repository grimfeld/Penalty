import * as THREE from "three";
import { BALL_R, BALL_START, GOAL_DEPTH, GOAL_H, GOAL_W, GOAL_Z } from "./constants";

type GoalRoll = { vel: THREE.Vector3; t: number };
type Rebound = {
  t: number;
  fromPos: THREE.Vector3;
  landingPos: THREE.Vector3;
};

const GRAVITY = 12;
const GOAL_NET_INSET = 0.5;
const GOAL_BACK_Z = GOAL_Z - GOAL_DEPTH + BALL_R;
const GOAL_FRONT_Z = GOAL_Z - BALL_R;
const GOAL_TOP_Y = GOAL_H - BALL_R;
const GOAL_SIDE_X = GOAL_W / 2 - GOAL_NET_INSET - BALL_R;

export class BallPostShotController {
  private goalRoll: GoalRoll | null = null;
  private rebound: Rebound | null = null;

  constructor(
    private readonly ball: THREE.Group,
    private readonly ballShadow: THREE.Object3D,
    private readonly resetBall: () => void,
  ) {}

  get busy() {
    return Boolean(this.goalRoll || this.rebound);
  }

  clear() {
    this.goalRoll = null;
    this.rebound = null;
  }

  startGoalRoll(initialVel: THREE.Vector3) {
    this.goalRoll = { vel: initialVel.clone(), t: 0 };
  }

  startMiserableRebound() {
    const fromPos = this.ball.position.clone();
    const landingX = THREE.MathUtils.lerp(BALL_START.x, fromPos.x, 0.3);
    const landingZ = THREE.MathUtils.lerp(BALL_START.z, fromPos.z, 0.4);
    this.rebound = {
      t: 0,
      fromPos,
      landingPos: new THREE.Vector3(landingX, BALL_R, landingZ),
    };
  }

  tick(dt: number) {
    this.updateRebound(dt);
    this.updateGoalRoll(dt);
  }

  private updateGoalRoll(dt: number) {
    if (!this.goalRoll) return;
    this.goalRoll.t += dt;
    this.goalRoll.vel.y -= GRAVITY * dt;
    this.ball.position.addScaledVector(this.goalRoll.vel, dt);

    if (this.ball.position.z < GOAL_BACK_Z) {
      this.ball.position.z = GOAL_BACK_Z;
      this.goalRoll.vel.z = Math.max(0, this.goalRoll.vel.z) * 0.2;
    }
    if (this.ball.position.z > GOAL_FRONT_Z) {
      this.ball.position.z = GOAL_FRONT_Z;
      this.goalRoll.vel.z = Math.min(0, this.goalRoll.vel.z) * 0.2;
    }
    if (this.ball.position.x > GOAL_SIDE_X) {
      this.ball.position.x = GOAL_SIDE_X;
      this.goalRoll.vel.x = Math.min(0, this.goalRoll.vel.x) * 0.2;
    } else if (this.ball.position.x < -GOAL_SIDE_X) {
      this.ball.position.x = -GOAL_SIDE_X;
      this.goalRoll.vel.x = Math.max(0, this.goalRoll.vel.x) * 0.2;
    }
    if (this.ball.position.y > GOAL_TOP_Y) {
      this.ball.position.y = GOAL_TOP_Y;
      if (this.goalRoll.vel.y > 0) this.goalRoll.vel.y *= -0.4;
      this.goalRoll.vel.x *= 0.8;
      this.goalRoll.vel.z *= 0.8;
    }
    if (this.ball.position.y < BALL_R) {
      this.ball.position.y = BALL_R;
      if (this.goalRoll.vel.y < 0) this.goalRoll.vel.y *= -0.4;
      this.goalRoll.vel.x *= 0.65;
      this.goalRoll.vel.z *= 0.65;
    }

    this.goalRoll.vel.multiplyScalar(1 - 0.6 * dt);
    const speed = this.goalRoll.vel.length();
    if (speed > 0.05) {
      const axis = new THREE.Vector3(0, 1, 0)
        .cross(this.goalRoll.vel)
        .normalize();
      this.ball.rotateOnWorldAxis(axis, Math.min(speed, 8) * dt);
    }

    if (
      this.ball.position.y <= BALL_R + 0.001 &&
      this.goalRoll.vel.lengthSq() < 0.04 &&
      this.goalRoll.t > 0.6
    ) {
      this.goalRoll = null;
      window.setTimeout(this.resetBall, 350);
    }
  }

  private updateRebound(dt: number) {
    if (!this.rebound) return;
    const phaseA = 0.55;
    const phaseB = 1.5;
    this.rebound.t += dt;

    if (this.rebound.t < phaseA) {
      const u = this.rebound.t / phaseA;
      this.ball.position.x = THREE.MathUtils.lerp(
        this.rebound.fromPos.x,
        this.rebound.landingPos.x,
        u,
      );
      this.ball.position.z = THREE.MathUtils.lerp(
        this.rebound.fromPos.z,
        this.rebound.landingPos.z,
        u,
      );
      const baseY = THREE.MathUtils.lerp(
        this.rebound.fromPos.y,
        this.rebound.landingPos.y,
        u,
      );
      this.ball.position.y = baseY + Math.sin(Math.PI * u) * 0.4;
      this.ball.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 6 * dt);
      return;
    }

    const u = Math.min((this.rebound.t - phaseA) / phaseB, 1);
    const ease = 1 - Math.pow(1 - u, 2.2);
    this.ball.position.x = THREE.MathUtils.lerp(
      this.rebound.landingPos.x,
      BALL_START.x,
      ease,
    );
    this.ball.position.z = THREE.MathUtils.lerp(
      this.rebound.landingPos.z,
      BALL_START.z,
      ease,
    );
    this.ball.position.y = BALL_R;
    this.ball.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 4 * (1 - ease) * dt);
    if (u >= 1) {
      this.rebound = null;
      this.ball.rotation.set(0, 0, 0);
      this.ballShadow.visible = true;
    }
  }
}
