"use strict";
/**
 * Memory & Process Watchdog
 * Protects against Chunk Bans, NBT packet bombs, and memory exhaustion
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryWatchdog = void 0;
class MemoryWatchdog {
    static instance;
    interval = null;
    onMemoryEmergency;
    // Maximum RSS threshold for the entire Node.js container (550MB on 1GB VPS)
    MAX_RSS_MB = 550;
    // Maximum heap threshold (450MB)
    MAX_HEAP_MB = 450;
    static getInstance() {
        if (!MemoryWatchdog.instance) {
            MemoryWatchdog.instance = new MemoryWatchdog();
        }
        return MemoryWatchdog.instance;
    }
    start(emergencyCallback) {
        this.onMemoryEmergency = emergencyCallback;
        if (this.interval)
            clearInterval(this.interval);
        // Run every 12 seconds
        this.interval = setInterval(() => {
            this.checkMemory();
        }, 12000);
    }
    getMetrics(activeBotsCount = 0) {
        const memory = process.memoryUsage();
        return {
            heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
            rssMB: Math.round(memory.rss / 1024 / 1024),
            activeBotsCount,
        };
    }
    checkMemory() {
        const metrics = this.getMetrics();
        // If memory is critically high (e.g. from an NBT bomb or chunk poison attack)
        if (metrics.rssMB > this.MAX_RSS_MB || metrics.heapUsedMB > this.MAX_HEAP_MB) {
            console.warn(`[WATCHDOG EMERGENCY] Critical memory usage detected! (RSS: ${metrics.rssMB}MB, Heap: ${metrics.heapUsedMB}MB). Triggering emergency memory reclamation...`);
            // Request garbage collection if exposed
            if (global.gc) {
                try {
                    global.gc();
                }
                catch { }
            }
            // Notify BotManager to cleanly stop idle/heavy bots before OOM crash
            if (this.onMemoryEmergency) {
                this.onMemoryEmergency();
            }
        }
    }
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}
exports.MemoryWatchdog = MemoryWatchdog;
