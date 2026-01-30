export interface AgentDef {
  id: string;
  name: string;
  domain: string;
  description: string;
  color: string;
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
    name: "Deal Specialist",
    domain: "Asset Protection, Tax & Deal Structuring",
    description:
      "Specialist in asset protection, legal structures, tax depreciation, joint ventures, and creative deal strategies.",
    color: "#8B5CF6",
    ragAgents: ["Teflon Terry", "Depreciation Dave", "Venture Vince"],
    contextLimit: 20,
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
