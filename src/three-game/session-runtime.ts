import type {
  ResolvedSessionPlan,
  SessionEndPayload,
  ThreeGameSessionConfig,
} from "./session-config";

export type AttemptResult = "goal" | "save" | "miss";

export class SessionRuntime {
  goals = 0;
  shotsTaken = 0;
  complete = false;

  private outcomeRecordedForAttempt = false;

  constructor(
    public plan: ResolvedSessionPlan,
    private getConfig: () => ThreeGameSessionConfig,
    private readonly onChange: () => void,
  ) {}

  get shotsRemaining() {
    return this.shotsTaken < this.plan.shotsPerSession;
  }

  beginAttempt() {
    this.outcomeRecordedForAttempt = false;
  }

  recordAttemptResult(kind: AttemptResult) {
    if (this.outcomeRecordedForAttempt || this.complete) return;
    this.outcomeRecordedForAttempt = true;
    if (kind === "goal") this.goals++;
    this.shotsTaken++;
    this.onChange();

    if (this.shotsTaken >= this.plan.shotsPerSession) {
      this.complete = true;
      this.onChange();
      this.getConfig().onSessionEnd?.(this.payload());
    }
  }

  restart(plan: ResolvedSessionPlan) {
    this.plan = plan;
    this.goals = 0;
    this.shotsTaken = 0;
    this.complete = false;
    this.outcomeRecordedForAttempt = false;
    this.onChange();
  }

  private payload(): SessionEndPayload {
    return {
      goals: this.goals,
      shots: this.plan.shotsPerSession,
      predeterminedWinScenario: this.plan.predeterminedWinScenario,
      forcedNonGoalShotIndices: Array.from(this.plan.forcedNonGoalShots).sort(
        (a, b) => a - b,
      ),
    };
  }
}
