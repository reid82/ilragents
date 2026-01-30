import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FinancialPosition {
  income?: number;
  expenses?: number;
  existingProperties?: number;
  equity?: number;
  borrowingCapacity?: number;
  investmentGoal?: string;
  timeHorizon?: string;
  riskTolerance?: string;
  summary: string;
}

interface FinancialState {
  position: FinancialPosition | null;
  rawTranscript: string | null;
  setPosition: (position: FinancialPosition) => void;
  setRawTranscript: (transcript: string) => void;
  clear: () => void;
}

export const useFinancialStore = create<FinancialState>()(
  persist(
    (set) => ({
      position: null,
      rawTranscript: null,
      setPosition: (position) => set({ position }),
      setRawTranscript: (transcript) => set({ rawTranscript: transcript }),
      clear: () => set({ position: null, rawTranscript: null }),
    }),
    {
      name: 'ilre-financial',
    }
  )
);
