import { describe, it, expect } from 'vitest';
import { AGENTS, getAgentById, getAgentsByTable, getFacilitator } from './agents';

describe('agents', () => {
  it('has 10 agents defined', () => {
    expect(AGENTS).toHaveLength(10);
  });

  it('getAgentById returns correct agent', () => {
    const agent = getAgentById('baseline-ben');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('Baseline Ben');
  });

  it('getAgentById returns undefined for unknown agent', () => {
    expect(getAgentById('nonexistent')).toBeUndefined();
  });

  it('getAgentsByTable returns strategy agents', () => {
    const strategy = getAgentsByTable('strategy');
    expect(strategy).toHaveLength(5);
    expect(strategy.every((a) => a.table === 'strategy')).toBe(true);
  });

  it('getAgentsByTable returns portfolio agents', () => {
    const portfolio = getAgentsByTable('portfolio');
    expect(portfolio).toHaveLength(4);
    expect(portfolio.every((a) => a.table === 'portfolio')).toBe(true);
  });

  it('getFacilitator returns Baseline Ben', () => {
    const facilitator = getFacilitator();
    expect(facilitator.id).toBe('baseline-ben');
    expect(facilitator.table).toBe('facilitator');
    expect(facilitator.name).toBe('Baseline Ben');
  });

  it('all agents have required fields', () => {
    for (const agent of AGENTS) {
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.domain).toBeTruthy();
      expect(agent.description).toBeTruthy();
      expect(agent.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(agent.ragAgents.length).toBeGreaterThan(0);
    }
  });
});
