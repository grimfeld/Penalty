/**
 * Stadium backdrop meshes and pitch-side LED-style ad boards. Background and
 * logo URLs can be changed at runtime.
 */
import * as THREE from "three";
import { GOAL_DEPTH, GOAL_Z } from "./constants";
import type { StadiumStandsVariant } from "./session-config";

const SIDE_X = 24;

export type StadiumGraphics = {
  setLogoUrl(url: string): void;
  setBackgroundUrl(url: string): void;
  setStandsVariant(variant: StadiumStandsVariant): void;
  dispose(): void;
};

type CanvasTextureEntry = {
  texture: THREE.CanvasTexture;
};

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const srcAspect = img.naturalWidth / img.naturalHeight;
  const dstAspect = w / h;
  const sw = srcAspect > dstAspect ? img.naturalHeight * dstAspect : img.naturalWidth;
  const sh = srcAspect > dstAspect ? img.naturalHeight : img.naturalWidth / dstAspect;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/**
 * Builds back/side stands plus ad boards. All image-backed surfaces use canvas
 * textures so they can be repainted at runtime from user-provided URLs.
 */
export function createStadiumGraphics(
  scene: THREE.Scene,
  options: {
    logoUrl: string;
    backgroundUrl: string;
    standsVariant: StadiumStandsVariant;
  },
): StadiumGraphics {
  const crowdMeshes: THREE.Mesh[] = [];
  const crowdEntries: CanvasTextureEntry[] = [];
  let standsVariant = options.standsVariant;
  let currentBackgroundImg: HTMLImageElement | null = null;
  let backgroundLoadToken = 0;

  const crowdCanvas = document.createElement("canvas");
  crowdCanvas.width = 1024;
  crowdCanvas.height = 512;
  const crowdCtx = crowdCanvas.getContext("2d")!;
  const baseCrowdTex = new THREE.CanvasTexture(crowdCanvas);
  baseCrowdTex.colorSpace = THREE.SRGBColorSpace;

  function paintCrowdBackground(backgroundImg: HTMLImageElement | null) {
    const w = crowdCanvas.width;
    const h = crowdCanvas.height;

    if (backgroundImg && backgroundImg.complete && backgroundImg.naturalWidth > 0) {
      drawImageCover(crowdCtx, backgroundImg, 0, 0, w, h);
    } else {
      const night = standsVariant === "night";
      const grad = crowdCtx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, night ? "#090d16" : "#24304a");
      grad.addColorStop(1, night ? "#03050a" : "#111827");
      crowdCtx.fillStyle = grad;
      crowdCtx.fillRect(0, 0, w, h);
      crowdCtx.fillStyle = "rgba(255,255,255,0.18)";
      crowdCtx.font = "bold 72px system-ui, sans-serif";
      crowdCtx.textAlign = "center";
      crowdCtx.textBaseline = "middle";
      crowdCtx.fillText("STADIUM", w / 2, h / 2);
    }

    const vignette = crowdCtx.createRadialGradient(
      w / 2,
      h / 2,
      w * 0.18,
      w / 2,
      h / 2,
      w * 0.72,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.42)");
    crowdCtx.fillStyle = vignette;
    crowdCtx.fillRect(0, 0, w, h);

    baseCrowdTex.needsUpdate = true;
    for (const { texture } of crowdEntries) {
      texture.needsUpdate = true;
    }
  }

  function buildCrowdMeshes() {
    const maps = new Set<THREE.Texture>();
    for (const mesh of crowdMeshes) {
      scene.remove(mesh);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (mat.map) maps.add(mat.map);
      mat.dispose();
    }
    for (const texture of maps) texture.dispose();
    crowdMeshes.length = 0;
    crowdEntries.length = 0;

    const backStandW = 100;
    const backStandH = 18;
    const backTex = baseCrowdTex.clone();
    backTex.needsUpdate = true;
    const backStand = new THREE.Mesh(
      new THREE.PlaneGeometry(backStandW, backStandH),
      new THREE.MeshBasicMaterial({ map: backTex }),
    );
    backStand.position.set(0, backStandH / 2, GOAL_Z - GOAL_DEPTH - 8);
    scene.add(backStand);
    crowdMeshes.push(backStand);
    crowdEntries.push({ texture: backTex });

    const sideStandW = 36;
    const sideStandH = 16;
    const sideZCenter = GOAL_Z - GOAL_DEPTH - 8 + sideStandW / 2;

    const leftTex = baseCrowdTex.clone();
    leftTex.needsUpdate = true;
    const leftStand = new THREE.Mesh(
      new THREE.PlaneGeometry(sideStandW, sideStandH),
      new THREE.MeshBasicMaterial({ map: leftTex }),
    );
    leftStand.rotation.y = Math.PI / 2;
    leftStand.position.set(-SIDE_X, sideStandH / 2, sideZCenter);
    scene.add(leftStand);
    crowdMeshes.push(leftStand);
    crowdEntries.push({ texture: leftTex });

    const rightTex = baseCrowdTex.clone();
    rightTex.needsUpdate = true;
    const rightStand = new THREE.Mesh(
      new THREE.PlaneGeometry(sideStandW, sideStandH),
      new THREE.MeshBasicMaterial({ map: rightTex }),
    );
    rightStand.rotation.y = -Math.PI / 2;
    rightStand.position.set(SIDE_X, sideStandH / 2, sideZCenter);
    scene.add(rightStand);
    crowdMeshes.push(rightStand);
    crowdEntries.push({ texture: rightTex });
  }

  function loadBackgroundFromUrl(url: string) {
    const token = ++backgroundLoadToken;
    if (!url) {
      currentBackgroundImg = null;
      paintCrowdBackground(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (token !== backgroundLoadToken) return;
      currentBackgroundImg = img;
      paintCrowdBackground(img);
    };
    img.onerror = () => {
      if (token !== backgroundLoadToken) return;
      console.warn("[stadium] background image failed to load:", url);
      currentBackgroundImg = null;
      paintCrowdBackground(null);
    };
    img.src = url;
    if (img.complete && img.naturalWidth > 0) {
      currentBackgroundImg = img;
      paintCrowdBackground(img);
    }
  }

  paintCrowdBackground(null);
  buildCrowdMeshes();

  const adCanvas = document.createElement("canvas");
  adCanvas.width = 1024;
  adCanvas.height = 192;
  const adCtx = adCanvas.getContext("2d")!;
  const baseAdTex = new THREE.CanvasTexture(adCanvas);
  baseAdTex.colorSpace = THREE.SRGBColorSpace;
  baseAdTex.wrapS = THREE.RepeatWrapping;

  const boardEntries: CanvasTextureEntry[] = [];
  const adMeshes: THREE.Mesh[] = [];

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
    baseAdTex.needsUpdate = true;
    for (const { texture } of boardEntries) {
      texture.needsUpdate = true;
    }
  }

  const adImg = new Image();
  adImg.crossOrigin = "anonymous";

  function loadLogoFromUrl(url: string) {
    if (!url) {
      paintAd(null);
      return;
    }
    adImg.onload = () => paintAd(adImg);
    adImg.onerror = () => {
      console.warn("[stadium] ad logo failed to load:", url);
      paintAd(null);
    };
    adImg.src = url;
    if (adImg.complete && adImg.naturalWidth > 0) paintAd(adImg);
  }

  function placeAdBoard(centerX: number, centerZ: number, length: number, rotY: number) {
    const tex = baseAdTex.clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(length / 4, 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, 0.7), mat);
    mesh.position.set(centerX, 0.42, centerZ);
    mesh.rotation.y = rotY;
    scene.add(mesh);
    adMeshes.push(mesh);
    boardEntries.push({ texture: tex });
  }

  placeAdBoard(0, GOAL_Z - GOAL_DEPTH - 1.5, 36, 0);
  placeAdBoard(-SIDE_X + 0.5, GOAL_Z - GOAL_DEPTH / 2 + 4, 24, Math.PI / 2);
  placeAdBoard(SIDE_X - 0.5, GOAL_Z - GOAL_DEPTH / 2 + 4, 24, -Math.PI / 2);

  loadBackgroundFromUrl(options.backgroundUrl);
  loadLogoFromUrl(options.logoUrl);

  return {
    setLogoUrl(url: string) {
      loadLogoFromUrl(url);
    },
    setBackgroundUrl(url: string) {
      loadBackgroundFromUrl(url);
    },
    setStandsVariant(variant: StadiumStandsVariant) {
      if (variant === standsVariant) return;
      standsVariant = variant;
      if (!currentBackgroundImg) paintCrowdBackground(null);
    },
    dispose() {
      const crowdMaps = new Set<THREE.Texture>();
      for (const mesh of crowdMeshes) {
        scene.remove(mesh);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        if (mat.map) crowdMaps.add(mat.map);
        mat.dispose();
      }
      crowdMeshes.length = 0;
      crowdEntries.length = 0;
      for (const texture of crowdMaps) texture.dispose();
      baseCrowdTex.dispose();

      for (const mesh of adMeshes) {
        scene.remove(mesh);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
      adMeshes.length = 0;
      boardEntries.length = 0;
      baseAdTex.dispose();
    },
  };
}
