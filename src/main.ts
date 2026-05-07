import * as kaplayGame from "./kaplay-game";
import * as threeGame from "./three-game";

// =====================================================================
// Mode launcher. Two buttons swap between the original 2D kaplay game
// and the new 3D three.js game; only one game is mounted at a time.
// Each game module owns its own canvas inside #stage and returns a
// teardown function that we run before mounting the next mode.
// =====================================================================

type Mode = "kaplay" | "three";
type Mounter = (stage: HTMLElement, slider: HTMLInputElement) => () => void;

const stage = document.getElementById("stage") as HTMLDivElement;
const slider = document.getElementById("outcome") as HTMLInputElement;
const modeButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("#modes .mode-btn"),
);

const mounters: Record<Mode, Mounter> = {
  kaplay: kaplayGame.mount,
  three: threeGame.mount,
};

let activeMode: Mode | null = null;
let teardown: (() => void) | null = null;

function setMode(mode: Mode) {
  if (mode === activeMode) return;
  if (teardown) {
    try {
      teardown();
    } catch (err) {
      // Teardown failure shouldn't prevent the next mount; log and move on.
      console.error("teardown error", err);
    }
    teardown = null;
  }
  activeMode = mode;
  for (const btn of modeButtons) {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  }
  teardown = mounters[mode](stage, slider);
}

for (const btn of modeButtons) {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode as Mode | undefined;
    if (mode === "kaplay" || mode === "three") setMode(mode);
  });
}

setMode("three");
