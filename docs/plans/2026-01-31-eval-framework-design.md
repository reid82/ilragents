# Agent Evaluation Framework

## Overview

Pipeline-level test runner that simulates fictional users talking to agents, evaluates responses via a separate LLM (Sonnet), and produces a scored rubric report.

## Architecture

CLI script at `packages/pipeline/src/pipeline/eval/` that:

1. Loads test scenarios (fictional user profiles + questions)
2. Calls `chat()` from the pipeline directly for each scenario
3. Sends each response to Sonnet via OpenRouter with a scoring rubric
4. Outputs a scored report to stdout and optionally to JSON

## Scoring Rubric (each 1-5)

- **Relevance**: Did it answer the actual question asked?
- **Helpfulness**: Was the advice actionable and specific?
- **Deflection**: Did it avoid unnecessary "talk to someone else" responses? (5 = no deflection)
- **Context awareness**: Did it use the financial profile appropriately without being dominated by it?
- **Source grounding**: Did it draw on RAG materials rather than hallucinating?

## Scenario Categories

1. **Cross-domain** - Ask agent something outside its RAG tags but within property investment
2. **Profile-mismatch** - Profile focused on one goal, question about something else
3. **Multi-turn bleed** - Two questions on different topics, test if first answer locks context
4. **Baseline quality** - Straightforward in-domain questions (control group, should score 4+)

~20-30 scenarios total.

## File Structure

```
packages/pipeline/src/pipeline/eval/
  scenarios.json    - all test scenarios
  profiles.ts       - reusable financial profiles
  runner.ts         - orchestrates: load scenarios, call chat(), call evaluator
  evaluator.ts      - sends response + rubric to Sonnet, parses scores
  report.ts         - formats output (table to stdout, JSON to file)
  index.ts          - CLI entry point
```

## CLI Usage

```bash
npx tsx packages/pipeline/src/pipeline/eval/index.ts
npx tsx packages/pipeline/src/pipeline/eval/index.ts --agent "Investor Coach"
npx tsx packages/pipeline/src/pipeline/eval/index.ts --json eval-report.json
```

## Evaluator

- Model: Claude Sonnet via OpenRouter (avoids self-grading bias)
- Input: question, response, profile, rubric criteria
- Output: structured JSON with 1-5 scores + one-line justifications per dimension
- Failing threshold: any dimension below 3 gets flagged

## Report

- Table per agent with average scores across dimensions
- Detailed breakdown per scenario
- Failing scenarios highlighted
- Optional JSON output for tracking over time
