'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Dashboard() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ id: string; pages: number; enqueued: string } | null>(null);
  const [userId] = useState('demo-user-123'); // Phase 5: replace with Supabase auth

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_id', userId);

      const res = await fetch(`${API_URL}/resume/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      alert(String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
        <p className="text-gray-400">Upload your resume to start the pipeline</p>
      </div>

      {/* Resume Upload */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-lg">Resume Upload</h2>
        <label className="block border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-lg p-8 text-center cursor-pointer transition-colors">
          <input
            type="file"
            accept=".pdf,.txt,.md"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
          {uploading ? (
            <span className="text-blue-400">Uploading and parsing...</span>
          ) : (
            <span className="text-gray-400">
              Drop your resume PDF here or <span className="text-blue-400">click to browse</span>
            </span>
          )}
        </label>

        {result && (
          <div className="bg-green-950 border border-green-800 rounded-lg p-4 text-sm">
            <div className="text-green-400 font-medium">Resume uploaded</div>
            <div className="text-gray-400 mt-1">
              ID: {result.id} · {result.pages} page(s) · {result.enqueued} agent queued
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Jobs Matched', value: '—', action: '/jobs' },
          { label: 'Applications', value: '—', action: '/applications' },
          { label: 'Interviews', value: '—', action: '/sessions' },
          { label: 'Offers', value: '—', action: '/sessions' },
        ].map((stat) => (
          <a
            key={stat.label}
            href={stat.action}
            className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-4 transition-colors"
          >
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="text-gray-400 text-sm mt-1">{stat.label}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
