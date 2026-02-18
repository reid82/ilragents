import { describe, it, expect } from 'vitest';
import { calculateFISO } from './fiso-calculator';
import type { FISOInput } from './fiso-calculator';

describe('calculateFISO', () => {
  const baseInput: FISOInput = {
    purchasePrice: 500000,
    purchaseCosts: 25000,
    holdingCosts: 15000,
    strategyCosts: 50000,
    sellingCosts: 20000,
    endValue: 700000,
    ownerFundsContributed: 150000,
    projectDurationMonths: 6,
  };

  it('calculates profit correctly', () => {
    const result = calculateFISO(baseInput);
    // Profit = 700000 - (500000 + 25000 + 15000 + 50000 + 20000) = 90000
    expect(result.profit).toBe(90000);
  });

  it('calculates total costs correctly', () => {
    const result = calculateFISO(baseInput);
    expect(result.totalCosts).toBe(610000);
  });

  it('calculates cash on cash return correctly', () => {
    const result = calculateFISO(baseInput);
    // CoC = (90000 / 150000) * 100 = 60%
    expect(result.cashOnCashReturn).toBeCloseTo(60, 1);
  });

  it('calculates profit on development cost correctly', () => {
    const result = calculateFISO(baseInput);
    // % = 90000 / (610000 - 20000) * 100 = 90000 / 590000 * 100 = 15.25%
    expect(result.profitOnDevelopmentCost).toBeCloseTo(15.25, 1);
  });

  it('calculates per annum correctly for 6 month project', () => {
    const result = calculateFISO(baseInput);
    // profitPerAnnum = 15.25% / 0.5 years = 30.5% p.a.
    expect(result.profitPerAnnum).toBeCloseTo(30.5, 0);
  });

  it('flags as viable when profit is positive', () => {
    const result = calculateFISO(baseInput);
    expect(result.isViable).toBe(true);
  });

  it('flags as not viable when profit is negative', () => {
    const result = calculateFISO({ ...baseInput, endValue: 580000 });
    expect(result.isViable).toBe(false);
  });

  it('includes viability note for commercial threshold', () => {
    const result = calculateFISO(baseInput);
    // 15.25% is below 20% commercial threshold
    expect(result.viabilityNotes.some(n => n.includes('20%'))).toBe(true);
  });

  it('handles GST for commercial projects', () => {
    const input: FISOInput = { ...baseInput, gst: 60000 };
    const result = calculateFISO(input);
    // developmentCostBase = 610000 - 20000 - 60000 = 530000
    // % = 90000 / 530000 = 16.98%
    expect(result.profitOnDevelopmentCost).toBeCloseTo(16.98, 1);
  });
});
