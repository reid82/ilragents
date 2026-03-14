/**
 * In-memory store for background UMAP recompute jobs.
 * Only one job runs at a time. Status is polled by the frontend.
 */

export interface MapJobStatus {
  state: 'idle' | 'running' | 'done' | 'error';
  stage?: string;
  progress?: number; // 0-100
  updated?: number;
  duration_ms?: number;
  error?: string;
  startedAt?: number;
}

let currentJob: MapJobStatus = { state: 'idle' };

export function getJobStatus(): MapJobStatus {
  return { ...currentJob };
}

export function setJobStatus(status: Partial<MapJobStatus>) {
  currentJob = { ...currentJob, ...status };
}

export function resetJob() {
  currentJob = { state: 'idle' };
}

export function isJobRunning(): boolean {
  return currentJob.state === 'running';
}
