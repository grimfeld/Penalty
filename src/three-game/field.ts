/**
 * Grass pitch surface and FIFA-style white ground markings: goal line,
 * penalty and goal areas, penalty spot, penalty arc, centre spot.
 */
import * as THREE from "three";
import {
  GA_DEPTH,
  GA_W,
  GOAL_Z,
  PB_DEPTH,
  PB_FRONT_Z,
  PB_W,
  PEN_ARC_RADIUS,
  SPOT_RADIUS,
  SPOT_Z,
} from "./constants";

/** FIFA line width (12 cm); matches goal post thickness in spec. */
const PAINT_W = 0.12;

/**
 * Adds striped turf, painted lines, spot, arc segment, and a distant
 * centre spot for stadium context.
 */
export function addPitchSurfaceAndMarkings(scene: THREE.Scene): void {
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshLambertMaterial({ color: 0x52a846 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  for (let z = -36; z <= 6; z += 2.5) {
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 1.25),
      new THREE.MeshLambertMaterial({
        color: 0x60b850,
        transparent: true,
        opacity: 0.55,
      }),
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.001, z);
    scene.add(stripe);
  }

  const lineMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
  });

  function paintBand(centerX: number, centerZ: number, w: number, l: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(centerX, 0.005, centerZ);
    scene.add(m);
  }

  function paintBox(width: number, depth: number) {
    const front = GOAL_Z + depth;
    paintBand(0, front, width + PAINT_W, PAINT_W);
    paintBand(-width / 2, GOAL_Z + depth / 2, PAINT_W, depth);
    paintBand(width / 2, GOAL_Z + depth / 2, PAINT_W, depth);
  }

  paintBand(0, GOAL_Z, 60, PAINT_W);
  paintBox(PB_W, PB_DEPTH);
  paintBox(GA_W, GA_DEPTH);

  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(SPOT_RADIUS, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 0.008, SPOT_Z);
  scene.add(spot);

  {
    const d = PB_FRONT_Z - SPOT_Z;
    if (d > 0 && d < PEN_ARC_RADIUS) {
      const halfAngle = Math.acos(d / PEN_ARC_RADIUS);
      const SEGS = 48;
      const rIn = PEN_ARC_RADIUS - PAINT_W / 2;
      const rOut = PEN_ARC_RADIUS + PAINT_W / 2;
      const positions: number[] = [];
      const indices: number[] = [];
      for (let i = 0; i <= SEGS; i++) {
        const a = -halfAngle + (i / SEGS) * halfAngle * 2;
        const sx = Math.sin(a);
        const sz = Math.cos(a);
        positions.push(sx * rIn, 0, sz * rIn);
        positions.push(sx * rOut, 0, sz * rOut);
      }
      for (let i = 0; i < SEGS; i++) {
        const a0 = i * 2;
        const b0 = i * 2 + 1;
        const a1 = (i + 1) * 2;
        const b1 = (i + 1) * 2 + 1;
        indices.push(a0, b0, a1);
        indices.push(b0, b1, a1);
      }
      const arcGeo = new THREE.BufferGeometry();
      arcGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      arcGeo.setIndex(indices);
      arcGeo.computeVertexNormals();
      const arcMesh = new THREE.Mesh(arcGeo, lineMat);
      arcMesh.position.set(0, 0.006, SPOT_Z);
      scene.add(arcMesh);
    }
  }

  const centerSpot = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  centerSpot.rotation.x = -Math.PI / 2;
  centerSpot.position.set(0, 0.008, SPOT_Z + 30);
  scene.add(centerSpot);
}
