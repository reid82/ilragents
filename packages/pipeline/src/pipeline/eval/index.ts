/**
 * Eval CLI
 * Run agent evaluation suite from the command line.
 *
 * Usage:
 *   npx tsx packages/pipeline/src/pipeline/eval/index.ts
 *   npx tsx packages/pipeline/src/pipeline/eval/index.ts --agent "Investor Coach"
 *   npx tsx packages/pipeline/src/pipeline/eval/index.ts --json eval-report.json
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runEval } from './runner';
import { printReport, writeJsonReport } from './report';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from repo root
config({ path: resolve(__dirname, '../../../../../.env') });

async function main() {
  const args = process.argv.slice(2);

  // Parse --agent flag
  let agentFilter: string | undefined;
  const agentIdx = args.indexOf('--agent');
  if (agentIdx !== -1 && args[agentIdx + 1]) {
    agentFilter = args[agentIdx + 1];
  }

  // Parse --json flag
  let jsonPath: string | undefined;
  const jsonIdx = args.indexOf('--json');
  if (jsonIdx !== -1 && args[jsonIdx + 1]) {
    jsonPath = args[jsonIdx + 1];
  }

  console.log('ILRE Agent Evaluation');
  console.log('=====================');
  if (agentFilter) {
    console.log(`Filtering: ${agentFilter}`);
  }
  console.log('');

  const startTime = Date.now();

  const results = await runEval({
    agentFilter,
    onProgress: (completed, total, scenarioId) => {
      process.stdout.write(`\r  [${completed}/${total}] ${scenarioId}${''.padEnd(40)}`);
    },
  });

  // Clear progress line
  process.stdout.write('\r' + ''.padEnd(80) + '\r');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Completed ${results.length} evaluations in ${elapsed}s`);

  printReport(results);

  if (jsonPath) {
    writeJsonReport(results, jsonPath);
  }
}

main().catch((error) => {
  console.error('Eval failed:', error);
  process.exit(1);
});
