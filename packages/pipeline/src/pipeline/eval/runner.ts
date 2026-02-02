/**
 * Runner
 * Orchestrates evaluation: loads scenarios, calls chat(), calls evaluator, collects scores.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chat } from '../chat';
import type { ChatMessage } from '../chat';
import { getProfile } from './profiles';
import type { AgentBriefs } from './profiles';
import { evaluateResponse } from './evaluator';
import type { RubricCriteria } from './evaluator';
import type { ScenarioResult } from './report';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AGENT_TO_BRIEF_KEY: Record<string, keyof AgentBriefs> = {
  'Baseline Ben': 'baselineBen',
  'Finder Fred': 'finderFred',
  'Investor Coach': 'investorCoach',
  'Finance & Legal Team': 'dealSpecialist',
};

interface SingleTurnScenario {
  id: string;
  category: string;
  agent: string;
  profile: string;
  question: string;
  rubric: RubricCriteria;
  turns?: undefined;
}

interface MultiTurnScenario {
  id: string;
  category: string;
  agent: string;
  profile: string;
  turns: Array<{
    question: string;
    rubric: RubricCriteria;
  }>;
  question?: undefined;
  rubric?: undefined;
}

type Scenario = SingleTurnScenario | MultiTurnScenario;

function loadScenarios(): Scenario[] {
  const scenariosPath = resolve(__dirname, 'scenarios.json');
  const raw = readFileSync(scenariosPath, 'utf-8');
  return JSON.parse(raw);
}

export interface RunOptions {
  agentFilter?: string;
  onProgress?: (completed: number, total: number, scenarioId: string) => void;
}

export async function runEval(options: RunOptions = {}): Promise<ScenarioResult[]> {
  const allScenarios = loadScenarios();
  const scenarios = options.agentFilter
    ? allScenarios.filter((s) => s.agent === options.agentFilter)
    : allScenarios;

  // Count total evaluations (multi-turn scenarios have multiple)
  let totalEvals = 0;
  for (const s of scenarios) {
    totalEvals += s.turns ? s.turns.length : 1;
  }

  const results: ScenarioResult[] = [];
  let completed = 0;

  for (const scenario of scenarios) {
    const profile = getProfile(scenario.profile);
    if (!profile) {
      console.error(`Profile not found: ${scenario.profile}, skipping ${scenario.id}`);
      continue;
    }

    const briefKey = AGENT_TO_BRIEF_KEY[scenario.agent];
    const agentBrief = briefKey ? profile.agentBriefs[briefKey] : undefined;
    const financialContext = agentBrief
      ? `${agentBrief}\n\nCLIENT DATA:\n${JSON.stringify({ summary: profile.summary }, null, 2)}`
      : profile.summary;

    if (scenario.turns) {
      // Multi-turn scenario
      const history: ChatMessage[] = [];

      for (let i = 0; i < scenario.turns.length; i++) {
        const turn = scenario.turns[i];
        completed++;
        options.onProgress?.(completed, totalEvals, `${scenario.id} [turn ${i + 1}]`);

        try {
          const { reply, sources } = await chat(turn.question, history, {
            agent: scenario.agent,
            financialContext,
          });

          // Evaluate this turn's response
          const evalResult = await evaluateResponse(
            turn.question,
            reply,
            profile.summary,
            turn.rubric,
            agentBrief
          );

          results.push({
            id: scenario.id,
            category: scenario.category,
            agent: scenario.agent,
            profile: scenario.profile,
            question: turn.question,
            turn: i + 1,
            scores: evalResult.scores,
            justifications: evalResult.justifications,
            overall: evalResult.overall,
            flags: evalResult.flags,
            response: reply,
          });

          // Build history for next turn
          history.push({ role: 'user', content: turn.question });
          history.push({ role: 'assistant', content: reply });
        } catch (error) {
          console.error(`Error in ${scenario.id} turn ${i + 1}:`, error);
          results.push({
            id: scenario.id,
            category: scenario.category,
            agent: scenario.agent,
            profile: scenario.profile,
            question: turn.question,
            turn: i + 1,
            scores: { relevance: 0, helpfulness: 0, deflection: 0, contextAwareness: 0, sourceGrounding: 0, conversational: 0 },
            justifications: {
              relevance: 'Error during evaluation',
              helpfulness: 'Error during evaluation',
              deflection: 'Error during evaluation',
              contextAwareness: 'Error during evaluation',
              sourceGrounding: 'Error during evaluation',
              conversational: 'Error during evaluation',
            },
            overall: 0,
            flags: [`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`],
            response: '',
          });
        }
      }
    } else {
      // Single-turn scenario
      completed++;
      options.onProgress?.(completed, totalEvals, scenario.id);

      try {
        const { reply } = await chat(scenario.question, [], {
          agent: scenario.agent,
          financialContext,
        });

        const evalResult = await evaluateResponse(
          scenario.question,
          reply,
          profile.summary,
          scenario.rubric,
          agentBrief
        );

        results.push({
          id: scenario.id,
          category: scenario.category,
          agent: scenario.agent,
          profile: scenario.profile,
          question: scenario.question,
          scores: evalResult.scores,
          justifications: evalResult.justifications,
          overall: evalResult.overall,
          flags: evalResult.flags,
          response: reply,
        });
      } catch (error) {
        console.error(`Error in ${scenario.id}:`, error);
        results.push({
          id: scenario.id,
          category: scenario.category,
          agent: scenario.agent,
          profile: scenario.profile,
          question: scenario.question,
          scores: { relevance: 0, helpfulness: 0, deflection: 0, contextAwareness: 0, sourceGrounding: 0, conversational: 0 },
          justifications: {
            relevance: 'Error during evaluation',
            helpfulness: 'Error during evaluation',
            deflection: 'Error during evaluation',
            contextAwareness: 'Error during evaluation',
            sourceGrounding: 'Error during evaluation',
            conversational: 'Error during evaluation',
          },
          overall: 0,
          flags: [`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`],
          response: '',
        });
      }
    }
  }

  return results;
}
