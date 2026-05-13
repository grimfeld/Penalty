/**
 * CPU-generated textures and meshes that stand in for external art
 * (crowd cards, primitive keeper while GLBs load).
 */
import * as THREE from "three";
import type { StadiumStandsVariant } from "./session-config";

/** Blocky humanoid used until the rigged keeper GLB is ready. */
export function makeKeeperFallback(): THREE.Group {
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

/**
 * Stadium crowd: tiered rows of coloured dots on a dark base. Horizontally
 * tileable so `repeat` can span wide back stands without seams.
 */
export function makeCrowdTexture(variant: StadiumStandsVariant = "day"): THREE.Texture {
  const w = 1024;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;

  const night = variant === "night";
  ctx.fillStyle = night ? "#0a0c12" : "#1d1f28";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = `rgba(0,0,0,${(night ? 0.12 : 0.06) + (i % 2) * (night ? 0.06 : 0.04)})`;
    ctx.fillRect(0, (i * h) / 24, w, h / 48);
  }

  const palette = night
    ? [
        "#5c6bc0", "#78909c", "#4dd0e1", "#9575cd", "#90a4ae",
        "#546e7a", "#7e57c2", "#26a69a", "#b0bec5", "#5e35b1",
        "#00838f", "#3949ab", "#6d4c41", "#37474f", "#4527a0",
      ]
    : [
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
      ctx.fillStyle = night ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.45)";
      ctx.fillRect(x - cellW * 0.4, y - cellH * 0.05, cellW * 0.8, cellH * 0.85);
      const color = palette[(Math.random() * palette.length) | 0];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, cellW * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const vg = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, night ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.5)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
