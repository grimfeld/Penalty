type Label = { text: string; color: string; start: number; duration: number };
type TrailPoint = { x: number; y: number; t: number };

const TRAIL_LIFE = 0.25;
const TRAIL_WIDTH = 16;
const TRAIL_MAX_LEN = 220;

export class OverlayFeedback {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private label: Label | null = null;
  private readonly trail: TrailPoint[] = [];

  constructor(stage: HTMLElement, after: Element) {
    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "none";
    stage.insertBefore(this.canvas, after.nextSibling);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create overlay canvas context");
    this.ctx = ctx;
  }

  resize(width: number, height: number, pixelRatio = window.devicePixelRatio || 1) {
    this.canvas.width = Math.floor(width * pixelRatio);
    this.canvas.height = Math.floor(height * pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  announce(text: string, color: string) {
    this.label = {
      text,
      color,
      start: performance.now() / 1000,
      duration: 0.85,
    };
  }

  clearTransientState() {
    this.label = null;
    this.trail.length = 0;
  }

  pushTrail(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    this.trail.push({ x, y, t: performance.now() / 1000 });

    let total = 0;
    for (let i = this.trail.length - 1; i > 0; i--) {
      const a = this.trail[i]!;
      const b = this.trail[i - 1]!;
      total += Math.hypot(a.x - b.x, a.y - b.y);
      if (total > TRAIL_MAX_LEN) {
        this.trail.splice(0, i);
        return;
      }
    }
  }

  draw(now: number, width: number, height: number) {
    this.ctx.clearRect(0, 0, width, height);
    this.tickTrail(now);
    this.tickLabel(now, width, height);
  }

  dispose() {
    this.canvas.remove();
  }

  private tickLabel(now: number, width: number, height: number) {
    if (!this.label) return;
    const t = now - this.label.start;
    if (t >= this.label.duration) {
      this.label = null;
      return;
    }

    const u = t / this.label.duration;
    const popU = Math.min(u / 0.2, 1);
    const popScale = 0.6 + (1 - Math.pow(1 - popU, 3)) * 0.5;
    const fade = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;

    this.ctx.save();
    this.ctx.globalAlpha = fade * 0.95;
    this.ctx.translate(width / 2, height / 2 - 30);
    this.ctx.scale(popScale, popScale);
    this.ctx.font = "bold 64px system-ui, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.lineWidth = 6;
    this.ctx.strokeStyle = "rgba(0,0,0,0.6)";
    this.ctx.fillStyle = this.label.color;
    this.ctx.strokeText(this.label.text, 0, 0);
    this.ctx.fillText(this.label.text, 0, 0);
    this.ctx.restore();
  }

  private tickTrail(now: number) {
    while (this.trail.length && now - this.trail[0]!.t > TRAIL_LIFE) {
      this.trail.shift();
    }
    if (this.trail.length < 2) return;

    this.ctx.save();
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1]!;
      const b = this.trail[i]!;
      const age = now - b.t;
      const fade = Math.max(0, 1 - age / TRAIL_LIFE);

      this.ctx.globalAlpha = 0.18 * fade;
      this.ctx.strokeStyle = "white";
      this.ctx.lineWidth = TRAIL_WIDTH * fade;
      this.ctx.beginPath();
      this.ctx.moveTo(a.x, a.y);
      this.ctx.lineTo(b.x, b.y);
      this.ctx.stroke();

      this.ctx.globalAlpha = 0.55 * fade;
      this.ctx.lineWidth = TRAIL_WIDTH * 0.45 * fade;
      this.ctx.beginPath();
      this.ctx.moveTo(a.x, a.y);
      this.ctx.lineTo(b.x, b.y);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }
}
