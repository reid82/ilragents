import { describe, it, expect } from 'vitest';
import { runSensitivityAnalysis } from './sensitivity-engine';
import type { CashflowInput } from './cashflow-calculator';

describe('runSensitivityAnalysis', () => {
  const baseInput: CashflowInput = {
    purchasePrice: 500000,
    weeklyRent: 750,
    mortgageRate: 6.0,
    lvr: 80,
    councilRates: 2000,
    insurance: 1500,
    managementFee: 8,
    maintenanceAllowance: 1,
  };

  it('stress tests interest rate increases', () => {
    const result = runSensitivityAnalysis(baseInput);
    expect(result.rateStress.currentRate).toBe(6.0);
    expect(result.rateStress.plus1.netAnnualCashflow).toBeLessThan(
      result.rateStress.plus1.grossRentalIncome
    );
    expect(result.rateStress.plus2.netAnnualCashflow).toBeLessThan(
      result.rateStress.plus1.netAnnualCashflow
    );
    expect(result.rateStress.plus3.netAnnualCashflow).toBeLessThan(
      result.rateStress.plus2.netAnnualCashflow
    );
  });

  it('calculates break-even rate', () => {
    const result = runSensitivityAnalysis(baseInput);
    expect(result.rateStress.breakEvenRate).toBeGreaterThan(6.0);
  });

  it('stress tests rent reductions', () => {
    const result = runSensitivityAnalysis(baseInput);
    expect(result.rentStress.minus10pct.grossRentalIncome).toBeLessThan(
      result.rentStress.currentRent * 52
    );
    expect(result.rentStress.minus20pct.grossRentalIncome).toBeLessThan(
      result.rentStress.minus10pct.grossRentalIncome
    );
  });

  it('stress tests vacancy periods', () => {
    const result = runSensitivityAnalysis(baseInput);
    expect(result.vacancyStress.weeksVacancyToBreakEven).toBeGreaterThan(0);
    expect(result.vacancyStress.at4Weeks.netAnnualCashflow).toBeLessThan(
      result.vacancyStress.at4Weeks.grossRentalIncome
    );
  });

  it('runs combined stress test', () => {
    const result = runSensitivityAnalysis(baseInput);
    expect(result.combinedStress.netAnnualCashflow).toBeLessThan(
      result.rateStress.plus2.netAnnualCashflow
    );
  });

  it('classifies resilience', () => {
    const result = runSensitivityAnalysis(baseInput);
    expect(['strong', 'moderate', 'fragile']).toContain(result.resilience);
  });
});
