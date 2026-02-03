export interface SpecialistTeam {
  key: string;
  name: string;
  email: string;
  phone?: string;
  description: string;
}

export const SPECIALIST_TEAMS: Record<string, SpecialistTeam> = {
  finance: {
    key: 'finance',
    name: 'Wizdom Finance Team',
    email: 'loans@wizdom.com.au',
    description: 'Professional finance and lending',
  },
  accounting: {
    key: 'accounting',
    name: 'Wizdom Accounting Team',
    email: 'accounting@wizdom.com.au',
    phone: '+61 2 9011 6687',
    description: 'Tax strategy and accounting',
  },
  'asset-protection': {
    key: 'asset-protection',
    name: 'IPS Asset Protection',
    email: 'info@investorpacificstructures.com.au',
    phone: '1300 411 653',
    description: 'Asset protection structures',
  },
  legal: {
    key: 'legal',
    name: 'Pacific Law',
    email: 'info@pacificlaw.com.au',
    phone: '1300 151 651',
    description: 'Property and investment law',
  },
};

export interface Referral {
  team: string;
  reason: string;
  suggestedSubject: string;
}

/**
 * Parse <!--REFERRAL:{...}--> blocks from a response string.
 * Returns [cleanedContent, referrals[]].
 */
export function parseReferrals(content: string): [string, Referral[]] {
  const referrals: Referral[] = [];
  const cleaned = content.replace(
    /<!--REFERRAL:(.*?)-->/g,
    (_, json) => {
      try {
        referrals.push(JSON.parse(json));
      } catch {
        // skip malformed referral blocks
      }
      return '';
    }
  );
  return [cleaned.trim(), referrals];
}
