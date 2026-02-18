export interface AgentDef {
  id: string;
  name: string;
  domain: string;
  description: string;
  color: string;
  avatarUrl: string;
  ragAgents: string[];
  contextLimit: number;
  isFacilitator?: boolean;
}

export const AGENTS: AgentDef[] = [
  {
    id: "baseline-ben",
    name: "Baseline Ben",
    domain: "Strategy, Foundations & Roadmapping",
    description:
      "Your starting point. Ben establishes your financial position and covers strategy, fundamentals, and portfolio planning.",
    color: "#3B82F6",
    avatarUrl:
      "https://api.dicebear.com/9.x/adventurer/svg?seed=BaselineBen&backgroundColor=3B82F6&skinColor=f2d3b1",
    ragAgents: ["Navigator Nate", "Foundation Frank", "Roadmap Ray"],
    contextLimit: 15,
    isFacilitator: true,
  },
  {
    id: "finder-fred",
    name: "Finder Fred",
    domain: "Property Sourcing",
    description:
      "Knows how to find, evaluate, and secure the right investment properties.",
    color: "#10B981",
    avatarUrl:
      "https://api.dicebear.com/9.x/adventurer/svg?seed=FinderFred&backgroundColor=10B981&skinColor=ecad80",
    ragAgents: ["Finder Fred"],
    contextLimit: 15,
  },
  {
    id: "investor-coach",
    name: "Investor Coach",
    domain: "Portfolio Management & Growth",
    description:
      "Covers subdivision, equity strategies, yield optimisation, tenancy management, and strata matters.",
    color: "#22C55E",
    avatarUrl:
      "https://api.dicebear.com/9.x/adventurer/svg?seed=InvestorCoach&backgroundColor=22C55E&skinColor=d08b5b",
    ragAgents: [
      "Splitter Steve",
      "Equity Eddie",
      "Yield Yates",
      "Tenant Tony",
      "Strata Sam",
    ],
    contextLimit: 25,
  },
  {
    id: "deal-specialist",
    name: "Finance & Legal Team",
    domain: "Asset Protection, Tax & Deal Structuring",
    description:
      "Specialist in asset protection, legal structures, tax depreciation, joint ventures, and creative deal strategies.",
    color: "#8B5CF6",
    avatarUrl:
      "https://api.dicebear.com/9.x/adventurer/svg?seed=DealSpecialist&backgroundColor=8B5CF6&skinColor=f2d3b1",
    ragAgents: ["Teflon Terry", "Depreciation Dave", "Venture Vince"],
    contextLimit: 20,
  },
  {
    id: "deal-analyser-dan",
    name: "Deal Analyser Dan",
    domain: "Deal Analysis & Assessment",
    description:
      "Paste a property listing URL or address and Dan will scrape the data, pull in your financial position, and walk you through an ILR deal assessment.",
    color: "#F59E0B",
    avatarUrl:
      "https://api.dicebear.com/9.x/adventurer/svg?seed=DealAnalyserDan&backgroundColor=F59E0B&skinColor=f2d3b1",
    ragAgents: ["Finder Fred", "Foundation Frank", "Yield Yates", "ILR Methodology"],
    contextLimit: 25,
  },
  {
    id: "fiso-phil",
    name: "FISO Phil",
    domain: "Deal Calculator & Feasibility",
    description:
      "Run the numbers. Phil takes a property deal and produces a full ILR feasibility report - FISO analysis, cashflow modelling, sensitivity testing, and capacity check.",
    color: "#EF4444",
    avatarUrl:
      "https://api.dicebear.com/9.x/adventurer/svg?seed=FISOPhil&backgroundColor=EF4444&skinColor=ecad80",
    ragAgents: ["Foundation Frank", "ILR Methodology"],
    contextLimit: 15,
  },
];

export function getAgentById(id: string): AgentDef | undefined {
  return AGENTS.find((a) => a.id === id);
}

export function getAdvisors(): AgentDef[] {
  return AGENTS.filter((a) => !a.isFacilitator);
}

export function getFacilitator(): AgentDef {
  return AGENTS.find((a) => a.isFacilitator)!;
}
