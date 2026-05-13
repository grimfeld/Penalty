import * as kaplayGame from "./kaplay-game";
import * as threeGame from "./three-game";

// =====================================================================
// Mode launcher. Two buttons swap between the original 2D kaplay game
// and the new 3D three.js game; only one game is mounted at a time.
// Each game module owns its own canvas inside #stage and returns a
// teardown function that we run before mounting the next mode.
// =====================================================================

type Mode = "kaplay" | "three";
type Teardown = () => void;

const stage = document.getElementById("stage") as HTMLDivElement;
const slider = document.getElementById("outcome") as HTMLInputElement;
const adBoardUrlInput = document.getElementById(
  "ad-board-url",
) as HTMLInputElement;
const stadiumBackgroundUrlInput = document.getElementById(
  "stadium-background-url",
) as HTMLInputElement;
const modeButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("#modes .mode-btn"),
);

const legacyHud = document.getElementById("legacy-outcome-hud");
const threeSessionHud = document.getElementById("three-session-hud");

let threeHandle: ReturnType<typeof threeGame.mount> | null = null;

function sliderSessionScenario(): threeGame.SessionScenario {
  return slider.value === "1" ? "win" : "lose";
}

function buildThreeGameConfig() {
  return threeGame.mergeThreeGameSessionConfig({
    sessionScenario: sliderSessionScenario(),
    adBoardLogoUrl: adBoardUrlInput.value.trim(),
    stadiumBackgroundUrl: stadiumBackgroundUrlInput.value.trim(),
    onSessionEnd(payload) {
      console.log("[three-game] session end", payload);
    },
  });
}

function setHudMode(mode: Mode) {
  if (legacyHud) legacyHud.hidden = mode === "three";
  if (threeSessionHud) threeSessionHud.hidden = mode !== "three";
}

let activeMode: Mode | null = null;
let teardown: Teardown | null = null;

function setMode(mode: Mode) {
  if (mode === activeMode) return;
  if (teardown) {
    try {
      teardown();
    } catch (err) {
      console.error("teardown error", err);
    }
    teardown = null;
  }
  threeHandle = null;
  activeMode = mode;
  for (const btn of modeButtons) {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  }
  if (mode === "three") {
    threeHandle = threeGame.mount(stage, buildThreeGameConfig());
    teardown = () => {
      threeHandle?.dispose();
      threeHandle = null;
    };
    setHudMode("three");
    (window as unknown as { penaltyThree?: ReturnType<typeof threeGame.mount> }).penaltyThree =
      threeHandle;
  } else {
    teardown = kaplayGame.mount(stage, slider);
    setHudMode("kaplay");
    (window as unknown as { penaltyThree?: ReturnType<typeof threeGame.mount> }).penaltyThree =
      undefined;
  }
}

for (const btn of modeButtons) {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode as Mode | undefined;
    if (mode === "kaplay" || mode === "three") setMode(mode);
  });
}

function syncThreeScenarioFromSlider() {
  if (!threeHandle) return;
  threeHandle.applySessionConfig({ sessionScenario: sliderSessionScenario() });
}

slider.addEventListener("input", syncThreeScenarioFromSlider);
slider.addEventListener("change", syncThreeScenarioFromSlider);

adBoardUrlInput.value =
  threeGame.DEFAULT_THREE_GAME_SESSION_CONFIG.adBoardLogoUrl;
stadiumBackgroundUrlInput.value =
  threeGame.DEFAULT_THREE_GAME_SESSION_CONFIG.stadiumBackgroundUrl;

function syncThreeAdBoardLogoUrl() {
  if (!threeHandle) return;
  threeHandle.applySessionConfig({
    adBoardLogoUrl: adBoardUrlInput.value.trim(),
  });
}

adBoardUrlInput.addEventListener("input", syncThreeAdBoardLogoUrl);
adBoardUrlInput.addEventListener("change", syncThreeAdBoardLogoUrl);

function syncThreeStadiumBackgroundUrl() {
  if (!threeHandle) return;
  threeHandle.applySessionConfig({
    stadiumBackgroundUrl: stadiumBackgroundUrlInput.value.trim(),
  });
}

stadiumBackgroundUrlInput.addEventListener(
  "input",
  syncThreeStadiumBackgroundUrl,
);
stadiumBackgroundUrlInput.addEventListener(
  "change",
  syncThreeStadiumBackgroundUrl,
);

setMode("three");
