import type { BrowserManager } from '../browser/manager';
import type { SessionManager } from '../browser/session';
import type { RequestQueue } from '../queue/request-queue';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  browser: 'connected' | 'disconnected';
  session: 'active' | 'expired' | 'unknown';
  queueDepth: number;
  queuePaused: boolean;
  uptime: number;
}

const startTime = Date.now();

export function getHealthStatus(
  browserManager: BrowserManager,
  sessionManager: SessionManager,
  requestQueue: RequestQueue,
): HealthStatus {
  const browserConnected = browserManager.isConnected();
  const sessionStatus = sessionManager.getStatus();
  const queuePaused = requestQueue.isPaused;

  let status: HealthStatus['status'] = 'ok';

  if (!browserConnected) {
    status = 'down';
  } else if (sessionStatus === 'expired' || queuePaused) {
    status = 'degraded';
  } else if (sessionStatus === 'unknown') {
    status = 'degraded';
  }

  return {
    status,
    browser: browserConnected ? 'connected' : 'disconnected',
    session: sessionStatus,
    queueDepth: requestQueue.depth,
    queuePaused,
    uptime: Date.now() - startTime,
  };
}
