'use client';

import { useEffect, useState } from 'react';
import type { Application } from '@pitchfire/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApplicationWithJob extends Application {
  job_listings: {
    title: string;
    company: string;
    board: string;
    url: string;
    location: string | null;
  } | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending_review: 'bg-yellow-950 text-yellow-400',
  approved: 'bg-blue-950 text-blue-400',
  applying: 'bg-purple-950 text-purple-400',
  applied: 'bg-cyan-950 text-cyan-400',
  replied: 'bg-teal-950 text-teal-400',
  interview: 'bg-green-950 text-green-400',
  offer: 'bg-emerald-950 text-emerald-400',
  rejected: 'bg-red-950 text-red-400',
  ghosted: 'bg-gray-800 text-gray-500',
  withdrawn: 'bg-gray-800 text-gray-500',
  bounced: 'bg-orange-950 text-orange-400',
};

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const userId = 'demo-user-123'; // Phase 5: Supabase auth

  useEffect(() => {
    fetch(`${API_URL}/pipeline/${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setApplications(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const statusCounts = applications.reduce(
    (acc, app) => {
      acc[app.status] = (acc[app.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Applications</h1>
        <span className="text-gray-400 text-sm">{applications.length} total</span>
      </div>

      {/* Pipeline funnel */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { key: 'applied', label: 'Applied' },
          { key: 'interview', label: 'Interview' },
          { key: 'offer', label: 'Offer' },
          { key: 'rejected', label: 'Rejected' },
        ].map((stage) => (
          <div key={stage.key} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{statusCounts[stage.key] ?? 0}</div>
            <div className="text-gray-400 text-sm mt-1">{stage.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400">Loading applications...</div>
      ) : applications.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <div className="text-gray-400 mb-2">No applications yet.</div>
          <div className="text-gray-500 text-sm">
            Upload your resume on the Dashboard to start the pipeline.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <div
              key={app.id}
              className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-5 transition-colors"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-white text-sm">
                    {app.job_listings?.title ?? 'Job Application'}
                  </div>
                  <div className="text-gray-400 text-xs mt-0.5">
                    {app.job_listings?.company ?? '—'}
                    {app.job_listings?.location ? ` · ${app.job_listings.location}` : ''}
                    {app.match_score ? ` · ${Math.round(app.match_score * 100)}% match` : ''}
                  </div>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${STATUS_STYLES[app.status] ?? 'bg-gray-800 text-gray-400'}`}
                >
                  {app.status.replaceAll('_', ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
