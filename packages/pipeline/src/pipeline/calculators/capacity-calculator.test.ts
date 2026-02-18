import { describe, it, expect } from 'vitest';
import { calculateCapacity } from './capacity-calculator';

describe('calculateCapacity', () => {
  const baseInput = {
    totalPropertyValue: 1200000,
    totalLoans: 600000,
    cashSavings: 80000,
    annualIncome: 150000,
    existingLoanRepayments: 600000,
    bufferReserve: 20000,
  };

  it('calculates total equity correctly', () => {
    const result = calculateCapacity(baseInput);
    expect(result.totalEquity).toBe(600000);
  });

  it('calculates accessible equity at 80%', () => {
    const result = calculateCapacity(baseInput);
    // (1200000 * 0.8) - 600000 = 360000
    expect(result.accessibleEquity).toBe(360000);
  });

  it('calculates available funds correctly', () => {
    const result = calculateCapacity(baseInput);
    // 360000 + 80000 - 20000 = 420000
    expect(result.availableFunds).toBe(420000);
  });

  it('calculates borrowing capacity correctly', () => {
    const result = calculateCapacity(baseInput);
    // (150000 * 6) - 600000 = 300000
    expect(result.borrowingCapacity).toBe(300000);
  });

  it('correctly assesses if user can afford a deal', () => {
    const result = calculateCapacity(baseInput);
    // maxPurchasePrice = min(420000/0.25, 300000) = min(1680000, 300000) = 300000
    expect(result.canAffordDeal(300000)).toBe(true);
    expect(result.canAffordDeal(400000)).toBe(false);
  });
});
