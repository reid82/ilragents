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
const mockStore = {
  isOnboarded: false,
  setOnboarded: vi.fn(),
};

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: (selector: (s: typeof mockStore) => unknown) =>
    selector(mockStore),
}));

describe('HomePage', () => {
  beforeEach(() => {
    mockStore.isOnboarded = false;
    mockStore.setOnboarded = vi.fn();
  });

  it('renders page title', () => {
    render(<HomePage />);
    expect(screen.getByText('ILRE Agents')).toBeDefined();
  });

  it('renders Baseline Ben hero', () => {
    render(<HomePage />);
    expect(screen.getByText('Baseline Ben')).toBeDefined();
  });

  it('renders Investment Strategies section', () => {
    render(<HomePage />);
    expect(screen.getByText('Investment Strategies')).toBeDefined();
  });

  it('renders Portfolio Management section', () => {
    render(<HomePage />);
    expect(screen.getByText('Portfolio Management')).toBeDefined();
  });
});
