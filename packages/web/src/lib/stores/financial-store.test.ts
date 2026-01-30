import { describe, it, expect, beforeEach } from 'vitest';
import { useClientProfileStore } from './financial-store';
import type { ClientProfile } from './financial-store';

const makeProfile = (overrides: Partial<ClientProfile> = {}): ClientProfile => ({
  personal: { firstName: 'Test', state: 'VIC' },
  employment: { grossAnnualIncome: 150000, employmentType: 'payg-fulltime' },
  financial: {},
  portfolio: { investmentProperties: [] },
  goals: { primaryGoal: 'first-property', timeHorizon: '3-5-years', riskTolerance: 'moderate' },
  summary: 'Earns $150k, owns 2 properties',
  agentBriefs: { baselineBen: '', finderFred: '', investorCoach: '', dealSpecialist: '' },
  completenessScore: 50,
  dataGaps: [],
  collectedAt: new Date().toISOString(),
  ...overrides,
});

describe('client-profile-store', () => {
  beforeEach(() => {
    useClientProfileStore.getState().clear();
  });

  it('starts with null profile', () => {
    expect(useClientProfileStore.getState().profile).toBeNull();
  });

  it('starts with null rawTranscript', () => {
    expect(useClientProfileStore.getState().rawTranscript).toBeNull();
  });

  it('sets client profile', () => {
    const profile = makeProfile({ summary: 'Earns $150k, owns 2 properties' });
    useClientProfileStore.getState().setProfile(profile);
    const stored = useClientProfileStore.getState().profile;
    expect(stored?.employment.grossAnnualIncome).toBe(150000);
    expect(stored?.summary).toContain('150k');
  });

  it('sets raw transcript', () => {
    useClientProfileStore.getState().setRawTranscript('Client: Hello\nBen: Welcome');
    expect(useClientProfileStore.getState().rawTranscript).toContain('Client: Hello');
  });

  it('clears state', () => {
    useClientProfileStore.getState().setProfile(makeProfile());
    useClientProfileStore.getState().setRawTranscript('some transcript');
    useClientProfileStore.getState().clear();
    expect(useClientProfileStore.getState().profile).toBeNull();
    expect(useClientProfileStore.getState().rawTranscript).toBeNull();
  });
});
