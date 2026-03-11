'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
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
    sections.push({
      id: `section-${num}`,
      number: num,
      title,
    });
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
  const hydrateRef = useRef(false);

  const sections = useMemo(
    () => (reportMarkdown ? extractSections(reportMarkdown) : []),
    [reportMarkdown]
  );

  // If store is empty, try to hydrate from server before redirecting
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
        // Fall through to redirect
      }
      // No roadmap found on server either - redirect home
      setIsHydrating(false);
      router.push('/');
    })();
  }, [status, reportMarkdown, user, router]);

  // Track active section on scroll
  useEffect(() => {
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

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
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
              &larr; Back
            </Link>
            <div className="bg-white rounded-lg px-2.5 py-1 flex-shrink-0">
              <Image src="/ilre-logo.png" alt="I Love Real Estate" width={100} height={47} className="h-7 w-auto" />
            </div>
            <h1 className="text-lg font-semibold hidden sm:block">My Roadmap</h1>
          </div>
          <button
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {isDownloading ? 'Generating PDF...' : 'Download PDF'}
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto flex gap-8 px-4 sm:px-6 py-8">
        {/* Sidebar nav - desktop only */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <nav className="sticky top-24 space-y-1">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
              Sections
            </p>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={`block text-sm px-3 py-2 rounded-lg transition-colors ${
                  activeSection === section.id
                    ? 'bg-red-500/10 text-red-400 font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                {section.number}. {section.title}
              </a>
            ))}

            {reportData && (
              <div className="mt-6 pt-6 border-t border-zinc-800">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
                  Key Metrics
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Investor Score</span>
                    <span className="text-white font-medium">{reportData.investorScore}/100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Strategy</span>
                    <span className="text-white font-medium capitalize">{reportData.strategyType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Phase</span>
                    <span className="text-white font-medium">{reportData.recommendedPhase}</span>
                  </div>
                </div>
              </div>
            )}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <article className="prose prose-invert prose-lg max-w-none prose-headings:scroll-mt-24 prose-h2:text-2xl prose-h2:border-b prose-h2:border-zinc-800 prose-h2:pb-3 prose-h3:text-xl prose-p:text-zinc-300 prose-li:text-zinc-300 prose-strong:text-white prose-a:text-red-400">
            <ReactMarkdown
              components={{
                h2: ({ children, ...props }) => {
                  // Extract section number for id
                  const text = String(children);
                  const match = text.match(/^(\d+)\./);
                  const id = match ? `section-${match[1]}` : undefined;
                  return <h2 id={id} {...props}>{children}</h2>;
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
