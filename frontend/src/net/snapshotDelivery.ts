export interface SnapshotReceipt<T> {
  snapshot: T;
  receivedMs: number;
}

export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

/** A socket can deliver a burst after a blocked/background tab. Decode every
 * packet, but publish only its newest state before the next render. This queue
 * holds one immutable snapshot, never a backlog of obsolete UI updates.
 *
 * Initial/lifecycle frames may publish immediately so spawning, death and
 * world transitions cannot wait for an animation frame. Receipt timestamps
 * remain arrival times, not the later UI publication time.
 */
export class SnapshotDelivery<T extends { tick: number }> {
  private pending: SnapshotReceipt<T> | null = null;
  private frame: number | null = null;
  private generation = 0;
  private latestTick: number | null = null;
  private publish: (receipt: SnapshotReceipt<T>) => void;
  private scheduler: FrameScheduler;
  coalesced = 0;

  constructor(
    publish: (receipt: SnapshotReceipt<T>) => void,
    scheduler: FrameScheduler,
  ) {
    this.publish = publish;
    this.scheduler = scheduler;
  }

  offer(snapshot: T, receivedMs: number, immediate = false): boolean {
    if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 ||
        !Number.isFinite(receivedMs) ||
        (this.latestTick !== null && snapshot.tick <= this.latestTick)) return false;
    const first = this.latestTick === null;
    this.latestTick = snapshot.tick;
    if (this.pending) this.coalesced++;
    this.pending = { snapshot, receivedMs };
    if (first || immediate) this.flush();
    else if (this.frame === null) {
      const generation = this.generation;
      this.frame = this.scheduler.request(() => {
        // A cancelled callback may already be in the browser's ready queue.
        // It must not flush a new world's pending snapshot.
        if (generation !== this.generation) return;
        this.frame = null;
        this.flush();
      });
    }
    return true;
  }

  private cancelFrame() {
    this.generation++;
    if (this.frame !== null) this.scheduler.cancel(this.frame);
    this.frame = null;
  }

  private flush() {
    this.cancelFrame();
    const receipt = this.pending;
    this.pending = null;
    if (receipt) this.publish(receipt);
  }

  reset() {
    this.cancelFrame();
    this.pending = null;
    this.latestTick = null;
    this.coalesced = 0;
  }
}
