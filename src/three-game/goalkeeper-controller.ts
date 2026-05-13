import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  KEEPER_GLB_CLIP_URLS,
  KEEPER_GLB_MODEL_URL,
  KEEPER_HEIGHT,
  KEEPER_Z,
  type KeeperClipKey,
} from "./constants";
import { makeKeeperFallback } from "./procedural";
import type { TrajectorySpec } from "./shot-trajectory";

const HALF_KEEPER = KEEPER_HEIGHT / 2;
const KEEPER_REACTION = 0.06;
const DIVE_DURATION = 0.7;

export const SAVE_FLIGHT_TIME = KEEPER_REACTION + DIVE_DURATION;

export class GoalkeeperController {
  readonly group = new THREE.Group();

  private readonly body = new THREE.Group();
  private readonly tilt = new THREE.Group();
  private readonly fallback = makeKeeperFallback();
  private readonly loader = new GLTFLoader();
  private readonly actions: Partial<Record<KeeperClipKey, THREE.AnimationAction>> =
    {};
  private readonly actionLoads: Partial<
    Record<KeeperClipKey, Promise<THREE.AnimationAction | null>>
  > = {};

  private mixer: THREE.AnimationMixer | null = null;
  private actionToken = 0;
  private loadAborted = false;
  private idle = true;
  private readonly breathStart = performance.now() / 1000;

  constructor(scene: THREE.Scene) {
    this.tilt.position.y = HALF_KEEPER;
    this.body.add(this.tilt);
    this.group.add(this.body);
    this.group.position.set(0, 0, KEEPER_Z);
    scene.add(this.group);

    this.fallback.position.y = -HALF_KEEPER;
    this.tilt.add(this.fallback);
    this.loadModel();
  }

  playAction(name: KeeperClipKey, fade = 0.1) {
    const token = ++this.actionToken;
    void this.ensureAction(name).then((next) => {
      if (!next || token !== this.actionToken) return;
      const loopOnce = name !== "idle";
      next.enabled = true;
      next.clampWhenFinished = loopOnce;
      next.setLoop(
        loopOnce ? THREE.LoopOnce : THREE.LoopRepeat,
        loopOnce ? 1 : Infinity,
      );
      next.reset().fadeIn(fade).play();
      for (const [key, action] of Object.entries(this.actions)) {
        if (key !== name && action) action.fadeOut(fade);
      }
    });
  }

  playScoringReaction(scoringTrajectory: TrajectorySpec) {
    this.playAction(this.nonMatchingAction(scoringTrajectory), 0.05);
    this.idle = false;
  }

  startDive(trajectory: TrajectorySpec) {
    this.playAction(trajectory.saveAction, 0.05);
    this.idle = false;
  }

  tick(dt: number) {
    this.mixer?.update(dt);
    if (this.idle) {
      this.applyBreathing();
    }
  }

  reset() {
    this.idle = true;
    this.group.position.set(0, 0, KEEPER_Z);
    this.body.position.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    this.tilt.rotation.z = 0;
    this.playAction("idle");
  }

  dispose() {
    this.loadAborted = true;
    this.mixer?.stopAllAction();
  }

  private async ensureAction(
    name: KeeperClipKey,
  ): Promise<THREE.AnimationAction | null> {
    if (!this.mixer) return null;
    if (this.actions[name]) return this.actions[name]!;
    if (this.actionLoads[name]) return this.actionLoads[name]!;

    const load = this.loader
      .loadAsync(KEEPER_GLB_CLIP_URLS[name])
      .then((asset) => {
        if (!this.mixer) return null;
        const clip = this.normalizeLateralStart(asset.animations?.[0]);
        if (!clip) return null;
        const action = this.mixer.clipAction(clip);
        this.actions[name] = action;
        return action;
      })
      .catch((err) => {
        console.warn(`[keeper GLB] failed to load clip ${name}`, err);
        return null;
      });
    this.actionLoads[name] = load;
    return load;
  }

  private loadModel() {
    this.loader.load(
      KEEPER_GLB_MODEL_URL,
      async (gltf) => {
        if (this.loadAborted) return;
        const model = gltf.scene;
        const bbox = new THREE.Box3().setFromObject(model);
        const size = bbox.getSize(new THREE.Vector3());
        if (size.y > 0.001) {
          const scale = KEEPER_HEIGHT / size.y;
          model.scale.setScalar(scale);
        }
        const fitted = new THREE.Box3().setFromObject(model);
        const center = fitted.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.rotation.y = 0;
        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) mesh.castShadow = true;
        });

        this.tilt.remove(this.fallback);
        this.fallback.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry?.dispose();
            (mesh.material as THREE.Material | undefined)?.dispose?.();
          }
        });
        this.tilt.add(model);

        this.mixer = new THREE.AnimationMixer(model);
        void this.ensureAction("idle");
        void this.ensureAction("stepL");
        void this.ensureAction("stepR");
        void this.ensureAction("diveL");
        void this.ensureAction("diveR");
        void this.ensureAction("diveC");
        void this.ensureAction("scoop");
        void this.ensureAction("high");
        void this.ensureAction("jump");
        void this.ensureAction("blockL");
        void this.ensureAction("blockR");
        this.playAction("idle", 0.01);
      },
      undefined,
      (err) => {
        console.warn("keeper GLB failed to load; using primitives fallback", err);
      },
    );
  }

  private normalizeLateralStart(clip: THREE.AnimationClip | undefined) {
    if (!clip) return null;
    const tracks = clip.tracks.map((track) => {
      if (!track.name.endsWith(".position")) return track;
      const values = Array.from(track.values);
      const initialX = values[0] ?? 0;
      const initialZ = values[2] ?? 0;
      for (let i = 0; i < values.length; i += 3) {
        values[i] -= initialX;
        values[i + 2] -= initialZ;
      }
      return new THREE.VectorKeyframeTrack(track.name, track.times, values);
    });
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  private applyBreathing() {
    const t = performance.now() / 1000 - this.breathStart;
    const phase = Math.sin((t * 2 * Math.PI) / 4);
    this.body.position.y = phase * 0.018;
    this.body.scale.set(
      1 + phase * 0.012,
      1 + phase * 0.018,
      1 + phase * 0.012,
    );
  }

  private nonMatchingAction(trajectory: TrajectorySpec): KeeperClipKey {
    if (trajectory.saveAction === "diveL" || trajectory.saveAction === "blockL") {
      return "diveR";
    }
    if (trajectory.saveAction === "diveR" || trajectory.saveAction === "blockR") {
      return "diveL";
    }
    return Math.random() < 0.5 ? "diveL" : "diveR";
  }
}
