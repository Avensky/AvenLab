type Job = { run: () => unknown; resolve: (value: unknown) => void; reject: (reason: unknown) => void; signal?: AbortSignal; abort: () => void };

// One budget for ALL city assets, so simultaneous loaders cannot each consume
// a full frame. An individual driver upload is atomic and can exceed the budget.
export class CityWorkQueue {
  private jobs: Job[] = [];
  private scheduled = false;
  private schedule: (callback: () => void) => void;
  private now: () => number;
  private budgetMs: number;
  private maxJobs: number;
  constructor(schedule: (callback: () => void) => void = callback => requestAnimationFrame(callback),
    now = () => performance.now(), budgetMs = 3, maxJobs = 12) {
    this.schedule = schedule; this.now = now; this.budgetMs = budgetMs; this.maxJobs = maxJobs;
  }
  enqueue<T>(run: () => T, signal?: AbortSignal): Promise<T | undefined> {
    if (signal?.aborted) return Promise.resolve(undefined);
    return new Promise<T | undefined>((resolve, reject) => {
      const job: Job = { run, resolve: value => resolve(value as T), reject, signal,
        abort: () => { this.jobs = this.jobs.filter(other => other !== job); resolve(undefined); } };
      signal?.addEventListener("abort", job.abort, { once: true });
      this.jobs.push(job); this.request();
    });
  }
  private request() {
    if (this.scheduled || !this.jobs.length) return;
    this.scheduled = true; this.schedule(() => this.flush());
  }
  private flush() {
    this.scheduled = false;
    const start = this.now(); let count = 0;
    while (this.jobs.length && count++ < this.maxJobs) {
      const job = this.jobs.shift()!;
      job.signal?.removeEventListener("abort", job.abort);
      if (job.signal?.aborted) job.resolve(undefined);
      else { try { job.resolve(job.run()); } catch (error) { job.reject(error); } }
      if (this.now() - start >= this.budgetMs) break;
    }
    this.request();
  }
}
export const cityWorkQueue = new CityWorkQueue();

const pending = new Map<symbol, string>();
let detailed = 0, proxies = 0, lastWarmupMs = 0;
export function beginCityPreparation(label: string) {
  const id = Symbol(label), start = performance.now(); pending.set(id, label);
  let ended = false;
  return { phase: (phase: string) => { if (!ended) pending.set(id, `${label}: ${phase}`); },
    end: () => { if (ended) return; ended = true; pending.delete(id); lastWarmupMs = performance.now() - start; } };
}
export function setCityDetailCounts(full: number, proxy: number) { detailed = full; proxies = proxy; }
export function cityStreamingStats() { return { detailed, proxies, pending: pending.size, phase: [...pending.values()].join(" · "), lastWarmupMs }; }
