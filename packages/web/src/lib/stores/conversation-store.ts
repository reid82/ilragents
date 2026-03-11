import { create } from 'zustand';
import type { Referral } from '@/lib/specialists';

export interface Source {
  title: string;
  score: number;
  contentType: string;
  agent: string;
}

export interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  referrals?: Referral[];
  created_at?: string;
}

export interface ConversationMeta {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ConversationState {
  conversations: ConversationMeta[];
  activeConversationId: string | null;
  messages: Message[];
  isLoadingList: boolean;
  isLoadingMessages: boolean;

  fetchConversations: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  createConversation: (title?: string) => Promise<string>;
  addMessage: (msg: Message) => void;
  updateLastMessage: (msg: Message) => void;
  persistMessage: (conversationId: string, msg: Message) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  clearMessages: () => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoadingList: false,
  isLoadingMessages: false,

  fetchConversations: async () => {
    set({ isLoadingList: true });
    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) throw new Error(`Failed to fetch conversations: ${res.status}`);
      const data: ConversationMeta[] = await res.json();
      set({ conversations: data });
    } catch (error) {
      console.error('fetchConversations error:', error);
    } finally {
      set({ isLoadingList: false });
    }
  },

  loadConversation: async (id: string) => {
    set({ isLoadingMessages: true });
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      if (!res.ok) throw new Error(`Failed to load conversation: ${res.status}`);
      const data: Message[] = await res.json();
      set({ messages: data, activeConversationId: id });
    } catch (error) {
      console.error('loadConversation error:', error);
    } finally {
      set({ isLoadingMessages: false });
    }
  },

  createConversation: async (title?: string) => {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title ?? 'New conversation' }),
    });
    if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`);
    const newConversation: ConversationMeta = await res.json();
    set((state) => ({
      conversations: [newConversation, ...state.conversations],
    }));
    return newConversation.id;
  },

  addMessage: (msg: Message) => {
    set((state) => ({ messages: [...state.messages, msg] }));
  },

  updateLastMessage: (msg: Message) => {
    set((state) => {
      const messages = [...state.messages];
      if (messages.length === 0) return { messages };
      messages[messages.length - 1] = msg;
      return { messages };
    });
  },

  persistMessage: async (conversationId: string, msg: Message) => {
    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
    if (!res.ok) throw new Error(`Failed to persist message: ${res.status}`);
  },

  deleteConversation: async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete conversation: ${res.status}`);
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
      messages: state.activeConversationId === id ? [] : state.messages,
    }));
  },

  renameConversation: async (id: string, title: string) => {
    const res = await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(`Failed to rename conversation: ${res.status}`);
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }));
  },

  setActiveConversation: (id: string | null) => {
    set({ activeConversationId: id });
  },

  clearMessages: () => {
    set({ messages: [], activeConversationId: null });
  },
}));
