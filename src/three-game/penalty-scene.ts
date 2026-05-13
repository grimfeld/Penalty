import * as THREE from "three";
import { addBallToScene } from "./ball";
import { GOAL_Z, SPOT_Z } from "./constants";
import { addPitchSurfaceAndMarkings } from "./field";
import { addGoalAssembly } from "./goal-assembly";
import { createStadiumGraphics, type StadiumGraphics } from "./stadium";
import type { StadiumStandsVariant } from "./session-config";

export class PenaltyScene {
  readonly canvas: HTMLCanvasElement;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  readonly renderer: THREE.WebGLRenderer;
  readonly ball: THREE.Group;
  readonly ballShadow: THREE.Object3D;

  private readonly stadium: StadiumGraphics;
  private readonly tickNetImpl: () => void;
  readonly shakeNet: (point: THREE.Vector3) => void;

  constructor(
    private readonly stage: HTMLElement,
    options: {
      logoUrl: string;
      backgroundUrl: string;
      standsVariant: StadiumStandsVariant;
    },
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    stage.insertBefore(this.canvas, stage.firstChild);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(0x86c5ff);
    this.scene.fog = new THREE.Fog(0x86c5ff, 28, 90);

    this.camera.position.set(0, 1.55, SPOT_Z + 4);
    this.camera.lookAt(0, 1.0, GOAL_Z);
    this.camera.rotateY(0);

    this.addLights();
    addPitchSurfaceAndMarkings(this.scene);

    const goalAssembly = addGoalAssembly(this.scene);
    this.shakeNet = goalAssembly.shakeNet;
    this.tickNetImpl = goalAssembly.tickNet;

    this.stadium = createStadiumGraphics(this.scene, options);
    const ballParts = addBallToScene(this.scene);
    this.ball = ballParts.ball;
    this.ballShadow = ballParts.ballShadow;
  }

  resize() {
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    return { width, height };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  tickNet() {
    this.tickNetImpl();
  }

  setLogoUrl(logoUrl: string) {
    this.stadium.setLogoUrl(logoUrl);
  }

  setBackgroundUrl(backgroundUrl: string) {
    this.stadium.setBackgroundUrl(backgroundUrl);
  }

  setStandsVariant(standsVariant: StadiumStandsVariant) {
    this.stadium.setStandsVariant(standsVariant);
  }

  dispose() {
    this.stadium.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  private addLights() {
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
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xc9e2ff, 0x88aa66, 0.9));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  }
}
