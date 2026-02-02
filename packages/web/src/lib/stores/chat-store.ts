import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Source {
  title: string;
  score: number;
  contentType: string;
  agent: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

const MAX_MESSAGES_PER_AGENT = 50;

interface ChatState {
  chats: Record<string, Message[]>;
  getMessages: (agentId: string) => Message[];
  addMessage: (agentId: string, message: Message) => void;
  updateLastMessage: (agentId: string, message: Message) => void;
  clearChat: (agentId: string) => void;
  clearAllChats: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      chats: {},
      getMessages: (agentId) => get().chats[agentId] ?? [],
      addMessage: (agentId, message) =>
        set((state) => {
          const existing = state.chats[agentId] ?? [];
          const updated = [...existing, message].slice(-MAX_MESSAGES_PER_AGENT);
          return { chats: { ...state.chats, [agentId]: updated } };
        }),
      updateLastMessage: (agentId, message) =>
        set((state) => {
          const existing = state.chats[agentId] ?? [];
          if (existing.length === 0) return state;
          const updated = [...existing];
          updated[updated.length - 1] = message;
          return { chats: { ...state.chats, [agentId]: updated } };
        }),
      clearChat: (agentId) =>
        set((state) => {
          const { [agentId]: _, ...rest } = state.chats;
          return { chats: rest };
        }),
      clearAllChats: () => set({ chats: {} }),
    }),
    {
      name: 'ilre-chat-history',
    }
  )
);
