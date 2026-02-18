import { calculateCashflow } from './cashflow-calculator';
import type { CashflowInput, CashflowOutput } from './cashflow-calculator';

export interface SensitivityOutput {
  rateStress: {
    currentRate: number;
    plus1: CashflowOutput;
    plus2: CashflowOutput;
    plus3: CashflowOutput;
    breakEvenRate: number;
  };
  rentStress: {
    currentRent: number;
    minus10pct: CashflowOutput;
    minus20pct: CashflowOutput;
    breakEvenRent: number;
  };
  vacancyStress: {
    weeksVacancyToBreakEven: number;
    at4Weeks: CashflowOutput;
    at8Weeks: CashflowOutput;
    at12Weeks: CashflowOutput;
  };
  combinedStress: CashflowOutput;
  resilience: 'strong' | 'moderate' | 'fragile';
  resilienceNotes: string[];
}

function withRate(input: CashflowInput, newRate: number): CashflowOutput {
  return calculateCashflow({ ...input, mortgageRate: newRate });
}

function withRent(input: CashflowInput, newWeeklyRent: number): CashflowOutput {
  return calculateCashflow({ ...input, weeklyRent: newWeeklyRent });
}

function withVacancy(input: CashflowInput, vacantWeeks: number): CashflowOutput {
  const occupiedWeeks = 52 - vacantWeeks;
  const adjustedRent = (input.weeklyRent * occupiedWeeks) / 52;
  return calculateCashflow({ ...input, weeklyRent: adjustedRent });
}

function findBreakEvenRate(input: CashflowInput): number {
  let low = input.mortgageRate;
  let high = input.mortgageRate + 10;
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const cf = calculateCashflow({ ...input, mortgageRate: mid });
    if (cf.netAnnualCashflow > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return Math.round(((low + high) / 2) * 100) / 100;
}

function findVacancyBreakEven(input: CashflowInput): number {
  const baseline = calculateCashflow(input);
  if (baseline.netAnnualCashflow <= 0) return 0;

  for (let weeks = 1; weeks <= 52; weeks++) {
    const cf = withVacancy(input, weeks);
    if (cf.netAnnualCashflow <= 0) return weeks;
  }
  return 52;
}

export function runSensitivityAnalysis(input: CashflowInput): SensitivityOutput {
  const baseline = calculateCashflow(input);

  const rateStress = {
    currentRate: input.mortgageRate,
    plus1: withRate(input, input.mortgageRate + 1),
    plus2: withRate(input, input.mortgageRate + 2),
    plus3: withRate(input, input.mortgageRate + 3),
    breakEvenRate: findBreakEvenRate(input),
  };

  const rentStress = {
    currentRent: input.weeklyRent,
    minus10pct: withRent(input, input.weeklyRent * 0.9),
    minus20pct: withRent(input, input.weeklyRent * 0.8),
    breakEvenRent: baseline.breakEvenRent,
  };

  const vacancyStress = {
    weeksVacancyToBreakEven: findVacancyBreakEven(input),
    at4Weeks: withVacancy(input, 4),
    at8Weeks: withVacancy(input, 8),
    at12Weeks: withVacancy(input, 12),
  };

  const combinedStress = calculateCashflow({
    ...input,
    mortgageRate: input.mortgageRate + 2,
    weeklyRent: input.weeklyRent * 0.9,
  });

  const resilienceNotes: string[] = [];
  let failCount = 0;

  if (rateStress.plus2.netAnnualCashflow < 0) {
    failCount++;
    resilienceNotes.push('Cashflow turns negative with a 2% rate increase.');
  }
  if (rentStress.minus10pct.netAnnualCashflow < 0) {
    failCount++;
    resilienceNotes.push('Cashflow turns negative with a 10% rent reduction.');
  }
  if (vacancyStress.weeksVacancyToBreakEven < 4) {
    failCount++;
    resilienceNotes.push(`Only ${vacancyStress.weeksVacancyToBreakEven} weeks of vacancy wipes out annual cashflow.`);
  }
  if (combinedStress.netAnnualCashflow < -5000) {
    failCount++;
    resilienceNotes.push('Combined stress (rate +2%, rent -10%) produces significant losses.');
  }

  const resilience: 'strong' | 'moderate' | 'fragile' =
    failCount === 0 ? 'strong' : failCount <= 2 ? 'moderate' : 'fragile';

  if (resilience === 'strong') {
    resilienceNotes.push('Deal survives all standard stress tests. Solid fundamentals.');
  }

  return {
    rateStress,
    rentStress,
    vacancyStress,
    combinedStress,
    resilience,
    resilienceNotes,
  };
}
