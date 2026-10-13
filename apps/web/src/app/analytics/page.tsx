'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const USER_ID = 'demo-user-123'; // Phase 5: Supabase auth

interface FunnelStats {
  scouted: number;
  scored: number;
  tailored: number;
  applied: number;
  replied: number;
  interviews: number;
  offers: number;
}

interface WeeklyActivity {
  week: string;
  applications: number;
  replies: number;
  interviews: number;
}

interface AnalyticsDashboard {
  funnel: FunnelStats;
  weekly: WeeklyActivity[];
  top_companies: Array<{ company: string; count: number }>;
  avg_match_score: number;
  reply_rate: number;
  interview_rate: number;
}

const FUNNEL_STEPS: Array<{ key: keyof FunnelStats; label: string; color: string }> = [
  { key: 'scouted',    label: 'Scouted',    color: '#3b82f6' },
  { key: 'scored',     label: 'Scored',     color: '#6366f1' },
  { key: 'tailored',   label: 'Tailored',   color: '#8b5cf6' },
  { key: 'applied',    label: 'Applied',    color: '#06d6a0' },
  { key: 'replied',    label: 'Replied',    color: '#f59e0b' },
  { key: 'interviews', label: 'Interviews', color: '#ef4444' },
  { key: 'offers',     label: 'Offers',     color: '#10b981' },
];

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/analytics/${USER_ID}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400 p-6">Loading analytics…</div>;
  if (!data) return <div className="text-red-400 p-6">Failed to load analytics.</div>;

  const maxFunnelVal = data.funnel.scouted || 1;

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Avg Match Score" value={`${(data.avg_match_score * 100).toFixed(0)}%`} />
        <KpiCard label="Reply Rate" value={`${(data.reply_rate * 100).toFixed(0)}%`} />
        <KpiCard label="Interview Rate" value={`${(data.interview_rate * 100).toFixed(0)}%`} />
        <KpiCard label="Total Offers" value={String(data.funnel.offers)} highlight />
      </div>

      {/* Funnel */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Pipeline Funnel</h2>
        <div className="space-y-2">
          {FUNNEL_STEPS.map(({ key, label, color }) => {
            const val = data.funnel[key];
            const pct = Math.round((val / maxFunnelVal) * 100);
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-20 text-sm text-gray-400 text-right">{label}</span>
                <div className="flex-1 bg-gray-800 rounded h-6 overflow-hidden">
                  <div
                    className="h-full rounded flex items-center px-2 text-xs font-medium text-white transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: color, minWidth: val > 0 ? '2rem' : '0' }}
                  >
                    {val > 0 ? val : ''}
                  </div>
                </div>
                <span className="w-8 text-sm text-right text-gray-300">{val}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Weekly activity chart */}
      {data.weekly.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Weekly Activity</h2>
          <WeeklyChart data={data.weekly} />
        </section>
      )}

      {/* Top companies */}
      {data.top_companies.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Top Companies Applied</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {data.top_companies.map(({ company, count }) => (
              <div key={company} className="bg-gray-800 rounded p-3 flex justify-between items-center">
                <span className="text-sm font-medium truncate">{company}</span>
                <span className="text-xs text-gray-400 ml-2">{count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${highlight ? 'bg-emerald-900/40 border border-emerald-500/30' : 'bg-gray-800'}`}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-emerald-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function WeeklyChart({ data }: { data: WeeklyActivity[] }) {
  const maxVal = Math.max(...data.flatMap((w) => [w.applications, w.replies, w.interviews]), 1);
  const chartH = 120;

  return (
    <div className="bg-gray-800 rounded-xl p-4 overflow-x-auto">
      <div className="flex items-end gap-1 min-w-0" style={{ height: chartH + 24 }}>
        {data.slice(-12).map((week) => {
          const appH = Math.round((week.applications / maxVal) * chartH);
          const repH = Math.round((week.replies / maxVal) * chartH);
          const intH = Math.round((week.interviews / maxVal) * chartH);
          const label = week.week.slice(5); // MM-DD
          return (
            <div key={week.week} className="flex flex-col items-center gap-1 flex-1 min-w-[32px]">
              <div className="flex items-end gap-px h-full" style={{ height: chartH }}>
                <div className="w-2 rounded-t transition-all" style={{ height: appH, backgroundColor: '#06d6a0' }} title={`Applications: ${week.applications}`} />
                <div className="w-2 rounded-t transition-all" style={{ height: repH, backgroundColor: '#f59e0b' }} title={`Replies: ${week.replies}`} />
                <div className="w-2 rounded-t transition-all" style={{ height: intH, backgroundColor: '#ef4444' }} title={`Interviews: ${week.interviews}`} />
              </div>
              <span className="text-xs text-gray-500 rotate-45 origin-left">{label}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-2 text-xs text-gray-400">
        <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ backgroundColor: '#06d6a0' }} />Applications</span>
        <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ backgroundColor: '#f59e0b' }} />Replies</span>
        <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ backgroundColor: '#ef4444' }} />Interviews</span>
      </div>
    </div>
  );
}
