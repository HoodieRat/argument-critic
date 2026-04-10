import type { Logger } from "../../logger.js";
import type { ProcessSupervisor } from "./ProcessSupervisor.js";

export interface ShutdownCoordinatorOptions {
  readonly logger: Logger;
  readonly processSupervisor: ProcessSupervisor;
}

type ShutdownHook = () => Promise<void>;

class ShutdownCoordinator {
  private readonly hooks: Array<{ readonly name: string; readonly handler: ShutdownHook }> = [];
  private activeShutdown: Promise<void> | null = null;

  public constructor(
    private readonly logger: Logger,
    private readonly processSupervisor: ProcessSupervisor
  ) {}

  public registerHook(name: string, handler: ShutdownHook): void {
    this.hooks.push({ name, handler });
  }

  public get isShuttingDown(): boolean {
    return this.activeShutdown !== null;
  }

  public async shutdown(reason: string): Promise<void> {
    if (this.activeShutdown) {
      return this.activeShutdown;
    }

    this.activeShutdown = (async () => {
      this.logger.info("Shutdown started", { reason });

      for (const hook of [...this.hooks].reverse()) {
        try {
          await hook.handler();
        } catch (error) {
          this.logger.warn("Shutdown hook failed", {
            hook: hook.name,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      await this.processSupervisor.shutdownAll(reason);
      this.logger.info("Shutdown finished", { reason });
    })();

    return this.activeShutdown;
  }
}

export function createShutdownCoordinator(options: ShutdownCoordinatorOptions): ShutdownCoordinator {
  return new ShutdownCoordinator(options.logger, options.processSupervisor);
}

export type { ShutdownCoordinator };