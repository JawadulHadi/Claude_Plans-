'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PendingApplication {
  id: string;
  status: string;
  created_at: string;
  job_listings: {
    title: string;
    company: string;
    board: string;
    url: string;
    location: string | null;
  };
  tailor_output?: {
    tailored_resume: string;
    cover_letter: string;
    score: number;
  };
}

export default function ReviewPage() {
  const [apps, setApps] = useState<PendingApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const userId = 'demo-user-123'; // Phase 5: Supabase auth

  useEffect(() => {
    fetch(`${API_URL}/apply/pending/${userId}`)
      .then((r) => r.json())
      .then(setApps)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleAction(appId: string, action: 'approve' | 'withdraw') {
    setActioning(appId);
    try {
      const res = await fetch(`${API_URL}/apply/${appId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setApps((prev) => prev.filter((a) => a.id !== appId));
      }
    } catch (err) {
      console.error('Action failed', err);
    } finally {
      setActioning(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Review Queue</h1>
        <span className="text-gray-400 text-sm">
          {apps.length} pending approval
        </span>
      </div>

      <p className="text-gray-400 text-sm">
        These applications have been tailored and are ready to submit. Review the
        generated resume and cover letter, then approve or withdraw each one.
      </p>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : apps.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <div className="text-gray-400 mb-2">No applications pending review.</div>
          <div className="text-gray-500 text-sm">
            The TailorAgent will queue applications here once jobs are scored.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {apps.map((app) => (
            <div
              key={app.id}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
            >
              <div className="flex items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-white truncate">
                      {app.job_listings?.title ?? 'Untitled Role'}
                    </h3>
                    {app.tailor_output?.score != null && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 shrink-0">
                        {Math.round(app.tailor_output.score * 100)}% match
                      </span>
                    )}
                  </div>
                  <div className="text-gray-400 text-sm mt-0.5">
                    {app.job_listings?.company} · {app.job_listings?.location ?? 'Remote'} ·{' '}
                    {app.job_listings?.board}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setExpanded(expanded === app.id ? null : app.id)}
                    className="text-xs text-gray-400 hover:text-white px-3 py-1.5 border border-gray-700 rounded-lg transition-colors"
                  >
                    {expanded === app.id ? 'Hide' : 'Preview'}
                  </button>
                  <button
                    disabled={actioning === app.id}
                    onClick={() => handleAction(app.id, 'withdraw')}
                    className="text-xs px-3 py-1.5 border border-red-800 text-red-400 hover:bg-red-950 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                  <button
                    disabled={actioning === app.id}
                    onClick={() => handleAction(app.id, 'approve')}
                    className="text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {actioning === app.id ? 'Queuing…' : 'Approve & Apply'}
                  </button>
                </div>
              </div>

              {expanded === app.id && app.tailor_output && (
                <div className="border-t border-gray-800 p-5 space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Cover Letter
                    </div>
                    <div className="bg-gray-950 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                      {app.tailor_output.cover_letter || 'No cover letter generated.'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Tailored Resume
                    </div>
                    <div className="bg-gray-950 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto font-mono">
                      {app.tailor_output.tailored_resume || 'No resume variant generated.'}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <a
                      href={app.job_listings?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      View original job posting →
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
