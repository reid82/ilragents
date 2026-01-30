import { describe, it, expect, beforeEach } from 'vitest';
import { useFinancialStore } from './financial-store';

describe('financial-store', () => {
  beforeEach(() => {
    useFinancialStore.getState().clear();
  });

  it('starts with null position', () => {
    expect(useFinancialStore.getState().position).toBeNull();
  });

  it('starts with null rawTranscript', () => {
    expect(useFinancialStore.getState().rawTranscript).toBeNull();
  });

  it('sets financial position', () => {
    useFinancialStore.getState().setPosition({
      income: 150000,
      existingProperties: 2,
      summary: 'Earns $150k, owns 2 properties',
    });
    const pos = useFinancialStore.getState().position;
    expect(pos?.income).toBe(150000);
    expect(pos?.existingProperties).toBe(2);
    expect(pos?.summary).toContain('150k');
  });

  it('sets raw transcript', () => {
    useFinancialStore.getState().setRawTranscript('Client: Hello\nBen: Welcome');
    expect(useFinancialStore.getState().rawTranscript).toContain('Client: Hello');
  });

  it('clears state', () => {
    useFinancialStore.getState().setPosition({
      income: 100000,
      summary: 'test',
    });
    useFinancialStore.getState().setRawTranscript('some transcript');
    useFinancialStore.getState().clear();
    expect(useFinancialStore.getState().position).toBeNull();
    expect(useFinancialStore.getState().rawTranscript).toBeNull();
  });
});
