import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "I Love Real Estate - Property Investment Advisors",
  description:
    "AI-powered property investment advisors trained on I Love Real Estate materials.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Pre-production banner */}
        <div className="hidden sm:block fixed bottom-12 right-0 z-[60] overflow-hidden pointer-events-none" style={{ width: 150, height: 150 }}>
          <div
            className="absolute bg-amber-500 text-black text-xs font-bold text-center py-1"
            style={{
              width: 200,
              bottom: 28,
              right: -50,
              transform: "rotate(-45deg)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            TESTING ONLY
          </div>
        </div>
        <AuthProvider>{children}</AuthProvider>
        {/* Site-wide disclaimer */}
        <div className="fixed bottom-0 inset-x-0 z-50 bg-zinc-900/95 border-t border-zinc-700 px-3 sm:px-4 py-1.5 sm:py-2 text-center">
          <p className="text-[10px] sm:text-[11px] text-zinc-500 leading-snug max-w-3xl mx-auto">
            Early development - not for production use.
            AI-generated responses may contain errors. Not financial, legal, or investment advice.
            <span className="hidden sm:inline"> Always consult qualified professionals before making investment decisions.</span>
          </p>
        </div>
      </body>
    </html>
  );
}
