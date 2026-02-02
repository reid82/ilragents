import { describe, it, expect } from 'vitest';
import { AGENTS, getAgentById, getAdvisors, getFacilitator } from './agents';

describe('agents', () => {
  it('has 4 agents defined', () => {
    expect(AGENTS).toHaveLength(4);
  });

  it('getAgentById returns correct agent', () => {
    const agent = getAgentById('baseline-ben');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('Baseline Ben');
  });

  it('getAgentById returns undefined for unknown agent', () => {
    expect(getAgentById('nonexistent')).toBeUndefined();
  });

  it('getAdvisors returns non-facilitator agents', () => {
    const advisors = getAdvisors();
    expect(advisors).toHaveLength(3);
    expect(advisors.every((a) => !a.isFacilitator)).toBe(true);
  });

  it('getFacilitator returns Baseline Ben', () => {
    const facilitator = getFacilitator();
    expect(facilitator.id).toBe('baseline-ben');
    expect(facilitator.isFacilitator).toBe(true);
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
      expect(agent.contextLimit).toBeGreaterThan(0);
    }
  });

  it('Investor Coach maps to 5 RAG agents', () => {
    const coach = getAgentById('investor-coach');
    expect(coach).toBeDefined();
    expect(coach!.ragAgents).toHaveLength(5);
  });

  it('Finance & Legal Team maps to 3 RAG agents', () => {
    const specialist = getAgentById('deal-specialist');
    expect(specialist).toBeDefined();
    expect(specialist!.ragAgents).toHaveLength(3);
  });
});
