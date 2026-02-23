import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3100', 10),
  apiKey: process.env.HPF_API_KEY || '',

  hpf: {
    baseUrl: process.env.HPF_BASE_URL || 'https://app.hotpropertyfinder.ai',
    loginUrl: process.env.HPF_LOGIN_URL || 'https://app.hotpropertyfinder.ai/auth/login/',
    apiBase: process.env.HPF_API_BASE || 'https://app.hotpropertyfinder.ai',
    email: process.env.HPF_EMAIL || '',
    password: process.env.HPF_PASSWORD || '',
  },

  browser: {
    headless: process.env.HPF_HEADLESS === 'true',
    sessionPath: process.env.HPF_SESSION_PATH || 'data/hpf-session.json',
    keepAliveIntervalMs: 15 * 60 * 1000, // 15 minutes
    requestTimeoutMs: 30_000,
  },

  queue: {
    maxDepth: 20,
    delayMinMs: 1500,
    delayMaxMs: 3000,
    circuitBreakerThreshold: 3,
  },
};
