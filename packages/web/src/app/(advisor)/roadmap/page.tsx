'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { Download, FileText } from 'lucide-react';
import { useRoadmapStore } from '@/lib/stores/roadmap-store';
import type { RoadmapData } from '@/lib/stores/roadmap-store';
import { useAuthStore } from '@/lib/stores/auth-store';

interface SectionNav {
  id: string;
  number: number;
  title: string;
}

function extractSections(markdown: string): SectionNav[] {
  const sections: SectionNav[] = [];
  const regex = /^## (\d+)\.\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const num = parseInt(match[1], 10);
    const title = match[2].trim();
    sections.push({ id: `section-${num}`, number: num, title });
  }
  return sections;
}

export default function RoadmapPage() {
  const router = useRouter();
  const { status, roadmapId, reportMarkdown, reportData } = useRoadmapStore();
  const user = useAuthStore((s) => s.user);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [showNav, setShowNav] = useState(false);
  const hydrateRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(
    () => (reportMarkdown ? extractSections(reportMarkdown) : []),
    [reportMarkdown]
  );

  useEffect(() => {
    if (status === 'completed' && reportMarkdown) {
      setIsHydrating(false);
      return;
    }
    if (hydrateRef.current) return;
    hydrateRef.current = true;

    (async () => {
      try {
        if (user) {
          const res = await fetch('/api/roadmap/mine');
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'completed' && data.roadmapId) {
              useRoadmapStore.getState().setCompleted(
                data.reportMarkdown,
                data.reportData as RoadmapData,
                data.roadmapId
              );
              setIsHydrating(false);
              return;
            }
          }
        }
      } catch {
        // Fall through
      }
      setIsHydrating(false);
      router.push('/');
    })();
  }, [status, reportMarkdown, user, router]);

  // Track active section on scroll
  useEffect(() => {
    if (sections.length === 0 || !scrollRef.current) return;

    const container = scrollRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { root: container, rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  const scrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setShowNav(false);
  }, []);

  async function handleDownloadPdf() {
    if (!roadmapId) return;
    setIsDownloading(true);
    try {
      const res = await fetch(`/api/roadmap/${roadmapId}/pdf`);
      if (!res.ok) throw new Error('PDF generation failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ILRE-Roadmap.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  }

  if (isHydrating || status !== 'completed' || !reportMarkdown) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--border-default)', borderTopColor: 'var(--primary)' }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Roadmap header bar */}
      <div
        className="flex items-center justify-between px-4 sm:px-6 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--primary-glow)' }}
          >
            <FileText className="w-4 h-4" style={{ color: 'var(--primary-light)' }} />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">My Investment Roadmap</h1>
            {reportData && (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Score: <span style={{ color: 'var(--primary-light)' }}>{reportData.investorScore}/100</span>
                <span className="mx-1.5">-</span>
                <span className="capitalize">{reportData.strategyType}</span>
                <span className="mx-1.5">-</span>
                Phase {reportData.recommendedPhase}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile section nav toggle */}
          <button
            onClick={() => setShowNav(!showNav)}
            className="lg:hidden px-3 py-1.5 text-xs rounded-lg transition-colors"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            Sections
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="flex items-center gap-1.5 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)',
            }}
          >
            <Download className="w-3.5 h-3.5" />
            {isDownloading ? 'Generating...' : 'PDF'}
          </button>
        </div>
      </div>

      {/* Mobile section nav dropdown */}
      {showNav && (
        <div
          className="lg:hidden px-4 py-3 flex-shrink-0 overflow-y-auto max-h-64"
          style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-1)' }}
        >
          <div className="space-y-0.5">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className="block w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  color: activeSection === section.id ? 'var(--primary-light)' : 'var(--text-secondary)',
                  fontWeight: activeSection === section.id ? 500 : 400,
                }}
              >
                {section.number}. {section.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Desktop section nav - timeline style */}
        <nav className="hidden lg:block w-52 flex-shrink-0 overflow-y-auto py-6 pl-6 pr-2">
          <div className="relative">
            {/* Vertical timeline line */}
            <div
              className="absolute left-[9px] top-1 bottom-1 w-px"
              style={{ background: 'var(--border-subtle)' }}
            />
            <div className="space-y-0.5">
              {sections.map((section) => {
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className="relative flex items-start gap-3 w-full text-left py-1.5 transition-colors group"
                  >
                    {/* Timeline dot */}
                    <div
                      className="relative z-10 flex-shrink-0 w-[19px] h-[19px] rounded-full flex items-center justify-center text-[9px] font-semibold transition-all"
                      style={{
                        background: isActive ? 'var(--primary)' : 'var(--surface-0)',
                        border: isActive ? '2px solid var(--primary)' : '2px solid var(--border-default)',
                        color: isActive ? 'white' : 'var(--text-muted)',
                        boxShadow: isActive ? '0 0 8px var(--primary-glow)' : 'none',
                      }}
                    >
                      {section.number}
                    </div>
                    {/* Label */}
                    <span
                      className="text-[12px] leading-tight pt-0.5 transition-colors"
                      style={{
                        color: isActive ? 'var(--primary-light)' : 'var(--text-muted)',
                        fontWeight: isActive ? 500 : 400,
                      }}
                    >
                      {section.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {reportData && (
            <div className="mt-6 pt-4 ml-8" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Score</span>
                  <span className="font-medium" style={{ color: 'var(--primary-light)' }}>{reportData.investorScore}/100</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Strategy</span>
                  <span className="font-medium capitalize text-white">{reportData.strategyType}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Phase</span>
                  <span className="font-medium text-white">{reportData.recommendedPhase}</span>
                </div>
              </div>
            </div>
          )}
        </nav>

        {/* Main content - scrollable */}
        <main ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto">
          <article className="max-w-3xl mx-auto px-4 sm:px-8 py-8 prose prose-invert prose-base max-w-none prose-headings:scroll-mt-4 prose-h2:text-xl prose-h2:pb-2 prose-h3:text-lg prose-p:text-zinc-300 prose-p:leading-relaxed prose-li:text-zinc-300 prose-strong:text-white prose-table:text-sm" style={{ '--tw-prose-links': 'var(--primary-light)' } as React.CSSProperties}>
            <ReactMarkdown
              components={{
                h2: ({ children, ...props }) => {
                  const text = String(children);
                  const match = text.match(/^(\d+)\./);
                  const id = match ? `section-${match[1]}` : undefined;
                  return (
                    <h2
                      id={id}
                      className="mt-10 first:mt-0"
                      style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}
                      {...props}
                    >
                      {children}
                    </h2>
                  );
                },
              }}
            >
              {reportMarkdown}
            </ReactMarkdown>
          </article>
        </main>
      </div>
    </div>
  );
}
