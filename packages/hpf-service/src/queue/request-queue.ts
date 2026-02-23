import { config } from '../config';

interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  priority: number;
}

/**
 * Sequential request queue with backpressure and circuit breaker.
 * Processes one request at a time with randomized delays between requests.
 */
export class RequestQueue {
  private queue: QueueItem<unknown>[] = [];
  private processing = false;
  private consecutiveFailures = 0;
  private paused = false;

  get depth(): number {
    return this.queue.length;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Enqueue a task. Higher priority = processed first. Returns promise that resolves when task completes. */
  async enqueue<T>(fn: () => Promise<T>, priority = 0): Promise<T> {
    if (this.queue.length >= config.queue.maxDepth) {
      throw new Error(`Queue full (${this.queue.length}/${config.queue.maxDepth})`);
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, priority } as QueueItem<unknown>);
      this.queue.sort((a, b) => b.priority - a.priority);
      this.processNext();
    });
  }

  /** Reset circuit breaker and resume processing */
  resume() {
    this.paused = false;
    this.consecutiveFailures = 0;
    this.processNext();
  }

  private async processNext() {
    if (this.processing || this.paused || this.queue.length === 0) return;

    this.processing = true;
    const item = this.queue.shift()!;

    try {
      const result = await item.fn();
      this.consecutiveFailures = 0;
      item.resolve(result);
    } catch (err) {
      this.consecutiveFailures++;
      item.reject(err);

      if (this.consecutiveFailures >= config.queue.circuitBreakerThreshold) {
        console.error(`[queue] Circuit breaker tripped after ${this.consecutiveFailures} consecutive failures`);
        this.paused = true;
      }
    } finally {
      this.processing = false;
    }

    // Delay before processing next item
    if (this.queue.length > 0 && !this.paused) {
      const delay = config.queue.delayMinMs +
        Math.random() * (config.queue.delayMaxMs - config.queue.delayMinMs);
      setTimeout(() => this.processNext(), delay);
    }
  }
}
