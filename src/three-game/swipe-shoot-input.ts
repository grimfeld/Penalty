import { SWIPE_MAX_DURATION_MS, SWIPE_MIN_UP } from "./constants";

type DragStart = { x: number; y: number; t: number };

export class SwipeShootInput {
  private dragStart: DragStart | null = null;

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.canStart()) return;

    const bounds = this.canvas.getBoundingClientRect();
    this.dragStart = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      t: performance.now(),
    };
    this.canvas.setPointerCapture(event.pointerId);
    this.clearTrail();
    this.pushTrail(event.clientX, event.clientY);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.dragStart) return;
    this.pushTrail(event.clientX, event.clientY);
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (!this.dragStart) return;

    this.pushTrail(event.clientX, event.clientY);
    const bounds = this.canvas.getBoundingClientRect();
    const ex = event.clientX - bounds.left;
    const ey = event.clientY - bounds.top;
    const dx = ex - this.dragStart.x;
    const dy = ey - this.dragStart.y;
    const elapsed = performance.now() - this.dragStart.t;
    this.dragStart = null;

    if (dy < -SWIPE_MIN_UP && elapsed < SWIPE_MAX_DURATION_MS) {
      const speed = Math.hypot(dx, dy) / Math.max(elapsed, 1);
      this.onShoot(dx, speed);
    }
  };

  private readonly onPointerCancel = () => {
    this.dragStart = null;
  };

  private readonly onTouchMove = (event: TouchEvent) => {
    event.preventDefault();
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: {
      canStart: () => boolean;
      onShoot: (dx: number, speed: number) => void;
      pushTrail: (clientX: number, clientY: number) => void;
      clearTrail: () => void;
    },
  ) {
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
  }

  cancel() {
    this.dragStart = null;
  }

  dispose() {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    this.canvas.removeEventListener("touchmove", this.onTouchMove);
  }

  private canStart() {
    return this.options.canStart();
  }

  private onShoot(dx: number, speed: number) {
    this.options.onShoot(dx, speed);
  }

  private pushTrail(clientX: number, clientY: number) {
    this.options.pushTrail(clientX, clientY);
  }

  private clearTrail() {
    this.options.clearTrail();
  }
}
