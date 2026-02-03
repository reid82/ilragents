import { describe, it, expect } from 'vitest';
import { parseReferrals, SPECIALIST_TEAMS } from './specialists';

describe('SPECIALIST_TEAMS', () => {
  it('has four specialist teams', () => {
    expect(Object.keys(SPECIALIST_TEAMS)).toHaveLength(4);
  });

  it('all teams have required fields', () => {
    for (const team of Object.values(SPECIALIST_TEAMS)) {
      expect(team.key).toBeTruthy();
      expect(team.name).toBeTruthy();
      expect(team.email).toContain('@');
      expect(team.description).toBeTruthy();
    }
  });
});

describe('parseReferrals', () => {
  it('returns clean content and empty array when no referrals', () => {
    const [content, referrals] = parseReferrals('Just a normal response.');
    expect(content).toBe('Just a normal response.');
    expect(referrals).toHaveLength(0);
  });

  it('parses a single referral block', () => {
    const input = 'Here is my advice.\n\nSources: 1, 3\n\n<!--REFERRAL:{"team":"finance","reason":"You need a broker","suggestedSubject":"Loan pre-approval"}-->';
    const [content, referrals] = parseReferrals(input);
    expect(content).toBe('Here is my advice.\n\nSources: 1, 3');
    expect(referrals).toHaveLength(1);
    expect(referrals[0].team).toBe('finance');
    expect(referrals[0].reason).toBe('You need a broker');
    expect(referrals[0].suggestedSubject).toBe('Loan pre-approval');
  });

  it('parses multiple referral blocks', () => {
    const input = 'Advice here.\n<!--REFERRAL:{"team":"legal","reason":"Need legal review","suggestedSubject":"Contract review"}-->\n<!--REFERRAL:{"team":"accounting","reason":"Tax implications","suggestedSubject":"Tax on subdivision"}-->';
    const [content, referrals] = parseReferrals(input);
    expect(content).toBe('Advice here.');
    expect(referrals).toHaveLength(2);
    expect(referrals[0].team).toBe('legal');
    expect(referrals[1].team).toBe('accounting');
  });

  it('handles malformed JSON gracefully', () => {
    const input = 'Advice.\n<!--REFERRAL:{broken json}-->\n<!--REFERRAL:{"team":"finance","reason":"Valid","suggestedSubject":"Test"}-->';
    const [content, referrals] = parseReferrals(input);
    expect(content).toBe('Advice.');
    expect(referrals).toHaveLength(1);
    expect(referrals[0].team).toBe('finance');
  });

  it('handles empty string', () => {
    const [content, referrals] = parseReferrals('');
    expect(content).toBe('');
    expect(referrals).toHaveLength(0);
  });
});
