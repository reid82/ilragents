import Fastify from 'fastify';
import { config } from './config';
import { BrowserManager } from './browser/manager';
import { SessionManager } from './browser/session';
import { RequestQueue } from './queue/request-queue';
import { ExtractionRouter, type ExtractionResult } from './extraction/router';
import { mapToListingData } from './mapping/listing-mapper';
import { mapToSuburbContext } from './mapping/suburb-mapper';
import { getHealthStatus } from './health/healthcheck';

const browserManager = new BrowserManager();
const sessionManager = new SessionManager(browserManager);
const requestQueue = new RequestQueue();
const extractionRouter = new ExtractionRouter(browserManager);

const app = Fastify({ logger: true });

// API key auth hook
app.addHook('onRequest', async (request, reply) => {
  // Health endpoint is unauthenticated
  if (request.url === '/api/v1/health') return;

  const apiKey = request.headers['x-api-key'];
  if (!config.apiKey || apiKey !== config.apiKey) {
    return reply.status(401).send({ error: 'Invalid or missing API key' });
  }
});

// Health endpoint
app.get('/api/v1/health', async () => {
  return getHealthStatus(browserManager, sessionManager, requestQueue);
});

// Property lookup by address
app.post<{
  Body: { address: string; suburb?: string; state?: string; postcode?: string };
}>('/api/v1/property/lookup', async (request, reply) => {
  const { address, suburb, state, postcode } = request.body;

  if (!address) {
    return reply.status(400).send({ error: 'address is required' });
  }

  // Check service health
  const health = getHealthStatus(browserManager, sessionManager, requestQueue);
  if (health.status === 'down') {
    return reply.status(503).send({ error: 'Service is down', health });
  }
  if (health.status === 'degraded') {
    return reply.status(503).send({ error: 'Service is degraded', health });
  }

  try {
    const result = await requestQueue.enqueue<ExtractionResult | null>(async () => {
      // Validate session before each request
      const sessionValid = await sessionManager.validate();
      if (!sessionValid) {
        throw new Error('HPF session expired');
      }

      return extractionRouter.lookupProperty(address, suburb, state, postcode);
    });

    if (!result) {
      return reply.status(404).send({ error: 'Property not found' });
    }

    // Save session after successful request
    await browserManager.saveSession();

    const listing = mapToListingData(result);
    const suburbContext = result.suburbProfile ? mapToSuburbContext(result) : null;

    return {
      listing,
      suburb: suburbContext,
      intelligence: null, // Future: map HPF data to PropertyIntelligence
      source: 'hpf' as const,
      fetchedMs: result.fetchedMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('Queue full')) {
      return reply.status(503).send({ error: message });
    }
    if (message.includes('session expired')) {
      return reply.status(503).send({ error: 'HPF session expired - manual re-login required' });
    }

    return reply.status(500).send({ error: message });
  }
});

// Startup
async function start() {
  try {
    // Launch browser and validate session
    await browserManager.launch();
    const sessionValid = await sessionManager.validate();

    if (sessionValid) {
      console.log('[server] Session is valid');
    } else {
      console.warn('[server] Session is NOT valid - manual login required via browser');
      console.warn('[server] Service will start in degraded mode');
    }

    // Start keep-alive
    sessionManager.startKeepAlive();

    // Start HTTP server
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`[server] HPF service listening on port ${config.port}`);
  } catch (err) {
    console.error('[server] Fatal startup error:', err);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('[server] Shutting down...');
  sessionManager.stopKeepAlive();
  await browserManager.close();
  await app.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
