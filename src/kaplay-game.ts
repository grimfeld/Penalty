import kaplay from "kaplay";

// =====================================================================
// 2D penalty shootout, kaplay flavor. Mounted into a host stage by
// the launcher in main.ts; returns a teardown function that fully
// disposes the kaplay context so the page can swap to the 3D mode.
// =====================================================================
const STAGE_W = 800;
const STAGE_H = 360;

export function mount(stage: HTMLElement, slider: HTMLInputElement): () => void {
  const canvas = document.createElement("canvas");
  canvas.id = "game-2d";
  // Insert before the HUD so the slider stays on top of the canvas.
  stage.insertBefore(canvas, stage.firstChild);

  stage.style.setProperty("--stage-w", `${STAGE_W}px`);
  stage.style.setProperty("--stage-h", `${STAGE_H}px`);

  const k = kaplay({
    canvas,
    width: STAGE_W,
    height: STAGE_H,
    pixelDensity: window.devicePixelRatio || 1,
    letterbox: true,
    background: [82, 168, 70],
    global: false,
    touchToMouse: false,
  });

  k.loadSprite("ball", "/ball.png");
  k.loadSprite("keeper", "/keeper.png");
  k.loadSound("kick", "/kick.ogg");
  k.loadSound("cheer", "/cheer.ogg");
  k.loadSound("boo", "/boo.ogg");

  // Layout (logical units, independent of DPI). Goal is flat / front
  // view at the top; ball sits at the bottom-center penalty spot.
  const GOAL_W = 360;
  const GOAL_H = 105;
  const GOAL_LEFT = (STAGE_W - GOAL_W) / 2;
  const GOAL_RIGHT = GOAL_LEFT + GOAL_W;
  const GOAL_TOP = 36;
  const GOAL_BOTTOM = GOAL_TOP + GOAL_H;
  const POST_THICK = 4;

  const BALL_SIZE = 36;
  const BALL_START = k.vec2(STAGE_W / 2, STAGE_H - 40);

  // Cartoon grass: flat green base + alternating mowed stripes + a
  // sparse scatter of small dark-green tufts. Deterministic placement
  // so the field looks the same on every load.
  function rand(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
  }

  k.add([
    k.rect(STAGE_W, STAGE_H),
    k.color(82, 168, 70),
    k.pos(0, 0),
    k.z(-100),
  ]);

  const STRIPES = 8;
  for (let i = 0; i < STRIPES; i++) {
    if (i % 2 === 1) {
      k.add([
        k.rect(STAGE_W, STAGE_H / STRIPES),
        k.color(96, 184, 80),
        k.pos(0, (i * STAGE_H) / STRIPES),
        k.opacity(0.55),
        k.z(-99),
      ]);
    }
  }

  const tuftRand = rand(1337);
  for (let i = 0; i < 80; i++) {
    const x = tuftRand() * STAGE_W;
    const y = tuftRand() * STAGE_H;
    const w = 4 + tuftRand() * 3;
    const h = 6 + tuftRand() * 4;
    k.add([
      k.polygon([k.vec2(-w, 0), k.vec2(0, -h), k.vec2(w, 0)]),
      k.color(38, 122, 50),
      k.pos(x, y),
      k.opacity(0.9),
      k.z(-98),
    ]);
  }

  k.add([
    k.circle(7),
    k.pos(BALL_START.x, BALL_START.y + 13),
    k.color(0, 0, 0),
    k.opacity(0.25),
    k.anchor("center"),
    k.z(-2),
  ]);
  k.add([
    k.circle(6),
    k.pos(BALL_START.x, BALL_START.y + 12),
    k.color(255, 255, 255),
    k.opacity(1),
    k.anchor("center"),
    k.z(-1),
  ]);

  k.add([
    k.rect(GOAL_W, GOAL_H),
    k.color(255, 255, 255),
    k.opacity(0.10),
    k.pos(GOAL_LEFT, GOAL_TOP),
    k.z(-5),
  ]);

  const NET_STEP = 16;
  const NET_R = 60;
  const NET_G = 60;
  const NET_B = 60;
  const NET_OPACITY = 0.5;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type NetLine = {
    obj: any;
    originX: number;
    originY: number;
    midX: number;
    midY: number;
  };
  const netLines: NetLine[] = [];

  for (let x = GOAL_LEFT; x <= GOAL_RIGHT + 0.5; x += NET_STEP) {
    const obj = k.add([
      k.rect(1.2, GOAL_H),
      k.color(NET_R, NET_G, NET_B),
      k.opacity(NET_OPACITY),
      k.pos(x, GOAL_TOP),
      k.z(-4),
    ]);
    netLines.push({ obj, originX: x, originY: GOAL_TOP, midX: x, midY: GOAL_TOP + GOAL_H / 2 });
  }
  for (let y = GOAL_TOP; y <= GOAL_BOTTOM + 0.5; y += NET_STEP) {
    const obj = k.add([
      k.rect(GOAL_W, 1.2),
      k.color(NET_R, NET_G, NET_B),
      k.opacity(NET_OPACITY),
      k.pos(GOAL_LEFT, y),
      k.z(-4),
    ]);
    netLines.push({ obj, originX: GOAL_LEFT, originY: y, midX: GOAL_LEFT + GOAL_W / 2, midY: y });
  }

  function shakeNet(impactX: number, impactY: number) {
    const start = performance.now() / 1000;
    const DURATION = 0.55;
    const FREQ = 22;
    const FALLOFF = 90;
    for (const line of netLines) {
      const d = Math.hypot(line.midX - impactX, line.midY - impactY);
      const baseAmp = Math.max(0, 1 - d / FALLOFF) * 5 + 0.6;
      const phaseX = Math.random() * Math.PI * 2;
      const phaseY = Math.random() * Math.PI * 2;
      const handle = line.obj.onUpdate(() => {
        const t = performance.now() / 1000 - start;
        if (t >= DURATION) {
          line.obj.pos.x = line.originX;
          line.obj.pos.y = line.originY;
          handle.cancel();
          return;
        }
        const decay = 1 - t / DURATION;
        line.obj.pos.x = line.originX + Math.sin(t * FREQ * 2 * Math.PI + phaseX) * baseAmp * decay;
        line.obj.pos.y = line.originY + Math.sin(t * FREQ * 2 * Math.PI + phaseY) * baseAmp * decay;
      });
    }
  }

  k.add([
    k.rect(POST_THICK, GOAL_H + POST_THICK),
    k.color(255, 255, 255),
    k.pos(GOAL_LEFT - POST_THICK, GOAL_TOP - POST_THICK),
    k.z(2),
  ]);
  k.add([
    k.rect(POST_THICK, GOAL_H + POST_THICK),
    k.color(255, 255, 255),
    k.pos(GOAL_RIGHT, GOAL_TOP - POST_THICK),
    k.z(2),
  ]);
  k.add([
    k.rect(GOAL_W + POST_THICK * 2, POST_THICK),
    k.color(255, 255, 255),
    k.pos(GOAL_LEFT - POST_THICK, GOAL_TOP - POST_THICK),
    k.z(2),
  ]);

  k.add([
    k.rect(GOAL_W + POST_THICK * 2 + 12, 6),
    k.color(0, 0, 0),
    k.opacity(0.18),
    k.pos(GOAL_LEFT - POST_THICK - 6, GOAL_BOTTOM + 2),
    k.z(-50),
  ]);

  const LINE_W = 2;
  const LINE_OPACITY = 0.75;
  const LINE_Z = -1;

  function paintLine(x: number, y: number, w: number, h: number) {
    k.add([
      k.rect(w, h),
      k.color(255, 255, 255),
      k.opacity(LINE_OPACITY),
      k.pos(x, y),
      k.z(LINE_Z),
    ]);
  }

  const PB_TOP = GOAL_BOTTOM + 4;
  const PB_BOT = STAGE_H - 14;
  const PB_L = GOAL_LEFT - 80;
  const PB_R = GOAL_RIGHT + 80;
  paintLine(PB_L, PB_BOT, PB_R - PB_L, LINE_W);
  paintLine(PB_L, PB_TOP, LINE_W, PB_BOT - PB_TOP);
  paintLine(PB_R - LINE_W, PB_TOP, LINE_W, PB_BOT - PB_TOP);

  const GA_TOP = GOAL_BOTTOM + 4;
  const GA_BOT = GA_TOP + 36;
  const GA_L = GOAL_LEFT - 28;
  const GA_R = GOAL_RIGHT + 28;
  paintLine(GA_L, GA_BOT, GA_R - GA_L, LINE_W);
  paintLine(GA_L, GA_TOP, LINE_W, GA_BOT - GA_TOP);
  paintLine(GA_R - LINE_W, GA_TOP, LINE_W, GA_BOT - GA_TOP);

  const SIDE_INSET = 4;
  paintLine(0, GOAL_BOTTOM, STAGE_W, LINE_W);
  paintLine(SIDE_INSET, GOAL_BOTTOM, LINE_W, STAGE_H - GOAL_BOTTOM);
  paintLine(STAGE_W - SIDE_INSET - LINE_W, GOAL_BOTTOM, LINE_W, STAGE_H - GOAL_BOTTOM);

  const KEEPER_SPRITE_W = 60;
  const KEEPER_SPRITE_H = 82;
  const KEEPER_BODY_HALF_W = KEEPER_SPRITE_W * 0.5;
  const keeperFeetY = GOAL_BOTTOM - 4;
  const keeper = k.add([
    k.sprite("keeper", { width: KEEPER_SPRITE_W, height: KEEPER_SPRITE_H }),
    k.pos(STAGE_W / 2, keeperFeetY - KEEPER_SPRITE_H),
    k.anchor("top"),
    k.scale(1),
    k.z(3),
  ]);

  const KEEPER_REACH = KEEPER_BODY_HALF_W;
  const KEEPER_LIMIT_LEFT = GOAL_LEFT + KEEPER_REACH + 4;
  const KEEPER_LIMIT_RIGHT = GOAL_RIGHT - KEEPER_REACH - 4;
  const KEEPER_SPEED = 264;
  let keeperVx = KEEPER_SPEED;

  keeper.onUpdate(() => {
    keeper.pos.x += keeperVx * k.dt();
    if (keeper.pos.x > KEEPER_LIMIT_RIGHT) {
      keeper.pos.x = KEEPER_LIMIT_RIGHT;
      keeperVx = -KEEPER_SPEED;
    } else if (keeper.pos.x < KEEPER_LIMIT_LEFT) {
      keeper.pos.x = KEEPER_LIMIT_LEFT;
      keeperVx = KEEPER_SPEED;
    }
  });

  function predictKeeperX(t: number): number {
    let x = keeper.pos.x;
    let v = keeperVx;
    let remaining = Math.abs(KEEPER_SPEED) * t;
    while (remaining > 0) {
      const distToEdge = v > 0 ? KEEPER_LIMIT_RIGHT - x : x - KEEPER_LIMIT_LEFT;
      if (remaining < distToEdge) {
        x += (v > 0 ? 1 : -1) * remaining;
        remaining = 0;
      } else {
        x = v > 0 ? KEEPER_LIMIT_RIGHT : KEEPER_LIMIT_LEFT;
        remaining -= distToEdge;
        v = -v;
      }
    }
    return x;
  }

  const ball = k.add([
    k.sprite("ball", { width: BALL_SIZE, height: BALL_SIZE }),
    k.pos(BALL_START.x, BALL_START.y),
    k.anchor("center"),
    k.scale(1),
    k.rotate(0),
    k.z(10),
    "ball",
  ]);

  let isMoving = false;

  function resetBall() {
    ball.pos = BALL_START.clone();
    ball.scale = k.vec2(1, 1);
    ball.angle = 0;
    isMoving = false;
  }

  const FIRM_SWIPE_PX = 220;

  function swipeBias(swipeDx: number): number {
    return Math.max(-1, Math.min(1, swipeDx / FIRM_SWIPE_PX));
  }

  const STRAIGHT_THRESHOLD = 12;

  function pickWinTarget(swipeDx: number) {
    const padX = 22;
    const padY = 18;
    const left = GOAL_LEFT + padX;
    const right = GOAL_RIGHT - padX;
    const center = (left + right) / 2;
    const horiz = Math.abs(swipeDx);
    let aim: number;
    if (horiz < STRAIGHT_THRESHOLD) {
      aim = k.rand(left, right);
    } else {
      const bias = swipeBias(swipeDx);
      const edge = bias < 0 ? left : right;
      aim = k.lerp(center, edge, Math.abs(bias));
    }
    const x = Math.max(left, Math.min(right, aim + k.rand(-12, 12)));
    return k.vec2(x, k.rand(GOAL_TOP + padY, GOAL_BOTTOM - padY));
  }

  function pickMissTarget(swipeDx: number) {
    const horiz = Math.abs(swipeDx);
    if (horiz < STRAIGHT_THRESHOLD) {
      return k.vec2(k.rand(GOAL_LEFT + 40, GOAL_RIGHT - 40), GOAL_TOP - 10);
    }
    const bias = swipeBias(swipeDx);
    const offset = k.lerp(6, 22, Math.abs(bias));
    const x = bias < 0 ? GOAL_LEFT - offset : GOAL_RIGHT + offset;
    return k.vec2(x, k.rand(GOAL_TOP + 10, GOAL_BOTTOM - 10));
  }

  const SAVE_PROBABILITY = 0.5;
  const SHOT_DURATION = 0.55;

  function pickKeeperSaveTarget() {
    const futureX = predictKeeperX(SHOT_DURATION);
    const yMid = keeperFeetY - KEEPER_SPRITE_H * 0.55;
    return k.vec2(futureX + k.rand(-6, 6), yMid + k.rand(-6, 6));
  }

  function shoot(swipeDx: number) {
    if (isMoving) return;
    isMoving = true;
    k.play("kick", { volume: 0.7 });

    const willWin = slider.value === "1";
    const isSave = !willWin && Math.random() < SAVE_PROBABILITY;
    const target = willWin
      ? pickWinTarget(swipeDx)
      : isSave
      ? pickKeeperSaveTarget()
      : pickMissTarget(swipeDx);

    const samples: Sample[] = swipeSamples.length >= 2
      ? swipeSamples.slice()
      : [
          { x: BALL_START.x, y: BALL_START.y },
          { x: BALL_START.x, y: BALL_START.y - 1 },
        ];

    const sStart = samples[0];
    const sEnd = samples[samples.length - 1];
    const vsX = sEnd.x - sStart.x;
    const vsY = sEnd.y - sStart.y;
    const vsLen = Math.hypot(vsX, vsY);

    const vbX = target.x - BALL_START.x;
    const vbY = target.y - BALL_START.y;
    const vbLen = Math.hypot(vbX, vbY);

    const angleS = vsLen > 0.5 ? Math.atan2(vsY, vsX) : Math.atan2(vbY, vbX);
    const angleB = Math.atan2(vbY, vbX);
    const angleJitter = k.rand(-0.025, 0.025);
    const curveAmp = k.rand(-12, 12);
    const cosA = Math.cos(angleB - angleS + angleJitter);
    const sinA = Math.sin(angleB - angleS + angleJitter);
    const scale = vsLen > 0.5 ? vbLen / vsLen : 1;

    function transform(s: Sample): { x: number; y: number } {
      const ox = s.x - sStart.x;
      const oy = s.y - sStart.y;
      const rx = ox * cosA - oy * sinA;
      const ry = ox * sinA + oy * cosA;
      return { x: BALL_START.x + rx * scale, y: BALL_START.y + ry * scale };
    }

    const safeLen = Math.max(vbLen, 1);
    const perpX = -vbY / safeLen;
    const perpY = vbX / safeLen;

    const duration = SHOT_DURATION;
    let t = 0;

    const handle = ball.onUpdate(() => {
      t += k.dt();
      const u = Math.min(t / duration, 1);
      const ease = 1 - Math.pow(1 - u, 2);

      const fIdx = ease * (samples.length - 1);
      const i0 = Math.floor(fIdx);
      const i1 = Math.min(i0 + 1, samples.length - 1);
      const f = fIdx - i0;
      const p0 = transform(samples[i0]);
      const p1 = transform(samples[i1]);
      ball.pos.x = k.lerp(p0.x, p1.x, f);
      ball.pos.y = k.lerp(p0.y, p1.y, f);

      const bump = Math.sin(Math.PI * u) * curveAmp;
      ball.pos.x += perpX * bump;
      ball.pos.y += perpY * bump;

      const s = k.lerp(1, 0.65, ease);
      ball.scale = k.vec2(s, s);
      ball.angle += 720 * k.dt() * (1 - 0.4 * u);

      if (u >= 1) {
        handle.cancel();
        if (willWin) {
          shakeNet(ball.pos.x, ball.pos.y);
          k.play("cheer", { volume: 0.6 });
          announce(true, false);
          k.wait(0.9, resetBall);
        } else if (isSave) {
          keeperSaveBounce();
          k.play("boo", { volume: 0.5 });
          announce(false, true);
          playMiserableRebound();
        } else {
          k.play("boo", { volume: 0.5 });
          announce(false, false);
          k.wait(0.9, resetBall);
        }
      }
    });
  }

  function announce(win: boolean, saved: boolean = false) {
    const text = win ? "GOAL!" : saved ? "SAVED!" : "MISS";
    const colorR = win ? 255 : saved ? 120 : 255;
    const colorG = win ? 215 : saved ? 200 : 90;
    const colorB = win ? 64 : saved ? 255 : 90;
    const label = k.add([
      k.text(text, { size: 56 }),
      k.pos(STAGE_W / 2, STAGE_H / 2 - 20),
      k.anchor("center"),
      k.color(colorR, colorG, colorB),
      k.opacity(0.95),
      k.z(50),
      k.scale(0.6),
    ]);
    k.tween(0.6, 1, 0.18, (v) => (label.scale = k.vec2(v, v)), k.easings.easeOutBack);
    k.wait(0.8, () => label.destroy());
  }

  function playMiserableRebound() {
    const fromPos = ball.pos.clone();
    const fromScale = ball.scale.x;
    const landingX = k.lerp(BALL_START.x, fromPos.x, 0.3);
    const landingY = BALL_START.y;

    const PHASE_A = 0.55;
    const PHASE_B = 1.5;
    const rollDir = Math.sign(BALL_START.x - landingX) || 1;
    let t = 0;

    const handle = ball.onUpdate(() => {
      t += k.dt();
      if (t < PHASE_A) {
        const u = t / PHASE_A;
        ball.pos.x = k.lerp(fromPos.x, landingX, u);
        ball.pos.y = k.lerp(fromPos.y, landingY, u) - Math.sin(Math.PI * u) * 14;
        const s = k.lerp(fromScale, 1, u);
        ball.scale = k.vec2(s, s);
        ball.angle += 360 * 0.7 * k.dt();
        return;
      }
      const u = Math.min((t - PHASE_A) / PHASE_B, 1);
      const ease = 1 - Math.pow(1 - u, 2.2);
      ball.pos.x = k.lerp(landingX, BALL_START.x, ease);
      ball.pos.y = landingY;
      ball.scale = k.vec2(1, 1);
      ball.angle += rollDir * 220 * (1 - ease) * k.dt();
      if (u >= 1) {
        ball.angle = 0;
        handle.cancel();
        isMoving = false;
      }
    });
  }

  function keeperSaveBounce() {
    const start = performance.now() / 1000;
    const dur = 0.35;
    const handle = keeper.onUpdate(() => {
      const t = performance.now() / 1000 - start;
      if (t >= dur) {
        keeper.scale = k.vec2(1, 1);
        handle.cancel();
        return;
      }
      const u = t / dur;
      const bump = Math.sin(Math.PI * u);
      keeper.scale = k.vec2(1 + bump * 0.18, 1 + bump * 0.12);
    });
  }

  type DragStart = { x: number; y: number; t: number };
  let dragStart: DragStart | null = null;

  const SWIPE_MIN_UP = 30;
  const SWIPE_MAX_DURATION_MS = 1000;

  type TrailPoint = { x: number; y: number; t: number };
  type Sample = { x: number; y: number };

  const trail: TrailPoint[] = [];
  const TRAIL_LIFE = 0.25;
  const TRAIL_WIDTH = 16;
  const TRAIL_MAX_LEN = 108;

  const swipeSamples: Sample[] = [];

  function canvasToGame(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * STAGE_W,
      y: ((clientY - rect.top) / rect.height) * STAGE_H,
    };
  }

  function pushTrail(clientX: number, clientY: number) {
    const p = canvasToGame(clientX, clientY);
    const now = performance.now() / 1000;
    trail.push({ x: p.x, y: p.y, t: now });
    swipeSamples.push({ x: p.x, y: p.y });
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

  k.onDraw(() => {
    const now = performance.now() / 1000;
    while (trail.length && now - trail[0].t > TRAIL_LIFE) trail.shift();
    if (trail.length < 2) return;
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1];
      const b = trail[i];
      const age = now - b.t;
      const fade = Math.max(0, 1 - age / TRAIL_LIFE);
      k.drawLine({
        p1: k.vec2(a.x, a.y),
        p2: k.vec2(b.x, b.y),
        width: TRAIL_WIDTH * fade,
        color: k.rgb(255, 255, 255),
        opacity: 0.18 * fade,
      });
      k.drawLine({
        p1: k.vec2(a.x, a.y),
        p2: k.vec2(b.x, b.y),
        width: TRAIL_WIDTH * 0.45 * fade,
        color: k.rgb(255, 255, 255),
        opacity: 0.55 * fade,
      });
    }
  });

  const onPointerDown = (e: PointerEvent) => {
    if (isMoving) return;
    const p = canvasToGame(e.clientX, e.clientY);
    dragStart = { x: p.x, y: p.y, t: performance.now() };
    canvas.setPointerCapture(e.pointerId);
    trail.length = 0;
    swipeSamples.length = 0;
    pushTrail(e.clientX, e.clientY);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragStart) return;
    pushTrail(e.clientX, e.clientY);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!dragStart) return;
    pushTrail(e.clientX, e.clientY);
    const end = canvasToGame(e.clientX, e.clientY);
    const dx = end.x - dragStart.x;
    const dy = end.y - dragStart.y;
    const elapsed = performance.now() - dragStart.t;
    dragStart = null;
    if (dy < -SWIPE_MIN_UP && elapsed < SWIPE_MAX_DURATION_MS) {
      shoot(dx);
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

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("touchmove", onTouchMove);
    try {
      k.quit();
    } catch {
      // kaplay may throw during teardown depending on internal state;
      // we still want to remove the canvas regardless.
    }
    canvas.remove();
  };
}
