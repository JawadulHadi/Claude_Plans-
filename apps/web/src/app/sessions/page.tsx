'use client';

import { useEffect, useState } from 'react';
import type { InterviewSession } from '@pitchfire/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const TYPE_LABELS: Record<string, string> = {
  phone_screen: 'Phone Screen',
  technical: 'Technical',
  behavioral: 'Behavioral',
  onsite: 'On-site',
  offer_call: 'Offer Call',
  followup: 'Follow-up',
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const userId = 'demo-user-123'; // Phase 5: Supabase auth

  useEffect(() => {
    fetch(`${API_URL}/sessions/${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSessions(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const upcoming = sessions.filter(
    (s) => s.scheduled_at && new Date(s.scheduled_at) >= new Date(),
  );
  const past = sessions.filter(
    (s) => !s.scheduled_at || new Date(s.scheduled_at) < new Date(),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Interview Sessions</h1>
        <span className="text-gray-400 text-sm">{sessions.length} total</span>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <div className="text-gray-400 mb-2">No interview sessions yet.</div>
          <div className="text-gray-500 text-sm">
            Sessions appear here once we detect an interview invite in your email.
          </div>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Upcoming</h2>
              {upcoming.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Past</h2>
              {past.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SessionCard({ session }: { session: InterviewSession }) {
  const scheduledDate = session.scheduled_at ? new Date(session.scheduled_at) : null;
  const isPast = scheduledDate ? scheduledDate < new Date() : false;

  return (
    <div className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-5 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-950 text-blue-400">
              {TYPE_LABELS[session.type] ?? session.type}
            </span>
            {isPast && (
              <span className="text-xs text-gray-500">completed</span>
            )}
          </div>
          {scheduledDate && (
            <div className="text-gray-300 text-sm mt-1.5">
              {scheduledDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          )}
          {session.prep_notes && (
            <div className="text-gray-500 text-xs mt-1 line-clamp-2">{session.prep_notes}</div>
          )}
        </div>
      </div>
    </div>
  );
}
