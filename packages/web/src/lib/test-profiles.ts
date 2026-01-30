import type { FinancialPosition } from './stores/financial-store';

export interface TestProfile {
  id: string;
  label: string;
  description: string;
  position: FinancialPosition;
}

export const TEST_PROFILES: TestProfile[] = [
  {
    id: 'first-timer',
    label: 'Sarah - First Timer',
    description: 'No properties, starting from scratch',
    position: {
      income: 85000,
      expenses: 55000,
      existingProperties: 0,
      equity: 0,
      borrowingCapacity: 450000,
      investmentGoal: 'Buy first investment property within 12 months',
      timeHorizon: '10+ years',
      riskTolerance: 'moderate',
      summary:
        'First-time investor earning $85k/year with $450k borrowing capacity. No existing properties or equity. Looking to buy first investment property within 12 months. Moderate risk tolerance with a long-term horizon of 10+ years.',
    },
  },
  {
    id: 'growing-portfolio',
    label: 'James - Growing Portfolio',
    description: '2 properties, $180k equity, scaling up',
    position: {
      income: 130000,
      expenses: 78000,
      existingProperties: 2,
      equity: 180000,
      borrowingCapacity: 720000,
      investmentGoal: 'Build to 5 properties in next 3 years using equity',
      timeHorizon: '5-10 years',
      riskTolerance: 'moderate-high',
      summary:
        'Experienced investor earning $130k/year with 2 existing properties and $180k usable equity. Borrowing capacity of $720k. Goal is to scale to 5 properties in the next 3 years using equity recycling. Moderate-high risk tolerance.',
    },
  },
  {
    id: 'high-equity',
    label: 'Karen - High Equity',
    description: '4 properties, $620k equity, looking at development',
    position: {
      income: 175000,
      expenses: 95000,
      existingProperties: 4,
      equity: 620000,
      borrowingCapacity: 1200000,
      investmentGoal: 'Explore subdivision and development opportunities',
      timeHorizon: '3-5 years',
      riskTolerance: 'high',
      summary:
        'Advanced investor earning $175k/year with 4 properties and $620k equity. Strong borrowing capacity of $1.2M. Interested in subdivision and development to accelerate wealth. High risk tolerance with 3-5 year active strategy.',
    },
  },
  {
    id: 'cash-flow-focused',
    label: 'Mike - Cash Flow Focused',
    description: '1 property, wants passive income',
    position: {
      income: 95000,
      expenses: 62000,
      existingProperties: 1,
      equity: 85000,
      borrowingCapacity: 520000,
      investmentGoal: 'Build passive rental income to replace salary within 15 years',
      timeHorizon: '15 years',
      riskTolerance: 'low-moderate',
      summary:
        'Income-focused investor earning $95k/year with 1 property and $85k equity. Borrowing capacity of $520k. Primary goal is building passive rental income to replace salary within 15 years. Conservative approach - prefers yield over capital growth.',
    },
  },
  {
    id: 'asset-protection',
    label: 'Linda - Structure & Protection',
    description: '3 properties, needs trust/company structures',
    position: {
      income: 210000,
      expenses: 120000,
      existingProperties: 3,
      equity: 450000,
      borrowingCapacity: 950000,
      investmentGoal: 'Restructure holdings into trusts and optimise tax position',
      timeHorizon: '5-10 years',
      riskTolerance: 'moderate',
      summary:
        'High-income investor earning $210k/year with 3 properties held in personal names. $450k equity, $950k borrowing capacity. Needs to restructure into trusts/companies for asset protection and tax optimisation. Moderate risk tolerance.',
    },
  },
];
