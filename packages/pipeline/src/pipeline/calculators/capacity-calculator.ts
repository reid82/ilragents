export interface CapacityInput {
  totalPropertyValue: number;
  totalLoans: number;
  cashSavings: number;
  annualIncome: number;
  existingLoanRepayments: number;
  bufferReserve: number;
}

export interface CapacityOutput {
  totalEquity: number;
  accessibleEquity: number;
  availableFunds: number;
  borrowingCapacity: number;
  maxPurchasePrice: number;
  canAffordDeal: (purchasePrice: number) => boolean;
}

export function calculateCapacity(input: CapacityInput): CapacityOutput {
  const totalEquity = input.totalPropertyValue - input.totalLoans;

  // Accessible equity: what the bank will lend against (80% LVR)
  const maxLendableValue = input.totalPropertyValue * 0.8;
  const accessibleEquity = Math.max(0, maxLendableValue - input.totalLoans);

  const availableFunds = accessibleEquity + input.cashSavings - input.bufferReserve;

  // Rough serviceability: income x 6 minus existing loan commitments
  const borrowingCapacity = Math.max(0, input.annualIncome * 6 - input.existingLoanRepayments);

  // Max purchase price is the lower of available funds (for deposit + costs)
  // and borrowing capacity. Rough guide: available funds covers 25% (20% deposit + 5% costs)
  const maxFromFunds = availableFunds / 0.25;
  const maxPurchasePrice = Math.min(maxFromFunds, borrowingCapacity);

  return {
    totalEquity,
    accessibleEquity,
    availableFunds,
    borrowingCapacity,
    maxPurchasePrice: Math.round(maxPurchasePrice),
    canAffordDeal: (purchasePrice: number) => purchasePrice <= maxPurchasePrice,
  };
}
