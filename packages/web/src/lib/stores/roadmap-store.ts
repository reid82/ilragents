import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RoadmapProjections {
  year1: { equity: number; cashflow: number; properties: number };
  year3: { equity: number; cashflow: number; properties: number };
  year5: { equity: number; cashflow: number; properties: number };
}

export interface RoadmapDealCriteria {
  priceRange: { min: number; max: number };
  targetYield: number;
  propertyTypes: string[];
  locations: string[];
}

export interface RoadmapKeyMetrics {
  accessibleEquity: number;
  borrowingCapacity: number;
  maxPurchasePrice: number;
  currentNetYield?: number;
}

export interface RoadmapData {
  investorScore: number;
  strategyType: 'chunk' | 'income' | 'stacked' | 'foundation';
  recommendedPhase: 1 | 2 | 3;
  projections: RoadmapProjections;
  dealCriteria: RoadmapDealCriteria;
  keyMetrics: RoadmapKeyMetrics;
  topPriorities: string[];
  generatedAt: string;
}

export type RoadmapStatus = 'idle' | 'generating' | 'completed' | 'failed';

interface RoadmapState {
  status: RoadmapStatus;
  roadmapId: string | null;
  sectionsCompleted: number;
  totalSections: number;
  currentSectionLabel: string | null;
  reportMarkdown: string | null;
  reportData: RoadmapData | null;
  errorMessage: string | null;

  setStatus: (status: RoadmapStatus) => void;
  setRoadmapId: (id: string) => void;
  setProgress: (completed: number, label?: string) => void;
  setCompleted: (markdown: string, data: RoadmapData, id: string) => void;
  setFailed: (error: string) => void;
  reset: () => void;
}

export const useRoadmapStore = create<RoadmapState>()(
  persist(
    (set) => ({
      status: 'idle',
      roadmapId: null,
      sectionsCompleted: 0,
      totalSections: 8,
      currentSectionLabel: null,
      reportMarkdown: null,
      reportData: null,
      errorMessage: null,

      setStatus: (status) => set({ status }),
      setRoadmapId: (id) => set({ roadmapId: id }),
      setProgress: (completed, label) =>
        set({
          sectionsCompleted: completed,
          currentSectionLabel: label ?? null,
        }),
      setCompleted: (markdown, data, id) =>
        set({
          status: 'completed',
          reportMarkdown: markdown,
          reportData: data,
          roadmapId: id,
          sectionsCompleted: 8,
          currentSectionLabel: null,
          errorMessage: null,
        }),
      setFailed: (error) =>
        set({
          status: 'failed',
          errorMessage: error,
          currentSectionLabel: null,
        }),
      reset: () =>
        set({
          status: 'idle',
          roadmapId: null,
          sectionsCompleted: 0,
          currentSectionLabel: null,
          reportMarkdown: null,
          reportData: null,
          errorMessage: null,
        }),
    }),
    {
      name: 'ilre-roadmap',
    }
  )
);
