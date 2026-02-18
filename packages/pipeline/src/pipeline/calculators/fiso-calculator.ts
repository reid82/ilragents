export interface FISOInput {
  purchasePrice: number;
  purchaseCosts: number;
  holdingCosts: number;
  strategyCosts: number;
  sellingCosts: number;
  endValue: number;
  ownerFundsContributed: number;
  projectDurationMonths: number;
  gst?: number;
}

export interface FISOOutput {
  profit: number;
  cashOnCashReturn: number;
  profitOnDevelopmentCost: number;
  profitPerAnnum: number;
  totalCosts: number;
  isViable: boolean;
  viabilityNotes: string[];
}

export function calculateFISO(input: FISOInput): FISOOutput {
  const totalCosts =
    input.purchasePrice +
    input.purchaseCosts +
    input.holdingCosts +
    input.strategyCosts +
    input.sellingCosts;

  const profit = input.endValue - totalCosts;

  const cashOnCashReturn =
    input.ownerFundsContributed > 0
      ? (profit / input.ownerFundsContributed) * 100
      : 0;

  const developmentCostBase = totalCosts - input.sellingCosts - (input.gst || 0);
  const profitOnDevelopmentCost =
    developmentCostBase > 0 ? (profit / developmentCostBase) * 100 : 0;

  const projectYears = input.projectDurationMonths / 12;
  const profitPerAnnum =
    projectYears > 0 ? profitOnDevelopmentCost / projectYears : 0;

  const viabilityNotes: string[] = [];

  if (profit <= 0) {
    viabilityNotes.push('Deal produces a loss. Not viable.');
  }
  if (profitOnDevelopmentCost < 20) {
    viabilityNotes.push(
      `Profit on development cost is ${profitOnDevelopmentCost.toFixed(1)}% - below the 20% minimum threshold for commercial/multi-unit projects.`
    );
  }
  if (cashOnCashReturn < 15) {
    viabilityNotes.push(
      `Cash on cash return is ${cashOnCashReturn.toFixed(1)}% - relatively low return on your cash invested.`
    );
  }

  return {
    profit,
    cashOnCashReturn,
    profitOnDevelopmentCost,
    profitPerAnnum,
    totalCosts,
    isViable: profit > 0,
    viabilityNotes,
  };
}
