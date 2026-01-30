import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  isOnboarded: boolean;
  sessionId: string | null;
  setOnboarded: (onboarded: boolean) => void;
  setSessionId: (id: string) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      isOnboarded: false,
      sessionId: null,
      setOnboarded: (onboarded) => set({ isOnboarded: onboarded }),
      setSessionId: (id) => set({ sessionId: id }),
      reset: () => set({ isOnboarded: false, sessionId: null }),
    }),
    {
      name: "ilre-session",
    }
  )
);
