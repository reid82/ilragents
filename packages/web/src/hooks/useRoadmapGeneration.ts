'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useRoadmapStore } from '@/lib/stores/roadmap-store';
import type { ClientProfile } from '@/lib/stores/financial-store';
import type { RoadmapData } from '@/lib/stores/roadmap-store';

export function useRoadmapGeneration() {
  const abortRef = useRef<AbortController | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const fetchExistingRoadmap = useCallback(async (roadmapId: string) => {
    const { setCompleted, setFailed } = useRoadmapStore.getState();
    try {
      const res = await fetch(`/api/roadmap/${roadmapId}`);
      if (!res.ok) throw new Error('Failed to fetch roadmap');
      const data = await res.json();
      setCompleted(data.reportMarkdown, data.reportData as RoadmapData, roadmapId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch roadmap';
      setFailed(message);
    }
  }, []);

  const pollStatus = useCallback((sessionId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      const { setProgress, setFailed } = useRoadmapStore.getState();
      try {
        const res = await fetch(`/api/roadmap/status?sessionId=${sessionId}`);
        const data = await res.json();

        if (data.status === 'completed') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          await fetchExistingRoadmap(data.roadmapId);
        } else if (data.status === 'failed') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setFailed(data.errorMessage || 'Generation failed');
        } else if (data.status === 'generating') {
          setProgress(data.sectionsCompleted || 0);
        }
      } catch {
        // Non-fatal - keep polling
      }
    }, 3000);

    // Auto-clear after 10 minutes
    setTimeout(() => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }, 600000);
  }, [fetchExistingRoadmap]);

  const startGeneration = useCallback(
    async (profile: ClientProfile, sessionId: string, userId?: string) => {
      // Use getState() to read live status (avoids stale closure)
      const currentStatus = useRoadmapStore.getState().status;
      if (currentStatus === 'generating' || currentStatus === 'completed') return;

      const { setStatus, setProgress, setRoadmapId, setFailed } = useRoadmapStore.getState();
      setStatus('generating');
      setProgress(0, 'Starting...');

      abortRef.current = new AbortController();

      try {
        const res = await fetch('/api/roadmap/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile, sessionId, userId }),
          signal: abortRef.current.signal,
        });

        // If the response is JSON (duplicate detection), handle it
        const contentType = res.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
          const json = await res.json();
          if (json.status === 'completed') {
            await fetchExistingRoadmap(json.roadmapId);
            return;
          }
          if (json.status === 'generating') {
            setRoadmapId(json.roadmapId);
            pollStatus(sessionId);
            return;
          }
          throw new Error(json.error || 'Unknown error');
        }

        // SSE stream
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (!data) continue;

            try {
              const event = JSON.parse(data);
              const store = useRoadmapStore.getState();

              switch (event.type) {
                case 'started':
                  store.setProgress(0, 'Starting generation...');
                  break;
                case 'progress':
                  store.setProgress(event.sectionsCompleted, event.currentSection);
                  break;
                case 'completed':
                  store.setRoadmapId(event.roadmapId);
                  await fetchExistingRoadmap(event.roadmapId);
                  break;
                case 'error':
                  store.setFailed(event.message);
                  break;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }

        // Process any remaining buffer after stream ends
        if (buffer.trim().startsWith('data: ')) {
          try {
            const data = buffer.trim().slice(6);
            const event = JSON.parse(data);
            if (event.type === 'completed') {
              useRoadmapStore.getState().setRoadmapId(event.roadmapId);
              await fetchExistingRoadmap(event.roadmapId);
            } else if (event.type === 'error') {
              useRoadmapStore.getState().setFailed(event.message);
            }
          } catch {
            // Malformed final event - ignore
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        const message = error instanceof Error ? error.message : 'Generation failed';
        useRoadmapStore.getState().setFailed(message);
      }
    },
    [fetchExistingRoadmap, pollStatus]
  );

  return { startGeneration };
}
