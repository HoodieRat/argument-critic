export class SessionRegistry {
  private readonly lanes = new Map<string, Promise<unknown>>();
  private readonly controllers = new Map<string, AbortController>();

  public async runExclusive<T>(sessionId: string, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const prior = this.lanes.get(sessionId) ?? Promise.resolve();
    const run = prior
      .catch(() => undefined)
      .then(async () => {
        this.controllers.set(sessionId, controller);
        return task(controller.signal);
      })
      .finally(() => {
        if (this.controllers.get(sessionId) === controller) {
          this.controllers.delete(sessionId);
        }

        if (this.lanes.get(sessionId) === run) {
          this.lanes.delete(sessionId);
        }
      });

    this.lanes.set(sessionId, run.then(() => undefined, () => undefined));
    return run;
  }

  public cancel(sessionId: string): boolean {
    const controller = this.controllers.get(sessionId);
    if (!controller) {
      return false;
    }

    controller.abort();
    return true;
  }
}