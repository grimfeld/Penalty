import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// =====================================================================
// 3D penalty shootout, Three.js flavor.
//
// Pitch dimensions follow the IFAB Laws of the Game (FIFA):
//   Goal:          7.32 m wide × 2.44 m tall  (here +30% wide, +20% tall
//                  for visual prominence at the camera distance)
//   Goal area:     5.5 m deep × 18.32 m wide  (6-yard box)
//   Penalty area:  16.5 m deep × 40.32 m wide (18-yard box)
//   Penalty spot:  11 m from the goal line
//   Penalty arc:   9.15 m radius from the spot, drawn outside the box
//   Ball:          22 cm diameter (here doubled for visual prominence)
//
// External assets used in this scene (all CC0 except the Kadow Club
// logo, which the user owns):
//   /keeper.glb                      Kenney "Blocky Characters 2.0" character-d (CC0)
//   /Textures/texture-d.png          GLB-referenced texture (CC0, relative URI)
//   /kadow-logo.webp                 Kadow Club wordmark (user-owned)
//   /kick.ogg /cheer.ogg /boo.ogg    reused from the 2D build
// =====================================================================

const GOAL_W = 10;   // (FIFA 7.32 m)
const GOAL_H = 3;   // (FIFA 2.44 m, scaled up 20%)
const GOAL_DEPTH = 1.8;
const GOAL_Z = -22;                  // goal line (front face of the goal)

const PB_W = 40.32;                  // FIFA penalty-area width
const PB_DEPTH = 16.5;
const PB_FRONT_Z = GOAL_Z + PB_DEPTH;
const GA_W = 18.32;
const GA_DEPTH = 5.5;

const PENALTY_DISTANCE = 7;          // ball-to-goal-line distance (FIFA spec is 11 m)
const SPOT_Z = GOAL_Z + PENALTY_DISTANCE;
const PEN_ARC_RADIUS = 9.15;
const SPOT_RADIUS = 0.22;

// Real ball is 22 cm diameter (radius 0.11 m). We render it at 2× so
// it stays visually prominent at the 11 m camera distance.
const BALL_R = 0.22;
const BALL_START = new THREE.Vector3(0, BALL_R, SPOT_Z);

const KEEPER_HEIGHT = 1.88 * 1.2;   // 2.256 m  (real keeper height + 20%)
const KEEPER_Z = GOAL_Z + 0.2;

// Shot flight time scales with swipe speed: a slow drag arrives in
// SHOT_DURATION_SLOW seconds, a hard flick in SHOT_DURATION_FAST.
const SHOT_DURATION_SLOW = 0.85;
const SHOT_DURATION_FAST = 0.32;
// Swipe-speed bounds in pixels per millisecond. Below SLOW the shot is
// at its slowest; above FAST it's capped at the fastest.
const SWIPE_SPEED_SLOW = 0.5;
const SWIPE_SPEED_FAST = 3.0;
const FIRM_SWIPE_PX = 220;

const SWIPE_MIN_UP = 30;
const SWIPE_MAX_DURATION_MS = 1000;

const KEEPER_GLB_MODEL_URL = new URL("./assets/Ch38_nonPBR.glb", import.meta.url).href;
const KEEPER_GLB_CLIP_URLS = {
  idle: new URL("./assets/Ch38_nonPBR@Goalkeeper Idle.glb", import.meta.url).href,
  stepL: new URL("./assets/Ch38_nonPBR@Goalkeeper Sidestep L.glb", import.meta.url).href,
  stepR: new URL("./assets/Ch38_nonPBR@Goalkeeper Sidestep R.glb", import.meta.url).href,
  diveL: new URL("./assets/Ch38_nonPBR@Goalkeeper Diving Save L.glb", import.meta.url).href,
  diveR: new URL("./assets/Ch38_nonPBR@Goalkeeper Diving Save R.glb", import.meta.url).href,
  diveC: new URL("./assets/Ch38_nonPBR@Goalkeeper Catch Low.glb", import.meta.url).href,
  scoop: new URL("./assets/Ch38_nonPBR@Goalkeeper Scoop.glb", import.meta.url).href,
  high: new URL("./assets/Ch38_nonPBR@Goalkeeper Catch High.glb", import.meta.url).href,
  jump: new URL("./assets/Ch38_nonPBR@Goalkeeper Catch Jump.glb", import.meta.url).href,
  blockL: new URL("./assets/Ch38_nonPBR@Goalkeeper Body Block L.glb", import.meta.url).href,
  blockR: new URL("./assets/Ch38_nonPBR@Goalkeeper Body Block R.glb", import.meta.url).href,
} as const;

export function mount(stage: HTMLElement, slider: HTMLInputElement): () => void {
  const canvas = document.createElement("canvas");
  const overlay = document.createElement("canvas");
  for (const el of [canvas, overlay]) {
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.width = "100%";
    el.style.height = "100%";
  }
  overlay.style.pointerEvents = "none";
  stage.insertBefore(canvas, stage.firstChild);
  stage.insertBefore(overlay, canvas.nextSibling);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const overlayCtx = overlay.getContext("2d")!;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x86c5ff);
  scene.fog = new THREE.Fog(0x86c5ff, 28, 90);

  // Camera ~4m behind the penalty spot, lowered so the goal fills more
  // of the frame and the 11 m kick distance reads correctly. FOV 45
  // (a typical broadcast-style narrow lens) makes the goal sit larger
  // on screen while still keeping the whole (now doubled-size) ball
  // comfortably above the bottom of the viewport.
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  camera.position.set(0, 1.55, SPOT_Z + 4);
  camera.lookAt(0, 1.0, GOAL_Z);
  // Slight roll around the view axis for a handheld broadcast feel.
  camera.rotateY(0);

  // ---- Lighting -----------------------------------------------------
  const sun = new THREE.DirectionalLight(0xfff5dc, 1.6);
  sun.position.set(8, 22, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xc9e2ff, 0x88aa66, 0.9));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  // ---- Pitch --------------------------------------------------------
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

  // White paint for ground markings. FIFA spec: lines are 12 cm wide
  // (and must be the same width as the goalposts they sit on).
  const PAINT_W = 0.12;
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
  // Box helper: draws front + two sides. Sides are extended by PAINT_W
  // so they overlap the goal line at the back and the front line at the
  // front, giving clean corner joins.
  function paintBox(width: number, depth: number) {
    const front = GOAL_Z + depth;
    paintBand(0, front, width + PAINT_W, PAINT_W);
    paintBand(-width / 2, GOAL_Z + depth / 2, PAINT_W, depth);
    paintBand( width / 2, GOAL_Z + depth / 2, PAINT_W, depth);
  }

  // Goal line — full pitch width (60 m is wider than the visible field
  // so the line never appears to end mid-frame).
  paintBand(0, GOAL_Z, 60, PAINT_W);
  // Penalty area (18-yard box) and goal area (6-yard box).
  paintBox(PB_W, PB_DEPTH);
  paintBox(GA_W, GA_DEPTH);

  // Penalty spot — explicit white painted dot the ball sits on.
  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(SPOT_RADIUS, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 0.008, SPOT_Z);
  scene.add(spot);

  // Penalty arc ("D") — 9.15 m radius around the spot, drawn only on
  // the field side of the penalty-area front line. The arc enters the
  // box where its z-component (in spot-local coords) equals PB_FRONT_Z
  // − SPOT_Z, so cos(halfAngle) = d / r → halfAngle = acos(d/r).
  {
    const d = PB_FRONT_Z - SPOT_Z;  // +z distance from spot to box front
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

  // Center spot + halfway line for stadium completeness.
  const centerSpot = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  centerSpot.rotation.x = -Math.PI / 2;
  centerSpot.position.set(0, 0.008, SPOT_Z + 30);
  scene.add(centerSpot);

  // ---- Goal frame (loaded from /goalpost.glb) -----------------------
  // The model includes posts, crossbar AND netting. We load it into a
  // wrapper Group so the rest of the code can shake/transform the goal
  // without re-binding to the inner mesh.
  //   Width  → fitted to GOAL_W (auto-detects whether the model's wider
  //            horizontal axis is x or z, rotates 90° around y if needed).
  //   Height → falls out of the same uniform scale; goal's underside-of-
  //            crossbar is wherever the model puts it, so the in-game
  //            GOAL_H may not exactly match the model. Tweak GOAL_W if
  //            the proportions look off.
  //   Depth  → same uniform scale; positioned so the front of the goal
  //            sits on the goal line at z=GOAL_Z.
  // GOAL_MODEL_ROT_Y_EXTRA: add a 180° rotation here if the model's
  //   "front" ends up facing away from the kicker.
  const GOAL_MODEL_ROT_Y_EXTRA = 0;
  const goalGroup = new THREE.Group();
  scene.add(goalGroup);
  new GLTFLoader().load(
    "/goalpost.glb",
    (gltf) => {
      const model = gltf.scene;
      // Initial bbox to find the wider horizontal axis.
      const probe = new THREE.Box3().setFromObject(model);
      const probeSize = probe.getSize(new THREE.Vector3());
      if (probeSize.z > probeSize.x) {
        model.rotation.y += Math.PI / 2;  // wider axis was z; rotate so it becomes x
      }
      model.rotation.y += GOAL_MODEL_ROT_Y_EXTRA;
      model.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(model);
      const size = bbox.getSize(new THREE.Vector3());
      if (size.x > 0.001) model.scale.setScalar(GOAL_W / size.x);
      // Re-fit to ground the feet, center horizontally, and align front
      // face with the goal line.
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

  // Net shake — the GLB net is static geometry, so we wobble the whole
  // goal slightly on impact instead of deforming individual mesh
  // vertices. Subtle so it doesn't look like the posts are wobbling.
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

  // ---- Crowd backdrop ----------------------------------------------
  // Procedural: a grid of head-coloured dots on a dark base, applied
  // to a tall plane stretching across the back of the stadium plus
  // shorter side stands. Repeated horizontally so the texture tiles
  // across the wide back stand without distortion.
  const crowdTex = makeCrowdTexture();
  crowdTex.wrapS = THREE.RepeatWrapping;
  const crowdMat = new THREE.MeshBasicMaterial({ map: crowdTex });
  // Back stand: a wide flat plane perpendicular to the goal axis,
  // a few metres behind the net.
  const backStandW = 100;
  const backStandH = 18;
  crowdTex.repeat.set(backStandW / 14, 1);
  const backStand = new THREE.Mesh(
    new THREE.PlaneGeometry(backStandW, backStandH),
    crowdMat,
  );
  backStand.position.set(0, backStandH / 2, GOAL_Z - GOAL_DEPTH - 8);
  scene.add(backStand);
  // Side stands: parallel to the field axis at the visible edges of
  // the frustum, joined to the back stand at their far end. We size
  // and position them so they read as a continuous U-shaped stadium
  // bowl from the camera's POV.
  const sideTex = makeCrowdTexture();
  sideTex.wrapS = THREE.RepeatWrapping;
  const sideStandW = 36;
  const sideStandH = 16;
  const sideX = 24;
  const sideZCenter = GOAL_Z - GOAL_DEPTH - 8 + sideStandW / 2;
  sideTex.repeat.set(sideStandW / 14, 1);
  const sideMat = new THREE.MeshBasicMaterial({ map: sideTex });
  const leftStand = new THREE.Mesh(
    new THREE.PlaneGeometry(sideStandW, sideStandH),
    sideMat,
  );
  leftStand.rotation.y = Math.PI / 2;
  leftStand.position.set(-sideX, sideStandH / 2, sideZCenter);
  scene.add(leftStand);
  const rightStand = leftStand.clone();
  rightStand.rotation.y = -Math.PI / 2;
  rightStand.position.x = sideX;
  scene.add(rightStand);

  // ---- Sponsor (Kadow Club) advertising boards ---------------------
  // We composite the logo onto a navy banner via a canvas; the banner
  // texture repeats across each board so a single board reads as
  // multiple LED panels.
  const adCanvas = document.createElement("canvas");
  adCanvas.width = 1024;
  adCanvas.height = 192;
  const adCtx = adCanvas.getContext("2d")!;
  function paintAd(logoImg: HTMLImageElement | null) {
    const w = adCanvas.width;
    const h = adCanvas.height;
    const grad = adCtx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0c2a55");
    grad.addColorStop(1, "#06163a");
    adCtx.fillStyle = grad;
    adCtx.fillRect(0, 0, w, h);
    if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
      const logoH = h * 0.78;
      const logoW = logoH * (logoImg.naturalWidth / logoImg.naturalHeight);
      adCtx.drawImage(logoImg, (w - logoW) / 2, (h - logoH) / 2, logoW, logoH);
    } else {
      adCtx.fillStyle = "#ffffff";
      adCtx.font = "bold 96px system-ui, sans-serif";
      adCtx.textAlign = "center";
      adCtx.textBaseline = "middle";
      adCtx.fillText("KADOW CLUB", w / 2, h / 2);
    }
    adTex.needsUpdate = true;
  }
  const adTex = new THREE.CanvasTexture(adCanvas);
  adTex.colorSpace = THREE.SRGBColorSpace;
  adTex.wrapS = THREE.RepeatWrapping;
  paintAd(null);
  const adImg = new Image();
  adImg.onload = () => paintAd(adImg);
  adImg.onerror = () => paintAd(null);
  adImg.src = "/kadow-logo.webp";

  function placeAdBoard(centerX: number, centerZ: number, length: number, rotY: number) {
    // Each board is 0.7m tall, lifted slightly off the ground so the
    // bottom shadow doesn't z-fight with the grass.
    const tex = adTex.clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(length / 4, 1);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(length, 0.7),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    m.position.set(centerX, 0.42, centerZ);
    m.rotation.y = rotY;
    scene.add(m);
  }
  // Behind the goal, between the goal and the back stand.
  placeAdBoard(0, GOAL_Z - GOAL_DEPTH - 1.5, 36, 0);
  // Along each sideline, joining the back row to the side stands.
  placeAdBoard(-sideX + 0.5, GOAL_Z - GOAL_DEPTH / 2 + 4, 24, Math.PI / 2);
  placeAdBoard(sideX - 0.5, GOAL_Z - GOAL_DEPTH / 2 + 4, 24, -Math.PI / 2);

  // ---- Ball ---------------------------------------------------------
  // Wrapper Group lets us swap the visible mesh (placeholder → GLB)
  // without rebinding every shot/rebound/goal-roll callsite that drives
  // ball.position / ball.rotation.
  const ball = new THREE.Group();
  ball.position.copy(BALL_START);
  scene.add(ball);
  const ballPlaceholder = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.55 }),
  );
  ballPlaceholder.castShadow = true;
  ball.add(ballPlaceholder);
  // The optimized ball uses EXT_meshopt_compression — without the
  // MeshoptDecoder registered, GLTFLoader silently fails and the
  // placeholder sphere sticks.
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load("/ball.glb", (gltf) => {
    const model = gltf.scene;
    // Fit the model so its largest half-extent equals BALL_R, then
    // re-centre on the origin so spin rotates around the ball's centre.
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

  // ---- Keeper -------------------------------------------------------
  // Hierarchy:
  //   keeper      → world position (drives x for dive, y for lift)
  //     keeperBody → breathing scale + bob (only while idle)
  //       keeperTilt → dive rotation; offset up by halfHeight so its
  //                    origin sits at the keeper's hip — rotating around
  //                    that pivot lets the body go horizontal in the air
  //                    instead of pinning the feet to the ground.
  //         model    → centered on its bbox center (not feet) so the
  //                    pivot above coincides with the body's centre.
  const HALF_KEEPER = KEEPER_HEIGHT / 2;
  const keeper = new THREE.Group();
  const keeperBody = new THREE.Group();
  const keeperTilt = new THREE.Group();
  keeperTilt.position.y = HALF_KEEPER;
  keeperBody.add(keeperTilt);
  keeper.add(keeperBody);
  keeper.position.set(0, 0, KEEPER_Z);
  scene.add(keeper);

  const fallback = makeKeeperFallback();
  fallback.position.y = -HALF_KEEPER;     // re-center fallback on the body pivot
  keeperTilt.add(fallback);

  const keeperLoader = new GLTFLoader();
  type KeeperActionName =
    | "idle"
    | "stepL" | "stepR"
    | "diveL" | "diveR" | "diveC"
    | "scoop" | "high" | "jump"
    | "blockL" | "blockR";
  const keeperActions: Partial<Record<KeeperActionName, THREE.AnimationAction>> = {};
  const keeperActionLoads: Partial<Record<KeeperActionName, Promise<THREE.AnimationAction | null>>> = {};
  let keeperMixer: THREE.AnimationMixer | null = null;
  let keeperActionToken = 0;
  const keeperUsesClipBodyMotion = () => Boolean(keeperMixer && keeperActions.idle);
  async function ensureKeeperAction(name: KeeperActionName): Promise<THREE.AnimationAction | null> {
    if (!keeperMixer) return null;
    if (keeperActions[name]) return keeperActions[name]!;
    if (keeperActionLoads[name]) return keeperActionLoads[name]!;

    const load = keeperLoader.loadAsync(KEEPER_GLB_CLIP_URLS[name]).then((asset) => {
      if (!keeperMixer) return null;
      const clip = asset.animations?.[0];
      if (!clip) return null;
      const action = keeperMixer.clipAction(clip);
      keeperActions[name] = action;
      return action;
    }).catch((err) => {
      console.warn(`[keeper GLB] failed to load clip ${name}`, err);
      return null;
    });
    keeperActionLoads[name] = load;
    return load;
  }
  function playKeeperAction(name: KeeperActionName, fade = 0.1) {
    const token = ++keeperActionToken;
    void ensureKeeperAction(name).then((next) => {
      if (!next || token !== keeperActionToken) return;
      const loopOnce = name !== "idle";
      next.enabled = true;
      next.clampWhenFinished = loopOnce;
      next.setLoop(loopOnce ? THREE.LoopOnce : THREE.LoopRepeat, loopOnce ? 1 : Infinity);
      next.reset().fadeIn(fade).play();
      for (const [k, action] of Object.entries(keeperActions)) {
        if (k !== name && action) action.fadeOut(fade);
      }
    });
  }
  let keeperLoadAborted = false;
  keeperLoader.load(
    KEEPER_GLB_MODEL_URL,
    async (gltf) => {
      if (keeperLoadAborted) return;
      const model = gltf.scene;
      const bbox = new THREE.Box3().setFromObject(model);
      const size = bbox.getSize(new THREE.Vector3());
      if (size.y > 0.001) {
        const s = KEEPER_HEIGHT / size.y;
        model.scale.setScalar(s);
      }
      const fitted = new THREE.Box3().setFromObject(model);
      const center = fitted.getCenter(new THREE.Vector3());
      model.position.sub(center);   // body centre at keeperTilt's pivot
      model.rotation.y = 0;
      model.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) m.castShadow = true;
      });

      keeperTilt.remove(fallback);
      fallback.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          (m.material as THREE.Material | undefined)?.dispose?.();
        }
      });
      keeperTilt.add(model);

      keeperMixer = new THREE.AnimationMixer(model);
      // Pre-warm keeper clips so first saves don't start late on network fetch.
      void ensureKeeperAction("idle");
      void ensureKeeperAction("stepL");
      void ensureKeeperAction("stepR");
      void ensureKeeperAction("diveL");
      void ensureKeeperAction("diveR");
      void ensureKeeperAction("diveC");
      void ensureKeeperAction("scoop");
      void ensureKeeperAction("high");
      void ensureKeeperAction("jump");
      void ensureKeeperAction("blockL");
      void ensureKeeperAction("blockR");
      playKeeperAction("idle", 0.01);
    },
    undefined,
    (err) => {
      console.warn("keeper GLB failed to load; using primitives fallback", err);
    },
  );

  // Keeper behavior: stays at the centre of the goal until the kicker
  // shoots, then commits to a single dive — 49% left, 49% right, 2%
  // centre jump. The dive direction is independent of the shot
  // outcome: the slider still decides win/save/miss, so the keeper can
  // pick the right side and still concede if the slider is on "win".
  type KeeperState =
    | { kind: "idle" }
    | { kind: "dive";    t: number; reactDelay: number; duration: number;
        fromX: number; fromY: number; fromLean: number;
        targetX: number; lift: number; lean: number;
        preAction: KeeperActionName | null; mainAction: KeeperActionName; mainPlayed: boolean }
    | { kind: "recover"; t: number; duration: number;
        fromX: number; fromY: number; fromLean: number };
  let keeperState: KeeperState = { kind: "idle" };
  const KEEPER_REACTION = 0.06;
  const DIVE_DURATION = 0.7;
  const RECOVER_DURATION = 1.2;
  const SAVE_FLIGHT_TIME = KEEPER_REACTION + DIVE_DURATION;

  const SIDE_LIFT = 0.7;                    // metres airborne at the apex
  // A slight lateral lean — enough to read as a committed dive but
  // nowhere near horizontal. ~30°.
  const SIDE_LEAN = Math.PI / 6;
  // Lateral reach for the dive: stay just inside the post by ~0.4 m.
  const SIDE_DIVE_X = Math.max(0, GOAL_W / 2 - 0.4);

  type TrajectoryKey = "center" | "left" | "right" | "outsideLeft" | "outsideRight";
  type TrajectorySpec = {
    key: TrajectoryKey;
    x: number;
    y: number;
    z: number;
    keeperTargetX: number;
    keeperLift: number;
    keeperLean: number;
    saveAction: KeeperActionName;
  };

  const TRAJECTORIES: readonly TrajectorySpec[] = [
    { key: "center", x: 0, y: 1.25, z: GOAL_Z - GOAL_DEPTH + 0.05, keeperTargetX: 0, keeperLift: 0, keeperLean: 0, saveAction: "diveC" },
    { key: "left", x: -GOAL_W * 0.27, y: 1.15, z: GOAL_Z - GOAL_DEPTH + 0.05, keeperTargetX: -SIDE_DIVE_X * 0.72, keeperLift: SIDE_LIFT * 0.45, keeperLean: SIDE_LEAN * 0.6, saveAction: "diveL" },
    { key: "right", x: GOAL_W * 0.27, y: 1.15, z: GOAL_Z - GOAL_DEPTH + 0.05, keeperTargetX: SIDE_DIVE_X * 0.72, keeperLift: SIDE_LIFT * 0.45, keeperLean: -SIDE_LEAN * 0.6, saveAction: "diveR" },
    { key: "outsideLeft", x: -GOAL_W * 0.62, y: 1.35, z: GOAL_Z - 0.05, keeperTargetX: -SIDE_DIVE_X, keeperLift: SIDE_LIFT * 0.25, keeperLean: SIDE_LEAN * 0.35, saveAction: "blockL" },
    { key: "outsideRight", x: GOAL_W * 0.62, y: 1.35, z: GOAL_Z - 0.05, keeperTargetX: SIDE_DIVE_X, keeperLift: SIDE_LIFT * 0.25, keeperLean: -SIDE_LEAN * 0.35, saveAction: "blockR" },
  ];

  function selectTrajectoryFromSwipe(swipeDx: number): TrajectorySpec {
    const maxAim = GOAL_W * 0.62;
    const aimX = THREE.MathUtils.clamp((swipeDx / FIRM_SWIPE_PX) * maxAim, -maxAim, maxAim);
    let best = TRAJECTORIES[0];
    let bestDist = Math.abs(aimX - best.x);
    for (const t of TRAJECTORIES) {
      const d = Math.abs(aimX - t.x);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  function pickScoreAction(exclude: KeeperActionName): KeeperActionName {
    const pool: KeeperActionName[] = ["idle", "stepL", "stepR", "scoop", "high", "jump", "diveC"];
    const options = pool.filter((p) => p !== exclude);
    return options[(Math.random() * options.length) | 0] ?? "idle";
  }

  function startKeeperDive(targetX: number, lift: number, lean: number, saveAction: KeeperActionName) {
    const actionPlan = { preAction: null as KeeperActionName | null, mainAction: saveAction };
    if (actionPlan.preAction) playKeeperAction(actionPlan.preAction, 0.05);
    else playKeeperAction(actionPlan.mainAction, 0.05);
    keeperState = {
      kind: "dive",
      t: 0,
      reactDelay: KEEPER_REACTION,
      duration: DIVE_DURATION,
      fromX: keeper.position.x,
      fromY: keeper.position.y,
      fromLean: keeperTilt.rotation.z,
      targetX, lift, lean,
      preAction: actionPlan.preAction,
      mainAction: actionPlan.mainAction,
      mainPlayed: !actionPlan.preAction,
    };
  }

  // Breathing — applied only in idle. The chest expansion is a slight
  // y-scale on keeperBody plus a small bob; this composes with the
  // tilt pivot above without distorting it.
  const breathStart = performance.now() / 1000;
  function applyBreathing() {
    const t = performance.now() / 1000 - breathStart;
    const phase = Math.sin(t * 2 * Math.PI / 4);     // 4 s per breath
    keeperBody.position.y = phase * 0.018;
    keeperBody.scale.set(1 + phase * 0.012, 1 + phase * 0.018, 1 + phase * 0.012);
  }

  function tickKeeper(dt: number) {
    keeperMixer?.update(dt);
    const useClipBodyMotion = keeperUsesClipBodyMotion();
    if (keeperState.kind === "idle") {
      if (!useClipBodyMotion) applyBreathing();
      else {
        keeperBody.position.set(0, 0, 0);
        keeperBody.scale.set(1, 1, 1);
      }
      return;
    }
    keeperBody.position.y = 0;
    keeperBody.scale.set(1, 1, 1);
    if (keeperState.kind === "dive") {
      keeperState.t += dt;
      const ts = keeperState.t - keeperState.reactDelay;
      if (ts <= 0) {
        if (keeperState.preAction && keeperState.reactDelay > 0.001) {
          const preU = THREE.MathUtils.clamp(keeperState.t / keeperState.reactDelay, 0, 1);
          keeper.position.x = THREE.MathUtils.lerp(keeperState.fromX, keeperState.targetX * 0.35, preU);
        }
        return;
      }
      if (!keeperState.mainPlayed) {
        playKeeperAction(keeperState.mainAction, 0.04);
        keeperState.mainPlayed = true;
      }
      const u = Math.min(ts / keeperState.duration, 1);
      const ease = 1 - Math.pow(1 - u, 2);
      const xStart = keeperState.preAction
        ? THREE.MathUtils.lerp(keeperState.fromX, keeperState.targetX * 0.35, 1)
        : keeperState.fromX;
      keeper.position.x = THREE.MathUtils.lerp(xStart, keeperState.targetX, ease);
      // Lift rises through the first half then plateaus so the keeper
      // is still airborne when the ball arrives at u = 1.
      const liftU = Math.min(1, u * 2);
      const liftEase = 1 - Math.pow(1 - liftU, 2);
      keeper.position.y = useClipBodyMotion ? keeperState.fromY : THREE.MathUtils.lerp(keeperState.fromY, keeperState.lift * liftEase, ease);
      // Lean grows with the dive — pivot is at the hip (keeperTilt's
      // offset) so the body tips to the side without the feet sliding.
      keeperTilt.rotation.z = useClipBodyMotion
        ? keeperState.fromLean
        : THREE.MathUtils.lerp(keeperState.fromLean, keeperState.lean, ease);
      if (u >= 1) {
        keeperState = {
          kind: "recover",
          t: 0,
          duration: RECOVER_DURATION,
          fromX: keeperState.targetX,
          fromY: keeper.position.y,
          fromLean: keeperState.lean,
        };
      }
      return;
    }
    // Recover: smoothly return position, lift, and lean to standing centre.
    keeperState.t += dt;
    const u = Math.min(keeperState.t / keeperState.duration, 1);
    const ease = 1 - Math.pow(1 - u, 3);
    keeper.position.x = THREE.MathUtils.lerp(keeperState.fromX, 0, ease);
    keeper.position.y = useClipBodyMotion ? 0 : THREE.MathUtils.lerp(keeperState.fromY, 0, ease);
    keeperTilt.rotation.z = useClipBodyMotion ? 0 : THREE.MathUtils.lerp(keeperState.fromLean, 0, ease);
    if (u >= 1) {
      keeperState = { kind: "idle" };
      keeper.position.set(0, 0, KEEPER_Z);
      keeperTilt.rotation.z = 0;
    }
  }

  // ---- Audio --------------------------------------------------------
  function loader(src: string) {
    const base = new Audio(src);
    base.preload = "auto";
    return (volume: number) => {
      const c = base.cloneNode(true) as HTMLAudioElement;
      c.volume = volume;
      c.play().catch(() => {});
    };
  }
  const playKick = loader("/kick.ogg");
  const playCheer = loader("/cheer.ogg");
  const playBoo = loader("/boo.ogg");

  // ---- Shot logic ---------------------------------------------------
  type Outcome = "win" | "save" | "miss";
  type Shot = {
    t: number;
    duration: number;
    outcome: Outcome;
    from: THREE.Vector3;
    target: THREE.Vector3;
    arcHeight: number;
    spinAxis: THREE.Vector3;
    spinSpeed: number;
  };
  let shot: Shot | null = null;
  let saveInterceptPoint: THREE.Vector3 | null = null;

  function shoot(swipeDx: number, swipeSpeed: number) {
    if (shot || rebound || goalRoll) return;

    // Map swipe speed (px/ms) to flight time.
    const speedNorm = THREE.MathUtils.clamp(
      (swipeSpeed - SWIPE_SPEED_SLOW) / (SWIPE_SPEED_FAST - SWIPE_SPEED_SLOW),
      0, 1,
    );
    const duration = THREE.MathUtils.lerp(SHOT_DURATION_SLOW, SHOT_DURATION_FAST, speedNorm);

    // Kick volume and ball spin scale with swipe speed for feedback.
    playKick(0.45 + 0.45 * speedNorm);

    const traj = selectTrajectoryFromSwipe(swipeDx);
    const target = new THREE.Vector3(traj.x, traj.y, traj.z);
    const willWin = slider.value === "1";
    const outcome: Outcome = willWin ? "win" : "save";
    const flightTime = willWin ? duration : SAVE_FLIGHT_TIME;
    if (willWin) {
      playKeeperAction(pickScoreAction(traj.saveAction), 0.05);
      keeperState = { kind: "idle" };
      saveInterceptPoint = null;
    } else {
      startKeeperDive(traj.keeperTargetX, traj.keeperLift, traj.keeperLean, traj.saveAction);
      saveInterceptPoint = new THREE.Vector3(
        traj.keeperTargetX,
        THREE.MathUtils.clamp(traj.y, BALL_R + 0.1, GOAL_H - 0.2),
        KEEPER_Z + 0.05,
      );
    }

    const dir = target.clone().sub(BALL_START).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const spinAxis = new THREE.Vector3().crossVectors(up, dir).normalize();
    spinAxis.x += (Math.random() - 0.5) * 0.4;
    spinAxis.y += (Math.random() - 0.5) * 0.4;
    spinAxis.normalize();

    shot = {
      t: 0,
      duration: flightTime,
      outcome,
      from: BALL_START.clone(),
      target,
      // Saved shots stay flatter for cleaner keeper contact.
      arcHeight: outcome === "save" ? 0.35 : (0.45 + Math.random() * 0.5) * (1 - 0.4 * speedNorm),
      spinAxis,
      spinSpeed: 22 + Math.random() * 10 + 18 * speedNorm,
    };
    ballShadow.visible = false;
  }

  function resolveSavedShot() {
    playBoo(0.5);
    announce("SAVED!", "#78c8ff");
    if (saveInterceptPoint) {
      ball.position.copy(saveInterceptPoint);
    }
    startMiserableRebound();
    shot = null;
  }

  function updateShot(dt: number) {
    if (!shot) return;
    shot.t += dt;
    const u = Math.min(shot.t / shot.duration, 1);
    const ease = 1 - Math.pow(1 - u, 2);

    const px = THREE.MathUtils.lerp(shot.from.x, shot.target.x, ease);
    const pz = THREE.MathUtils.lerp(shot.from.z, shot.target.z, ease);
    const baseY = THREE.MathUtils.lerp(shot.from.y, shot.target.y, ease);
    const arc = Math.sin(Math.PI * u) * shot.arcHeight;
    ball.position.set(px, baseY + arc, pz);

    const spin = shot.spinSpeed * dt * (1 - 0.4 * u);
    ball.rotateOnWorldAxis(shot.spinAxis, spin);

    if (shot.outcome === "save" && saveInterceptPoint) {
      const keeperPlaneZ = saveInterceptPoint.z;
      const closeToHands = ball.position.distanceTo(saveInterceptPoint) < 0.55;
      const crossedKeeperPlane = ball.position.z <= keeperPlaneZ;
      if (closeToHands || crossedKeeperPlane) {
        resolveSavedShot();
        return;
      }
    }

    if (u < 1) return;

    if (shot.outcome === "win") {
      shakeNet(ball.position);
      playCheer(0.6);
      announce("GOAL!", "#ffd440");
      // Hand the ball off to a physics phase: the net absorbs most of
      // the forward momentum, but the ball keeps some lateral motion and
      // submits to gravity, falling and bouncing inside the net.
      const dir = shot.target.clone().sub(shot.from).normalize();
      const avgSpeed = shot.from.distanceTo(shot.target) / shot.duration;
      startGoalRoll(new THREE.Vector3(
        dir.x * avgSpeed * 0.35,
        -1.2,
        dir.z * avgSpeed * 0.08,
      ));
      shot = null;
      return;
    } else if (shot.outcome === "save") {
      resolveSavedShot();
      return;
    } else {
      playBoo(0.5);
      announce("MISS", "#ff5a5a");
      window.setTimeout(resetBall, 950);
    }
    shot = null;
  }

  function resetBall() {
    ball.position.copy(BALL_START);
    ball.rotation.set(0, 0, 0);
    ballShadow.visible = true;
    goalRoll = null;
    saveInterceptPoint = null;
    keeperState = { kind: "idle" };
    keeper.position.set(0, 0, KEEPER_Z);
    keeperTilt.rotation.z = 0;
    playKeeperAction("idle");
  }

  // Post-goal physics: ball keeps its impact velocity, gets pulled down
  // by gravity, and bounces+settles on the ground inside the net. The
  // back of the goal is at GOAL_Z - GOAL_DEPTH; we clamp z so the ball
  // can't tunnel through the back netting.
  type GoalRoll = { vel: THREE.Vector3; t: number };
  let goalRoll: GoalRoll | null = null;
  const GRAVITY = 12;
  // Containment box: the ball must stay inside the goal+net for the
  // whole post-goal physics phase. Bounds are inset by BALL_R so the
  // ball's surface (not its centre) sits flush against each side.
  // GOAL_NET_INSET accounts for the goalpost.glb model's bbox being
  // wider than the visible side nets (the bbox includes back support
  // poles that splay outside the goal opening).
  const GOAL_NET_INSET = 0.5;
  const GOAL_BACK_Z  = GOAL_Z - GOAL_DEPTH + BALL_R;
  const GOAL_FRONT_Z = GOAL_Z - BALL_R;
  const GOAL_TOP_Y   = GOAL_H - BALL_R;
  const GOAL_SIDE_X  = GOAL_W / 2 - GOAL_NET_INSET - BALL_R;
  function startGoalRoll(initialVel: THREE.Vector3) {
    goalRoll = { vel: initialVel.clone(), t: 0 };
  }
  function updateGoalRoll(dt: number) {
    if (!goalRoll) return;
    goalRoll.t += dt;
    goalRoll.vel.y -= GRAVITY * dt;
    ball.position.addScaledVector(goalRoll.vel, dt);
    // Back-of-net: kill forward velocity if the ball reaches the netting.
    if (ball.position.z < GOAL_BACK_Z) {
      ball.position.z = GOAL_BACK_Z;
      goalRoll.vel.z = Math.max(0, goalRoll.vel.z) * 0.2;
    }
    // Front-of-goal: the ball cannot bounce back across the goal line.
    if (ball.position.z > GOAL_FRONT_Z) {
      ball.position.z = GOAL_FRONT_Z;
      goalRoll.vel.z = Math.min(0, goalRoll.vel.z) * 0.2;
    }
    // Side netting: same treatment if the ball drifts past a post.
    if (ball.position.x > GOAL_SIDE_X) {
      ball.position.x = GOAL_SIDE_X;
      goalRoll.vel.x = Math.min(0, goalRoll.vel.x) * 0.2;
    } else if (ball.position.x < -GOAL_SIDE_X) {
      ball.position.x = -GOAL_SIDE_X;
      goalRoll.vel.x = Math.max(0, goalRoll.vel.x) * 0.2;
    }
    // Crossbar / top of net: clamp upward velocity so the ball can't
    // pop out through the top netting.
    if (ball.position.y > GOAL_TOP_Y) {
      ball.position.y = GOAL_TOP_Y;
      if (goalRoll.vel.y > 0) goalRoll.vel.y *= -0.4;
      goalRoll.vel.x *= 0.8;
      goalRoll.vel.z *= 0.8;
    }
    // Ground bounce.
    if (ball.position.y < BALL_R) {
      ball.position.y = BALL_R;
      if (goalRoll.vel.y < 0) goalRoll.vel.y *= -0.4;
      goalRoll.vel.x *= 0.65;
      goalRoll.vel.z *= 0.65;
    }
    // Air damping.
    goalRoll.vel.multiplyScalar(1 - 0.6 * dt);
    // Spin proportional to current speed, around an axis perpendicular
    // to motion so the ball "rolls".
    const speed = goalRoll.vel.length();
    if (speed > 0.05) {
      const axis = new THREE.Vector3(0, 1, 0).cross(goalRoll.vel).normalize();
      ball.rotateOnWorldAxis(axis, Math.min(speed, 8) * dt);
    }
    // Settle and reset once the ball is on the ground and nearly still.
    if (
      ball.position.y <= BALL_R + 0.001 &&
      goalRoll.vel.lengthSq() < 0.04 &&
      goalRoll.t > 0.6
    ) {
      goalRoll = null;
      window.setTimeout(resetBall, 350);
    }
  }

  type Rebound = {
    t: number;
    fromPos: THREE.Vector3;
    landingPos: THREE.Vector3;
  };
  let rebound: Rebound | null = null;
  function startMiserableRebound() {
    const fromPos = ball.position.clone();
    const landingX = THREE.MathUtils.lerp(BALL_START.x, fromPos.x, 0.3);
    const landingZ = THREE.MathUtils.lerp(BALL_START.z, fromPos.z, 0.4);
    rebound = {
      t: 0,
      fromPos,
      landingPos: new THREE.Vector3(landingX, BALL_R, landingZ),
    };
  }
  function updateRebound(dt: number) {
    if (!rebound) return;
    const PHASE_A = 0.55;
    const PHASE_B = 1.5;
    rebound.t += dt;
    if (rebound.t < PHASE_A) {
      const u = rebound.t / PHASE_A;
      ball.position.x = THREE.MathUtils.lerp(rebound.fromPos.x, rebound.landingPos.x, u);
      ball.position.z = THREE.MathUtils.lerp(rebound.fromPos.z, rebound.landingPos.z, u);
      const baseY = THREE.MathUtils.lerp(rebound.fromPos.y, rebound.landingPos.y, u);
      ball.position.y = baseY + Math.sin(Math.PI * u) * 0.4;
      ball.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 6 * dt);
      return;
    }
    const u = Math.min((rebound.t - PHASE_A) / PHASE_B, 1);
    const ease = 1 - Math.pow(1 - u, 2.2);
    ball.position.x = THREE.MathUtils.lerp(rebound.landingPos.x, BALL_START.x, ease);
    ball.position.z = THREE.MathUtils.lerp(rebound.landingPos.z, BALL_START.z, ease);
    ball.position.y = BALL_R;
    ball.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 4 * (1 - ease) * dt);
    if (u >= 1) {
      rebound = null;
      ball.rotation.set(0, 0, 0);
      ballShadow.visible = true;
    }
  }

  // ---- Announce label -----------------------------------------------
  type Label = { text: string; color: string; start: number; duration: number };
  let label: Label | null = null;
  function announce(text: string, color: string) {
    label = {
      text,
      color,
      start: performance.now() / 1000,
      duration: 0.85,
    };
  }
  function tickLabel(now: number, w: number, h: number) {
    if (!label) return;
    const t = now - label.start;
    if (t >= label.duration) {
      label = null;
      return;
    }
    const u = t / label.duration;
    const popU = Math.min(u / 0.2, 1);
    const popScale = 0.6 + (1 - Math.pow(1 - popU, 3)) * 0.5;
    const fade = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    overlayCtx.save();
    overlayCtx.globalAlpha = fade * 0.95;
    overlayCtx.translate(w / 2, h / 2 - 30);
    overlayCtx.scale(popScale, popScale);
    overlayCtx.font = "bold 64px system-ui, sans-serif";
    overlayCtx.textAlign = "center";
    overlayCtx.textBaseline = "middle";
    overlayCtx.lineWidth = 6;
    overlayCtx.strokeStyle = "rgba(0,0,0,0.6)";
    overlayCtx.fillStyle = label.color;
    overlayCtx.strokeText(label.text, 0, 0);
    overlayCtx.fillText(label.text, 0, 0);
    overlayCtx.restore();
  }

  // ---- Swipe trail (overlay-rendered) ------------------------------
  type TrailPoint = { x: number; y: number; t: number };
  const trail: TrailPoint[] = [];
  const TRAIL_LIFE = 0.25;
  const TRAIL_WIDTH = 16;
  const TRAIL_MAX_LEN = 220;

  function pushTrail(clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    trail.push({ x, y, t: performance.now() / 1000 });
    let total = 0;
    for (let i = trail.length - 1; i > 0; i--) {
      const a = trail[i];
      const b = trail[i - 1];
      total += Math.hypot(a.x - b.x, a.y - b.y);
      if (total > TRAIL_MAX_LEN) {
        trail.splice(0, i);
        return;
      }
    }
  }

  function tickTrail(now: number) {
    while (trail.length && now - trail[0].t > TRAIL_LIFE) trail.shift();
    if (trail.length < 2) return;
    overlayCtx.save();
    overlayCtx.lineCap = "round";
    overlayCtx.lineJoin = "round";
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1];
      const b = trail[i];
      const age = now - b.t;
      const fade = Math.max(0, 1 - age / TRAIL_LIFE);
      overlayCtx.globalAlpha = 0.18 * fade;
      overlayCtx.strokeStyle = "white";
      overlayCtx.lineWidth = TRAIL_WIDTH * fade;
      overlayCtx.beginPath();
      overlayCtx.moveTo(a.x, a.y);
      overlayCtx.lineTo(b.x, b.y);
      overlayCtx.stroke();
      overlayCtx.globalAlpha = 0.55 * fade;
      overlayCtx.lineWidth = TRAIL_WIDTH * 0.45 * fade;
      overlayCtx.beginPath();
      overlayCtx.moveTo(a.x, a.y);
      overlayCtx.lineTo(b.x, b.y);
      overlayCtx.stroke();
    }
    overlayCtx.restore();
  }

  // ---- Pointer handling --------------------------------------------
  type DragStart = { x: number; y: number; t: number };
  let dragStart: DragStart | null = null;

  const onPointerDown = (e: PointerEvent) => {
    if (shot || rebound || goalRoll) return;
    const r = canvas.getBoundingClientRect();
    dragStart = {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      t: performance.now(),
    };
    canvas.setPointerCapture(e.pointerId);
    trail.length = 0;
    pushTrail(e.clientX, e.clientY);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragStart) return;
    pushTrail(e.clientX, e.clientY);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!dragStart) return;
    pushTrail(e.clientX, e.clientY);
    const r = canvas.getBoundingClientRect();
    const ex = e.clientX - r.left;
    const ey = e.clientY - r.top;
    const dx = ex - dragStart.x;
    const dy = ey - dragStart.y;
    const elapsed = performance.now() - dragStart.t;
    dragStart = null;
    if (dy < -SWIPE_MIN_UP && elapsed < SWIPE_MAX_DURATION_MS) {
      const swipeSpeed = Math.hypot(dx, dy) / Math.max(elapsed, 1);  // px/ms
      shoot(dx, swipeSpeed);
    }
  };
  const onPointerCancel = () => {
    dragStart = null;
  };
  const onTouchMove = (e: TouchEvent) => e.preventDefault();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });

  // ---- Resize -------------------------------------------------------
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    overlay.width = Math.floor(w * (window.devicePixelRatio || 1));
    overlay.height = Math.floor(h * (window.devicePixelRatio || 1));
    overlay.style.width = w + "px";
    overlay.style.height = h + "px";
    overlayCtx.setTransform(
      window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0,
    );
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  // ---- Main loop ----------------------------------------------------
  let raf = 0;
  let prev = performance.now();
  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;

    tickKeeper(dt);
    updateShot(dt);
    updateRebound(dt);
    updateGoalRoll(dt);
    tickNet();

    renderer.render(scene, camera);

    const w = stage.clientWidth;
    const h = stage.clientHeight;
    overlayCtx.clearRect(0, 0, w, h);
    tickTrail(now / 1000);
    tickLabel(now / 1000, w, h);
  }
  raf = requestAnimationFrame(tick);

  return () => {
    keeperLoadAborted = true;
    keeperMixer?.stopAllAction();
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("touchmove", onTouchMove);
    renderer.dispose();
    canvas.remove();
    overlay.remove();
  };
}

// =====================================================================
// Helpers
// =====================================================================

// Primitives keeper used while the GLB is loading or if the load fails.
function makeKeeperFallback(): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c790, roughness: 0.7 });
  const jersey = new THREE.MeshStandardMaterial({ color: 0xffd54f, roughness: 0.7 });
  const shorts = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.7 });

  const legGeo = new THREE.BoxGeometry(0.2, 0.78, 0.22);
  const lLeg = new THREE.Mesh(legGeo, shorts);
  lLeg.position.set(-0.14, 0.39, 0);
  lLeg.castShadow = true;
  g.add(lLeg);
  const rLeg = lLeg.clone();
  rLeg.position.x = 0.14;
  g.add(rLeg);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.32), jersey);
  body.position.set(0, 1.1, 0);
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 14), skin);
  head.position.set(0, 1.6, 0);
  head.castShadow = true;
  g.add(head);

  return g;
}

// Procedural crowd: tiered rows of head-coloured dots over a deep
// stadium-tunnel base. Designed to tile horizontally without seams so
// it can be repeated across a wide back stand.
function makeCrowdTexture(): THREE.Texture {
  const w = 1024;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;

  // Stadium concrete tiers (dark base with a subtle horizontal banding).
  ctx.fillStyle = "#1d1f28";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.06 + (i % 2) * 0.04})`;
    ctx.fillRect(0, (i * h) / 24, w, h / 48);
  }

  // Crowd palette — mostly muted, a few jersey accents.
  const palette = [
    "#e74c3c", "#f1c40f", "#3498db", "#2ecc71", "#ecf0f1",
    "#9b59b6", "#e67e22", "#34495e", "#bdc3c7", "#1abc9c",
    "#c0392b", "#f39c12", "#7f8c8d", "#2980b9", "#16a085",
  ];

  const ROWS = 28;
  const COLS = 96;
  const cellW = w / COLS;
  const cellH = (h * 0.78) / ROWS;
  const topY = h * 0.18;

  for (let r = 0; r < ROWS; r++) {
    const stagger = r % 2 === 0 ? 0 : 0.5;
    for (let cIdx = 0; cIdx < COLS; cIdx++) {
      const x = (cIdx + 0.5 + stagger) * cellW;
      const y = topY + (r + 0.5) * cellH;
      // Bodies (slightly taller patch under each head, in a darker
      // shade so the heads pop).
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(x - cellW * 0.4, y - cellH * 0.05, cellW * 0.8, cellH * 0.85);
      // Head.
      const color = palette[(Math.random() * palette.length) | 0];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, cellW * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Subtle vignette so tiled edges blend.
  const vg = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
