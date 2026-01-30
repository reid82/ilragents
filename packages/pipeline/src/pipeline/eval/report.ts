/**
 * Report
 * Formats eval results as CLI table and optional JSON file.
 */

import { writeFileSync } from 'fs';
import type { EvalScore } from './evaluator';

export interface ScenarioResult {
  id: string;
  category: string;
  agent: string;
  profile: string;
  question: string;
  turn?: number;
  scores: EvalScore;
  justifications: Record<keyof EvalScore, string>;
  overall: number;
  flags: string[];
  response: string;
}

export interface AgentSummary {
  agent: string;
  scenarioCount: number;
  avgRelevance: number;
  avgHelpfulness: number;
  avgDeflection: number;
  avgContextAwareness: number;
  avgSourceGrounding: number;
  avgConversational: number;
  avgOverall: number;
  failCount: number;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pad(str: string, len: number): string {
  return str.padEnd(len);
}

function padNum(n: number, len: number): string {
  return n.toFixed(1).padStart(len);
}

function summariseByAgent(results: ScenarioResult[]): AgentSummary[] {
  const byAgent = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    const list = byAgent.get(r.agent) || [];
    list.push(r);
    byAgent.set(r.agent, list);
  }

  const summaries: AgentSummary[] = [];
  for (const [agent, items] of byAgent) {
    summaries.push({
      agent,
      scenarioCount: items.length,
      avgRelevance: avg(items.map((i) => i.scores.relevance)),
      avgHelpfulness: avg(items.map((i) => i.scores.helpfulness)),
      avgDeflection: avg(items.map((i) => i.scores.deflection)),
      avgContextAwareness: avg(items.map((i) => i.scores.contextAwareness)),
      avgSourceGrounding: avg(items.map((i) => i.scores.sourceGrounding)),
      avgConversational: avg(items.map((i) => i.scores.conversational)),
      avgOverall: avg(items.map((i) => i.overall)),
      failCount: items.filter((i) => i.flags.length > 0).length,
    });
  }

  return summaries.sort((a, b) => b.avgOverall - a.avgOverall);
}

export function printReport(results: ScenarioResult[]): void {
  const summaries = summariseByAgent(results);

  // Agent summary table
  console.log('\n=== AGENT SUMMARY ===\n');
  console.log(
    `${pad('Agent', 20)} ${pad('N', 4)} ${pad('Rel', 5)} ${pad('Help', 5)} ${pad('Defl', 5)} ${pad('Ctx', 5)} ${pad('Src', 5)} ${pad('Conv', 5)} ${pad('Avg', 5)} ${pad('Fail', 5)}`
  );
  console.log('-'.repeat(64));

  for (const s of summaries) {
    const failStr = s.failCount > 0 ? `${s.failCount}` : '-';
    console.log(
      `${pad(s.agent, 20)} ${pad(String(s.scenarioCount), 4)} ${padNum(s.avgRelevance, 5)} ${padNum(s.avgHelpfulness, 5)} ${padNum(s.avgDeflection, 5)} ${padNum(s.avgContextAwareness, 5)} ${padNum(s.avgSourceGrounding, 5)} ${padNum(s.avgConversational, 5)} ${padNum(s.avgOverall, 5)} ${pad(failStr, 5)}`
    );
  }

  // Category breakdown
  const categories = [...new Set(results.map((r) => r.category))];
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catAvg = avg(catResults.map((r) => r.overall));
    const catFails = catResults.filter((r) => r.flags.length > 0).length;

    console.log(`\n=== ${cat.toUpperCase()} (avg: ${catAvg.toFixed(1)}, fails: ${catFails}) ===\n`);

    for (const r of catResults) {
      const turnLabel = r.turn ? ` [turn ${r.turn}]` : '';
      const status = r.flags.length > 0 ? 'FAIL' : 'PASS';
      const statusColor = r.flags.length > 0 ? '\x1b[31m' : '\x1b[32m';
      console.log(
        `  ${statusColor}${status}\x1b[0m  ${r.id}${turnLabel}  (${r.overall.toFixed(1)})  ${r.agent} | ${r.profile}`
      );
      console.log(`        Q: ${r.question.slice(0, 80)}`);

      if (r.flags.length > 0) {
        for (const flag of r.flags) {
          console.log(`        \x1b[31m! ${flag}\x1b[0m`);
        }
      }
    }
  }

  // Overall summary
  const totalAvg = avg(results.map((r) => r.overall));
  const totalFails = results.filter((r) => r.flags.length > 0).length;
  console.log(`\n=== OVERALL: ${totalAvg.toFixed(1)} avg, ${totalFails}/${results.length} failing ===\n`);
}

export function writeJsonReport(results: ScenarioResult[], filePath: string): void {
  const summaries = summariseByAgent(results);
  const report = {
    timestamp: new Date().toISOString(),
    totalScenarios: results.length,
    overallAverage: avg(results.map((r) => r.overall)),
    failingCount: results.filter((r) => r.flags.length > 0).length,
    agentSummaries: summaries,
    scenarios: results.map((r) => ({
      id: r.id,
      category: r.category,
      agent: r.agent,
      profile: r.profile,
      question: r.question,
      turn: r.turn,
      scores: r.scores,
      justifications: r.justifications,
      overall: r.overall,
      flags: r.flags,
      responsePreview: r.response.slice(0, 300),
    })),
  };

  writeFileSync(filePath, JSON.stringify(report, null, 2));
  console.log(`JSON report written to ${filePath}`);
}
