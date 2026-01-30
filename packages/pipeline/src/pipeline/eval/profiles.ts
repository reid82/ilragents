/**
 * Financial profiles for eval scenarios.
 * Includes per-agent briefs for testing context-awareness with rich data.
 */

export interface AgentBriefs {
  baselineBen: string;
  finderFred: string;
  investorCoach: string;
  dealSpecialist: string;
}

export interface EvalProfile {
  id: string;
  label: string;
  summary: string;
  agentBriefs: AgentBriefs;
}

export const EVAL_PROFILES: EvalProfile[] = [
  {
    id: 'sarah-first-timer',
    label: 'Sarah - First Timer',
    summary:
      'Sarah is a 28-year-old first-time investor based in Victoria, earning $85k/year PAYG. $45k savings, $450k borrowing capacity, $28k HECS debt. No properties. Wants to buy first investment property within 12 months. Moderate risk tolerance, 10+ year horizon, unsure on strategy.',
    agentBriefs: {
      baselineBen: 'Sarah is a first-time investor based in VIC, 28 years old, earning $85k PAYG full-time. She has $45k savings, $450k borrowing capacity, and a $28k HECS debt. No existing properties. Her goal is to buy her first investment property within 12 months. Moderate risk tolerance with a 10+ year horizon but unsure on strategy. No broker, no accountant, no pre-approval. Biggest challenge: knowing where to start.',
      finderFred: 'Sarah is looking for her first investment property within 6-12 months. Budget around $450k. $45k cash for deposit. Based in VIC but open to interstate. Prefers metro and major regional. No strategy preference yet. PAYG on $85k, moderate risk tolerance.',
      investorCoach: 'Sarah earns $85k/year PAYG, 3 years in role. No existing properties. $45k cash, $4,600/mo expenses. $28k HECS debt. Borrowing capacity $450k. No broker or pre-approval. $5k credit card limits. Goal: first purchase within 12 months, build portfolio over 10+ years. Moderate risk tolerance, unsure on growth vs cash flow.',
      dealSpecialist: 'Sarah has no existing structures - no trusts, companies, or SMSF. On 32.5% marginal tax rate ($85k). No accountant or solicitor. First property purchase so structure decisions are from scratch. No dependents, not investing with a partner.',
    },
  },
  {
    id: 'james-growing-portfolio',
    label: 'James - Growing Portfolio',
    summary:
      'James is a 35-year-old investor based in VIC with 2 investment properties and a PPOR. Earns $130k PAYG, partner $75k. $180k equity, $720k borrowing, $85k cash. Properties in personal and joint names, interested in trusts. Goal: scale to 5 properties in 3 years via equity recycling. Growth strategy.',
    agentBriefs: {
      baselineBen: 'James is 35, based in VIC, with 2 investment properties plus a PPOR. Earns $130k PAYG (partner $75k), $180k equity, $720k borrowing. Goal: scale from 2 to 5 properties in 3 years via equity recycling, capital growth focus. 3 years experience, wants to explore trust structures. Has broker and accountant. 2 dependents.',
      finderFred: 'James wants his 3rd investment property within 6 months, budget $550k. $85k cash, $180k equity. Prefers VIC and QLD (Geelong corridor, south-east QLD). Open to interstate. Capital growth strategy. Owns in Brunswick (unit) and Geelong (house). Has a broker. PAYG on $130k plus partner $75k.',
      investorCoach: 'James earns $130k PAYG, partner $75k. PPOR $850k/$520k mortgage. Investment 1: Brunswick unit, $620k/$480k, $520/wk rent, personal name. Investment 2: Geelong house, $485k/$390k, $410/wk, joint names. $180k equity, $720k borrowing, $85k cash. $12k HECS, $18k car loan. $6,500/mo expenses. 2 dependents. Goal: 5 properties in 3 years, capital growth, equity recycling.',
      dealSpecialist: 'James has personal name (Brunswick unit) and joint-personal (Geelong house, PPOR). No trusts or companies but interested in structuring future acquisitions. 37% marginal rate ($130k + $54k rental). Has accountant, no solicitor. No SMSF. 2 dependents, partner co-invests. 3+ more purchases planned so structure decisions are urgent.',
    },
  },
  {
    id: 'karen-high-equity',
    label: 'Karen - High Equity',
    summary:
      'Karen is a 45-year-old experienced investor in QLD. Self-employed company, $175k + $95k investment income. 4 properties, $620k equity, $1.2M borrowing, $220k cash. Family trust structures. Full advisory team, SMSF $380k. Focus: development and subdivision in Brisbane metro. Aggressive risk.',
    agentBriefs: {
      baselineBen: 'Karen is experienced (8 years, 4 properties), QLD-based. Self-employed Pty Ltd $175k + $95k investment income. $620k equity, $1.2M borrowing, $220k cash. Moving into development/subdivision in Brisbane metro. Full advisory team, family trust structures, SMSF $380k. 1 dependent. Aggressive risk, 3-5 year active strategy.',
      finderFred: 'Karen wants development-grade sites in Brisbane metro and Gold Coast, budget up to $800k. Moving in 3 months. Pre-approved, $220k cash, $620k equity. Not open to interstate. Metro only. Owns in Newstead, Cannon Hill, Logan, Ipswich. Value-add/subdivision strategy. 8 years experience, has broker.',
      investorCoach: 'Karen earns $175k self-employed (Pty Ltd). $95k additional from shares and rent. PPOR $1.1M/$280k. Newstead unit $580k/$320k, $550/wk, family trust. Cannon Hill house $780k/$450k, $580/wk, family trust. Logan duplex $620k/$400k, $680/wk, family trust. Ipswich house $450k/$340k, $420/wk, personal. $620k equity, $1.2M borrowing, $220k cash. $7,900/mo expenses. No debts outside mortgages. Pre-approved. Goal: development and subdivision.',
      dealSpecialist: 'Karen has family trust holding 3 of 4 properties (Newstead, Cannon Hill, Logan). Ipswich in personal name. 45% marginal rate ($175k + $95k). Full advisory team: accountant, solicitor, financial planner. SMSF $380k. Not seeking new structures. 1 dependent. Self-employed Pty Ltd. Interested in structuring a subdivision JV.',
    },
  },
  {
    id: 'mike-cash-flow',
    label: 'Mike - Cash Flow Focused',
    summary:
      'Mike is a 52-year-old conservative investor in SA. Earns $95k PAYG. 1 investment property (Elizabeth SA) plus PPOR. $85k equity, $520k borrowing, $60k cash. Goal: passive income to replace salary in 15 years. Cash-flow strategy. Has broker and accountant.',
    agentBriefs: {
      baselineBen: 'Mike is 52, SA-based, conservative. $95k PAYG, 1 investment property plus PPOR. $85k equity, $520k borrowing, $60k cash. 15-year plan to replace salary with passive rental income. Cash-flow strategy. 4 years experience. Challenge: finding cash-flow-positive properties. Has broker and accountant. No dependents.',
      finderFred: 'Mike wants his 2nd property within 12 months, budget $400k. Cash-flow strategy - must be positive or close. Open to SA (Adelaide metro) and QLD (regional). Happy with regional. $60k cash, $85k equity. Owns in Elizabeth SA (house). Has broker. PAYG $95k, conservative risk.',
      investorCoach: 'Mike earns $95k PAYG, 15 years in role. PPOR $550k/$180k. Elizabeth SA house $380k/$260k, $370/wk, personal name. $85k equity, $520k borrowing, $60k cash. $5,200/mo expenses. $8k credit cards. No other debts. Goal: passive income to replace salary in 15 years. Conservative, cash-flow focused. Needs yield modelling for target.',
      dealSpecialist: 'Mike has everything in personal name. No trusts, companies, or SMSF. Not interested in restructuring. 32.5% marginal rate ($95k). Has accountant, no solicitor. No dependents. Conservative. Small portfolio - protection less urgent. May revisit as portfolio grows.',
    },
  },
  {
    id: 'linda-asset-protection',
    label: 'Linda - Structure & Protection',
    summary:
      'Linda is a 41-year-old investor in NSW. Earns $210k PAYG, partner $120k. 3 investment properties, all in personal/joint names. $450k equity, $950k borrowing, $150k cash. Primary concern: restructure into trusts for protection and tax optimisation. 45% marginal rate. Has accountant, no solicitor.',
    agentBriefs: {
      baselineBen: 'Linda is 41, NSW-based, $210k PAYG (partner $120k). 3 investment properties plus PPOR, all personal/joint names. $450k equity, $950k borrowing, $150k cash. Priority: restructure into trusts for asset protection and tax optimisation (45% rate). Has broker and accountant but no solicitor. 3 dependents. 6 years experience. Wants to fix structures while continuing to grow.',
      finderFred: 'Linda wants her 4th property within 3-6 months, budget $700k. Prefers NSW (Sydney metro, Central Coast) and south-east QLD. Open to interstate. $150k cash, $450k equity. Balanced strategy. Owns in Parramatta, Newcastle, Wollongong. Has broker. $210k + partner $120k. Note: restructuring in progress, new purchases may go into trust.',
      investorCoach: 'Linda earns $210k PAYG, partner $120k. PPOR $1.4M/$650k. Parramatta unit $650k/$480k, $520/wk, personal. Newcastle house $720k/$520k, $560/wk, joint. Wollongong townhouse $580k/$430k, $480/wk, personal. $450k equity, $950k borrowing, $150k cash. $25k car loan. $10k/mo expenses. $20k credit cards. 3 dependents. Goal: restructure and grow. Balanced strategy.',
      dealSpecialist: 'Linda has all properties in personal/joint names - no trusts, companies, or SMSF. This is her primary pain point. Wants to restructure for protection and tax (45% rate on $210k + $78k rental). Has accountant but NO solicitor or financial planner. 3 dependents, partner co-invests ($120k). Key question: moving existing properties into trusts (stamp duty, CGT implications). Parramatta (personal), Newcastle (joint), Wollongong (personal). 6 years experience.',
    },
  },
];

export function getProfile(id: string): EvalProfile | undefined {
  return EVAL_PROFILES.find((p) => p.id === id);
}
