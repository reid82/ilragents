const APIFY_BASE = 'https://api.apify.com/v2';

interface RunOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export class ApifyClient {
  private token: string;

  constructor() {
    this.token = process.env.APIFY_API_TOKEN || '';
    if (!this.token) throw new Error('APIFY_API_TOKEN is required');
  }

  async runActor(actorId: string, input: Record<string, unknown>, opts?: RunOptions): Promise<unknown[]> {
    const pollInterval = opts?.pollIntervalMs ?? 2000;
    const timeout = opts?.timeoutMs ?? 60000;

    // Start the run
    const startRes = await fetch(`${APIFY_BASE}/acts/${actorId}/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15000),
    });

    if (!startRes.ok) {
      console.error(`[apify] Failed to start actor ${actorId}: ${startRes.status}`);
      return [];
    }

    let run = (await startRes.json()).data;

    // Poll until finished
    const deadline = Date.now() + timeout;
    while (run.status === 'RUNNING' || run.status === 'READY') {
      if (Date.now() > deadline) {
        console.error(`[apify] Actor ${actorId} timed out`);
        return [];
      }
      await new Promise(r => setTimeout(r, pollInterval));
      const pollRes = await fetch(`${APIFY_BASE}/actor-runs/${run.id}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!pollRes.ok) return [];
      run = (await pollRes.json()).data;
    }

    if (run.status !== 'SUCCEEDED') {
      console.error(`[apify] Actor ${actorId} finished with status: ${run.status}`);
      return [];
    }

    // Fetch dataset items
    const dsRes = await fetch(`${APIFY_BASE}/datasets/${run.defaultDatasetId}/items`, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!dsRes.ok) return [];
    return (await dsRes.json()) as unknown[];
  }
}
