export interface CashflowInput {
  purchasePrice: number;
  weeklyRent: number;
  mortgageRate: number;
  lvr: number;
  councilRates: number;
  insurance: number;
  managementFee: number;
  maintenanceAllowance: number;
  bodyCorpFees?: number;
  waterSewer?: number;
  otherCosts?: number;
  numberOfDoors?: number;
}

export interface CashflowOutput {
  grossRentalIncome: number;
  totalHoldingCosts: number;
  netAnnualCashflow: number;
  grossYield: number;
  netYield: number;
  weeklyNetCashflow: number;
  isPositive: boolean;
  breakEvenRent: number;
}

export function calculateCashflow(input: CashflowInput): CashflowOutput {
  const doors = input.numberOfDoors || 1;
  const grossRentalIncome = input.weeklyRent * 52 * doors;

  const loanAmount = input.purchasePrice * (input.lvr / 100);
  const annualMortgageInterest = loanAmount * (input.mortgageRate / 100);
  const annualManagement = grossRentalIncome * (input.managementFee / 100);
  const annualMaintenance = input.purchasePrice * (input.maintenanceAllowance / 100);

  const totalHoldingCosts =
    annualMortgageInterest +
    input.councilRates +
    input.insurance +
    annualManagement +
    annualMaintenance +
    (input.bodyCorpFees || 0) +
    (input.waterSewer || 0) +
    (input.otherCosts || 0);

  const netAnnualCashflow = grossRentalIncome - totalHoldingCosts;
  const grossYield = (grossRentalIncome / input.purchasePrice) * 100;
  const netYield = (netAnnualCashflow / input.purchasePrice) * 100;
  const weeklyNetCashflow = netAnnualCashflow / 52;

  // Break-even rent: solve for weeklyRent where net cashflow = 0
  const fixedCosts =
    annualMortgageInterest +
    input.councilRates +
    input.insurance +
    annualMaintenance +
    (input.bodyCorpFees || 0) +
    (input.waterSewer || 0) +
    (input.otherCosts || 0);
  const rentMultiplier = 52 * doors * (1 - input.managementFee / 100);
  const breakEvenRent = rentMultiplier > 0 ? fixedCosts / rentMultiplier : 0;

  return {
    grossRentalIncome,
    totalHoldingCosts,
    netAnnualCashflow,
    grossYield,
    netYield,
    weeklyNetCashflow,
    isPositive: netAnnualCashflow > 0,
    breakEvenRent: Math.ceil(breakEvenRent),
  };
}
