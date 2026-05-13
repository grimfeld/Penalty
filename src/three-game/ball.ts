/**
 * Match ball: placeholder sphere swapped for `/ball.glb` when loaded
 * (Meshopt-compressed; decoder must be registered on the loader).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { BALL_R, BALL_START } from "./constants";

export type BallSetup = {
  ball: THREE.Group;
  ballShadow: THREE.Mesh;
};

export function addBallToScene(scene: THREE.Scene): BallSetup {
  const ball = new THREE.Group();
  ball.position.copy(BALL_START);
  scene.add(ball);

  const ballPlaceholder = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.55 }),
  );
  ballPlaceholder.castShadow = true;
  ball.add(ballPlaceholder);

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load("/ball.glb", (gltf) => {
    const model = gltf.scene;
    const probe = new THREE.Box3().setFromObject(model);
    const probeSize = probe.getSize(new THREE.Vector3());
    const half = Math.max(probeSize.x, probeSize.y, probeSize.z) / 2;
    if (half > 0.001) model.scale.setScalar(BALL_R / half);
    const fitted = new THREE.Box3().setFromObject(model);
    const center = fitted.getCenter(new THREE.Vector3());
    model.position.sub(center);
    model.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    ball.remove(ballPlaceholder);
    ballPlaceholder.geometry.dispose();
    (ballPlaceholder.material as THREE.Material).dispose();
    ball.add(model);
  });

  const ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(BALL_R * 1.6, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
  );
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.set(BALL_START.x, 0.012, BALL_START.z);
  scene.add(ballShadow);

  return { ball, ballShadow };
}
