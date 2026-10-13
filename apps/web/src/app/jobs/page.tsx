'use client';

import { useEffect, useState } from 'react';
import type { JobMatch } from '@pitchfire/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const userId = 'demo-user-123'; // Phase 5: Supabase auth

  useEffect(() => {
    fetch(`${API_URL}/jobs/matched/${userId}`)
      .then((r) => r.json())
      .then(setJobs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Matched Jobs</h1>
        <span className="text-gray-400 text-sm">{jobs.length} matches found</span>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading jobs...</div>
      ) : jobs.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <div className="text-gray-400 mb-2">No jobs matched yet.</div>
          <div className="text-gray-500 text-sm">
            Upload your resume on the Dashboard to start the pipeline.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-5 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-white">{job.title}</h3>
                  <div className="text-gray-400 text-sm mt-0.5">
                    {job.company} · {job.location || 'Remote'} · {job.board}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-full ${
                      job.similarity >= 0.85
                        ? 'bg-green-950 text-green-400'
                        : job.similarity >= 0.72
                        ? 'bg-blue-950 text-blue-400'
                        : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    {Math.round(job.similarity * 100)}% match
                  </span>
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    View →
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
