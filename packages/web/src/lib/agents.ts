export type AgentTable = "facilitator" | "strategy" | "portfolio";

export interface AgentDef {
  id: string;
  name: string;
  domain: string;
  description: string;
  color: string;
  table: AgentTable;
  ragAgents: string[];
}

export const AGENTS: AgentDef[] = [
  // Facilitator
  {
    id: "baseline-ben",
    name: "Baseline Ben",
    domain: "Strategy, Foundations & Roadmapping",
    description:
      "Your starting point. Ben establishes your financial position and covers strategy, fundamentals, and portfolio planning.",
    color: "#3B82F6",
    table: "facilitator",
    ragAgents: ["Navigator Nate", "Foundation Frank", "Roadmap Ray"],
  },

  // Investment Strategies
  {
    id: "teflon-terry",
    name: "Teflon Terry",
    domain: "Asset Protection & Legal Structures",
    description:
      "Specialist in protecting your assets through trusts, company structures, and legal frameworks.",
    color: "#8B5CF6",
    table: "strategy",
    ragAgents: ["Teflon Terry"],
  },
  {
    id: "depreciation-dave",
    name: "Depreciation Dave",
    domain: "Tax Depreciation",
    description:
      "Expert on maximising tax depreciation benefits across your property portfolio.",
    color: "#F59E0B",
    table: "strategy",
    ragAgents: ["Depreciation Dave"],
  },
  {
    id: "finder-fred",
    name: "Finder Fred",
    domain: "Property Sourcing",
    description:
      "Knows how to find, evaluate, and secure the right investment properties.",
    color: "#10B981",
    table: "strategy",
    ragAgents: ["Finder Fred"],
  },
  {
    id: "venture-vince",
    name: "Venture Vince",
    domain: "Ventures & Deals",
    description:
      "Specialist in joint ventures, deal structuring, and creative investment strategies.",
    color: "#EF4444",
    table: "strategy",
    ragAgents: ["Venture Vince"],
  },
  {
    id: "strata-sam",
    name: "Strata Sam",
    domain: "Strata & Body Corporate",
    description:
      "Covers strata title investing, body corporate management, and unit investments.",
    color: "#06B6D4",
    table: "strategy",
    ragAgents: ["Strata Sam"],
  },

  // Portfolio Management
  {
    id: "splitter-steve",
    name: "Splitter Steve",
    domain: "Subdivision & Development",
    description:
      "Expert in subdivision, development, and creating value through land splitting.",
    color: "#D946EF",
    table: "portfolio",
    ragAgents: ["Splitter Steve"],
  },
  {
    id: "equity-eddie",
    name: "Equity Eddie",
    domain: "Equity & Finance Strategies",
    description:
      "Specialist in leveraging equity, finance strategies, and funding your portfolio growth.",
    color: "#F97316",
    table: "portfolio",
    ragAgents: ["Equity Eddie"],
  },
  {
    id: "yield-yates",
    name: "Yield Yates",
    domain: "Yield & Cash Flow",
    description:
      "Focused on rental yield, cash flow optimisation, and income-producing strategies.",
    color: "#22C55E",
    table: "portfolio",
    ragAgents: ["Yield Yates"],
  },
  {
    id: "tenant-tony",
    name: "Tenant Tony",
    domain: "Tenancy & Property Management",
    description:
      "Covers tenant selection, property management, and maximising occupancy.",
    color: "#6366F1",
    table: "portfolio",
    ragAgents: ["Tenant Tony"],
  },
];

export function getAgentById(id: string): AgentDef | undefined {
  return AGENTS.find((a) => a.id === id);
}

export function getAgentsByTable(table: AgentTable): AgentDef[] {
  return AGENTS.filter((a) => a.table === table);
}

export function getFacilitator(): AgentDef {
  return AGENTS.find((a) => a.table === "facilitator")!;
}
