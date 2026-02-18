import { describe, it, expect } from 'vitest';
import { calculateCashflow } from './cashflow-calculator';
import type { CashflowInput } from './cashflow-calculator';

describe('calculateCashflow', () => {
  const baseInput: CashflowInput = {
    purchasePrice: 500000,
    weeklyRent: 500,
    mortgageRate: 6.5,
    lvr: 80,
    councilRates: 2000,
    insurance: 1500,
    managementFee: 8,
    maintenanceAllowance: 1,
  };

  it('calculates gross rental income correctly', () => {
    const result = calculateCashflow(baseInput);
    // 500 * 52 = 26000
    expect(result.grossRentalIncome).toBe(26000);
  });

  it('calculates gross yield correctly', () => {
    const result = calculateCashflow(baseInput);
    // 26000 / 500000 * 100 = 5.2%
    expect(result.grossYield).toBeCloseTo(5.2, 1);
  });

  it('calculates total holding costs correctly', () => {
    const result = calculateCashflow(baseInput);
    // Loan = 500000 * 0.80 = 400000. Interest = 400000 * 0.065 = 26000
    // Total holding = 26000 + 2000 + 1500 + (26000 * 0.08) + (500000 * 0.01) = 26000 + 2000 + 1500 + 2080 + 5000 = 36580
    expect(result.totalHoldingCosts).toBeCloseTo(36580, 0);
  });

  it('calculates net annual cashflow', () => {
    const result = calculateCashflow(baseInput);
    // 26000 - 36580 = -10580
    expect(result.netAnnualCashflow).toBeCloseTo(-10580, 0);
  });

  it('identifies negative cashflow correctly', () => {
    const result = calculateCashflow(baseInput);
    expect(result.isPositive).toBe(false);
  });

  it('identifies positive cashflow when rent is high enough', () => {
    const result = calculateCashflow({ ...baseInput, weeklyRent: 800 });
    expect(result.isPositive).toBe(true);
  });

  it('calculates break-even rent', () => {
    const result = calculateCashflow(baseInput);
    expect(result.breakEvenRent).toBeGreaterThan(500);
    expect(result.breakEvenRent).toBeLessThan(800);
  });

  it('includes body corp fees when provided', () => {
    const withBC = calculateCashflow({ ...baseInput, bodyCorpFees: 3000 });
    const without = calculateCashflow(baseInput);
    expect(withBC.totalHoldingCosts).toBe(without.totalHoldingCosts + 3000);
  });

  it('handles multiple doors', () => {
    const result = calculateCashflow({ ...baseInput, numberOfDoors: 2 });
    expect(result.grossRentalIncome).toBe(52000); // 500 * 52 * 2
  });
});
