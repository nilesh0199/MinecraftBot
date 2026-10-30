/**
 * Memory & Process Watchdog
 * Protects against Chunk Bans, NBT packet bombs, and memory exhaustion
 */

export interface ProcessMetrics {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  activeBotsCount: number;
}

export class MemoryWatchdog {
  private static instance: MemoryWatchdog;
  private interval: NodeJS.Timeout | null = null;
  private onMemoryEmergency?: () => void;

  // Maximum RSS threshold for the entire Node.js container (550MB on 1GB VPS)
  private readonly MAX_RSS_MB = 550;
  // Maximum heap threshold (450MB)
  private readonly MAX_HEAP_MB = 450;

  public static getInstance(): MemoryWatchdog {
    if (!MemoryWatchdog.instance) {
      MemoryWatchdog.instance = new MemoryWatchdog();
    }
    return MemoryWatchdog.instance;
  }

  public start(emergencyCallback: () => void) {
    this.onMemoryEmergency = emergencyCallback;

    if (this.interval) clearInterval(this.interval);

    // Run every 12 seconds
    this.interval = setInterval(() => {
      this.checkMemory();
    }, 12000);
  }

  public getMetrics(activeBotsCount: number = 0): ProcessMetrics {
    const memory = process.memoryUsage();
    return {
      heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
      rssMB: Math.round(memory.rss / 1024 / 1024),
      activeBotsCount,
    };
  }

  private checkMemory() {
    const metrics = this.getMetrics();

    // If memory is critically high (e.g. from an NBT bomb or chunk poison attack)
    if (metrics.rssMB > this.MAX_RSS_MB || metrics.heapUsedMB > this.MAX_HEAP_MB) {
      console.warn(`[WATCHDOG EMERGENCY] Critical memory usage detected! (RSS: ${metrics.rssMB}MB, Heap: ${metrics.heapUsedMB}MB). Triggering emergency memory reclamation...`);
      
      // Request garbage collection if exposed
      if (global.gc) {
        try {
          global.gc();
        } catch {}
      }

      // Notify BotManager to cleanly stop idle/heavy bots before OOM crash
      if (this.onMemoryEmergency) {
        this.onMemoryEmergency();
      }
    }
  }

  public stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
