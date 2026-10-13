import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface FunnelStats {
  scouted: number;
  scored: number;
  tailored: number;
  applied: number;
  replied: number;
  interviews: number;
  offers: number;
}

export interface WeeklyActivity {
  week: string; // ISO date of Monday
  applications: number;
  replies: number;
  interviews: number;
}

export interface AnalyticsDashboard {
  funnel: FunnelStats;
  weekly: WeeklyActivity[];
  top_companies: Array<{ company: string; count: number }>;
  avg_match_score: number;
  reply_rate: number;
  interview_rate: number;
}

@Injectable()
export class AnalyticsService {
  private db: SupabaseClient;

  constructor() {
    this.db = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  async getDashboard(userId: string): Promise<AnalyticsDashboard> {
    const [funnel, weekly, topCompanies, avgScore] = await Promise.all([
      this.getFunnelStats(userId),
      this.getWeeklyActivity(userId),
      this.getTopCompanies(userId),
      this.getAvgMatchScore(userId),
    ]);

    const replyRate = funnel.applied > 0 ? funnel.replied / funnel.applied : 0;
    const interviewRate = funnel.replied > 0 ? funnel.interviews / funnel.replied : 0;

    return {
      funnel,
      weekly,
      top_companies: topCompanies,
      avg_match_score: avgScore,
      reply_rate: Math.round(replyRate * 100) / 100,
      interview_rate: Math.round(interviewRate * 100) / 100,
    };
  }

  private async getFunnelStats(userId: string): Promise<FunnelStats> {
    const { data: apps } = await this.db
      .from('applications')
      .select('status')
      .eq('user_id', userId);

    const { data: jobs } = await this.db
      .from('job_listings')
      .select('id')
      .not('embedding', 'is', null);

    const counts = { scouted: 0, scored: 0, tailored: 0, applied: 0, replied: 0, interviews: 0, offers: 0 };
    counts.scouted = jobs?.length ?? 0;

    for (const app of apps ?? []) {
      const s = app.status as string;
      if (['scored', 'tailoring', 'awaiting_approval', 'applying', 'applied', 'replied', 'interview', 'offer', 'rejected', 'failed'].includes(s)) counts.scored++;
      if (['tailoring', 'awaiting_approval', 'applying', 'applied', 'replied', 'interview', 'offer'].includes(s)) counts.tailored++;
      if (['applied', 'replied', 'interview', 'offer'].includes(s)) counts.applied++;
      if (['replied', 'interview', 'offer'].includes(s)) counts.replied++;
      if (['interview', 'offer'].includes(s)) counts.interviews++;
      if (s === 'offer') counts.offers++;
    }

    return counts;
  }

  private async getWeeklyActivity(userId: string): Promise<WeeklyActivity[]> {
    const { data: events } = await this.db
      .from('pipeline_events')
      .select('event_type, created_at, application_id, applications!inner(user_id)')
      .eq('applications.user_id', userId)
      .gte('created_at', new Date(Date.now() - 8 * 7 * 86400_000).toISOString())
      .order('created_at', { ascending: true });

    const weekMap = new Map<string, WeeklyActivity>();

    for (const ev of events ?? []) {
      const d = new Date(ev.created_at as string);
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = monday.toISOString().slice(0, 10);

      if (!weekMap.has(key)) weekMap.set(key, { week: key, applications: 0, replies: 0, interviews: 0 });
      const week = weekMap.get(key)!;

      if (ev.event_type === 'application_submitted') week.applications++;
      if (ev.event_type === 'reply_received') week.replies++;
      if (ev.event_type === 'session_scheduled') week.interviews++;
    }

    return Array.from(weekMap.values()).sort((a, b) => a.week.localeCompare(b.week));
  }

  private async getTopCompanies(userId: string): Promise<Array<{ company: string; count: number }>> {
    const { data } = await this.db
      .from('applications')
      .select('job_listings(company)')
      .eq('user_id', userId)
      .in('status', ['applied', 'replied', 'interview', 'offer']);

    const companyMap = new Map<string, number>();
    for (const row of data ?? []) {
      const jl = row.job_listings as unknown as { company: string } | { company: string }[] | null;
      const company = (Array.isArray(jl) ? jl[0]?.company : jl?.company) ?? 'Unknown';
      companyMap.set(company, (companyMap.get(company) ?? 0) + 1);
    }

    return Array.from(companyMap.entries())
      .map(([company, count]) => ({ company, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private async getAvgMatchScore(userId: string): Promise<number> {
    const { data } = await this.db
      .from('applications')
      .select('score')
      .eq('user_id', userId)
      .not('score', 'is', null);

    if (!data || data.length === 0) return 0;
    const avg = data.reduce((sum, r) => sum + (r.score as number), 0) / data.length;
    return Math.round(avg * 100) / 100;
  }
}
