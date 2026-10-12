import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JobPilot AI — Autonomous Job Search',
  description: 'AI-powered job search orchestrator. Find, match, apply, and manage your entire job search pipeline.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 font-bold text-xl">JobPilot</span>
            <span className="text-gray-500 text-xs bg-gray-800 px-2 py-0.5 rounded-full">AI</span>
          </div>
          <div className="flex gap-6 text-sm text-gray-400">
            <a href="/dashboard" className="hover:text-white transition-colors">Dashboard</a>
            <a href="/jobs" className="hover:text-white transition-colors">Jobs</a>
            <a href="/review" className="hover:text-white transition-colors">Review</a>
            <a href="/applications" className="hover:text-white transition-colors">Applications</a>
            <a href="/sessions" className="hover:text-white transition-colors">Sessions</a>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
