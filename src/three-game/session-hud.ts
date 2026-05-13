import type { SessionRuntime } from "./session-runtime";

export class SessionHud {
  private readonly hudShot: HTMLElement | null;
  private readonly hudScore: HTMLElement | null;
  private readonly hudStatus: HTMLElement | null;
  private readonly restartBtn: HTMLButtonElement | null;

  constructor(stage: HTMLElement, private readonly restartSession: () => void) {
    this.hudShot = stage.querySelector<HTMLElement>("#three-hud-shot");
    this.hudScore = stage.querySelector<HTMLElement>("#three-hud-score");
    this.hudStatus = stage.querySelector<HTMLElement>("#three-hud-status");
    this.restartBtn = stage.querySelector<HTMLButtonElement>(
      "#three-session-restart",
    );
    this.restartBtn?.addEventListener("click", this.onRestartSessionClick);
  }

  refresh(session: SessionRuntime) {
    const shotsPerSession = session.plan.shotsPerSession;

    if (session.complete) {
      if (this.hudShot) {
        this.hudShot.textContent = `Session complete (${shotsPerSession} kicks)`;
      }
      if (this.hudScore) this.hudScore.textContent = `Goals: ${session.goals}`;
      if (this.hudStatus) {
        this.hudStatus.textContent = session.plan.predeterminedWinScenario
          ? "Arc: favoured win"
          : "Arc: lose (scripted resistance)";
      }
      this.syncRestartBtn(session);
      return;
    }

    if (this.hudShot) {
      this.hudShot.textContent = `Shot ${session.shotsTaken + 1} / ${shotsPerSession}`;
    }
    if (this.hudScore) this.hudScore.textContent = `Goals: ${session.goals}`;
    if (this.hudStatus) {
      this.hudStatus.textContent = session.plan.predeterminedWinScenario
        ? "Arc: favoured win"
        : "Arc: lose";
    }
    this.syncRestartBtn(session);
  }

  dispose() {
    this.restartBtn?.removeEventListener("click", this.onRestartSessionClick);
  }

  private readonly onRestartSessionClick = () => {
    this.restartSession();
  };

  private syncRestartBtn(session: SessionRuntime) {
    if (this.restartBtn) this.restartBtn.hidden = !session.complete;
  }
}
