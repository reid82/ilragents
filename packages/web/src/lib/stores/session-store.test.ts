import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from './session-store';

describe('session-store', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('starts not onboarded', () => {
    expect(useSessionStore.getState().isOnboarded).toBe(false);
  });

  it('starts with null sessionId', () => {
    expect(useSessionStore.getState().sessionId).toBeNull();
  });

  it('sets onboarded', () => {
    useSessionStore.getState().setOnboarded(true);
    expect(useSessionStore.getState().isOnboarded).toBe(true);
  });

  it('sets session ID', () => {
    useSessionStore.getState().setSessionId('test-123');
    expect(useSessionStore.getState().sessionId).toBe('test-123');
  });

  it('resets to defaults', () => {
    useSessionStore.getState().setOnboarded(true);
    useSessionStore.getState().setSessionId('test-123');
    useSessionStore.getState().reset();
    expect(useSessionStore.getState().isOnboarded).toBe(false);
    expect(useSessionStore.getState().sessionId).toBeNull();
  });
});
