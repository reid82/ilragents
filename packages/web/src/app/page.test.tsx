import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from './page';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// Mock session store
const mockSessionStore = {
  isOnboarded: false,
  setOnboarded: vi.fn(),
  setSessionId: vi.fn(),
};

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: (selector: (s: typeof mockSessionStore) => unknown) =>
    selector(mockSessionStore),
}));

// Mock client profile store
const mockProfileStore = {
  profile: null,
  setProfile: vi.fn(),
  clear: vi.fn(),
};

vi.mock('@/lib/stores/financial-store', () => ({
  useClientProfileStore: (selector: (s: typeof mockProfileStore) => unknown) =>
    selector(mockProfileStore),
}));

// Mock test profiles
vi.mock('@/lib/test-profiles', () => ({
  TEST_PROFILES: [],
}));

describe('HomePage', () => {
  beforeEach(() => {
    mockSessionStore.isOnboarded = false;
    mockSessionStore.setOnboarded = vi.fn();
    mockSessionStore.setSessionId = vi.fn();
    mockProfileStore.profile = null;
    mockProfileStore.setProfile = vi.fn();
    mockProfileStore.clear = vi.fn();
  });

  it('renders page title', () => {
    render(<HomePage />);
    expect(screen.getByText('ILRE Agents')).toBeDefined();
  });

  it('renders Baseline Ben hero', () => {
    render(<HomePage />);
    expect(screen.getByText('Baseline Ben')).toBeDefined();
  });

  it('renders Your Advisors section', () => {
    render(<HomePage />);
    expect(screen.getByText('Your Advisors')).toBeDefined();
  });

  it('renders Begin your assessment link when not onboarded', () => {
    render(<HomePage />);
    expect(screen.getByText('Begin your assessment')).toBeDefined();
  });
});
