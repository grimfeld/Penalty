/**
 * Loads the goalpost GLB (posts, crossbar, net) and provides a lightweight
 * whole-goal shake on scoring impacts (the net mesh is not skinned).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GOAL_W, GOAL_Z } from "./constants";

const GOAL_MODEL_ROT_Y_EXTRA = 0;

export type GoalNetEffects = {
  goalGroup: THREE.Group;
  shakeNet: (_impactWorld: THREE.Vector3) => void;
  tickNet: () => void;
};

export function addGoalAssembly(scene: THREE.Scene): GoalNetEffects {
  const goalGroup = new THREE.Group();
  scene.add(goalGroup);

  new GLTFLoader().load(
    "/goalpost.glb",
    (gltf) => {
      const model = gltf.scene;
      const probe = new THREE.Box3().setFromObject(model);
      const probeSize = probe.getSize(new THREE.Vector3());
      if (probeSize.z > probeSize.x) {
        model.rotation.y += Math.PI / 2;
      }
      model.rotation.y += GOAL_MODEL_ROT_Y_EXTRA;
      model.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(model);
      const size = bbox.getSize(new THREE.Vector3());
      if (size.x > 0.001) model.scale.setScalar(GOAL_W / size.x);
      const fitted = new THREE.Box3().setFromObject(model);
      const center = fitted.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.y -= fitted.min.y;
      model.position.z += GOAL_Z - fitted.max.z;
      model.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      goalGroup.add(model);
      const final = new THREE.Box3().setFromObject(model);
      const finalSize = final.getSize(new THREE.Vector3());
      console.log(
        `[goalpost] loaded /goalpost.glb — fitted to ${finalSize.x.toFixed(2)}m × ` +
          `${finalSize.y.toFixed(2)}m × ${finalSize.z.toFixed(2)}m, ` +
          `front face at z=${final.max.z.toFixed(2)}`,
      );
    },
    undefined,
    (err) => {
      console.error("[goalpost] failed to load /goalpost.glb", err);
    },
  );

  let netImpactStart = -1;
  function shakeNet(_impactWorld: THREE.Vector3) {
    netImpactStart = performance.now() / 1000;
  }
  function tickNet() {
    if (netImpactStart < 0) {
      goalGroup.position.set(0, 0, 0);
      return;
    }
    const t = performance.now() / 1000 - netImpactStart;
    const DUR = 0.4;
    if (t >= DUR) {
      goalGroup.position.set(0, 0, 0);
      netImpactStart = -1;
      return;
    }
    const decay = 1 - t / DUR;
    goalGroup.position.x = Math.sin(t * 60) * 0.015 * decay;
    goalGroup.position.z = Math.sin(t * 55) * 0.01 * decay;
  }

  return { goalGroup, shakeNet, tickNet };
}
