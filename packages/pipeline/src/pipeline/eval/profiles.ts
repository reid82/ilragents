/**
 * Financial profiles for eval scenarios.
 * Mirrors the web test-profiles but as plain pipeline-level data.
 */

export interface EvalProfile {
  id: string;
  label: string;
  summary: string;
}

export const EVAL_PROFILES: EvalProfile[] = [
  {
    id: 'sarah-first-timer',
    label: 'Sarah - First Timer',
    summary:
      'First-time investor earning $85k/year with $450k borrowing capacity. No existing properties or equity. Looking to buy first investment property within 12 months. Moderate risk tolerance with a long-term horizon of 10+ years.',
  },
  {
    id: 'james-growing-portfolio',
    label: 'James - Growing Portfolio',
    summary:
      'Experienced investor earning $130k/year with 2 existing properties and $180k usable equity. Borrowing capacity of $720k. Goal is to scale to 5 properties in the next 3 years using equity recycling. Moderate-high risk tolerance.',
  },
  {
    id: 'karen-high-equity',
    label: 'Karen - High Equity',
    summary:
      'Advanced investor earning $175k/year with 4 properties and $620k equity. Strong borrowing capacity of $1.2M. Interested in subdivision and development to accelerate wealth. High risk tolerance with 3-5 year active strategy.',
  },
  {
    id: 'mike-cash-flow',
    label: 'Mike - Cash Flow Focused',
    summary:
      'Income-focused investor earning $95k/year with 1 property and $85k equity. Borrowing capacity of $520k. Primary goal is building passive rental income to replace salary within 15 years. Conservative approach - prefers yield over capital growth.',
  },
  {
    id: 'linda-asset-protection',
    label: 'Linda - Structure & Protection',
    summary:
      'High-income investor earning $210k/year with 3 properties held in personal names. $450k equity, $950k borrowing capacity. Needs to restructure into trusts/companies for asset protection and tax optimisation. Moderate risk tolerance.',
  },
];

export function getProfile(id: string): EvalProfile | undefined {
  return EVAL_PROFILES.find((p) => p.id === id);
}
