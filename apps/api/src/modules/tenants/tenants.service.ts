import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

export interface AgencyMember {
  id: string;
  member_user_id: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
  email?: string;
  full_name?: string;
  plan?: string;
  applications_this_month?: number;
}

@Injectable()
export class TenantsService {
  private readonly db = createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  );

  private async requireAgencyPlan(agencyUserId: string): Promise<void> {
    const { data } = await this.db
      .from('users')
      .select('plan')
      .eq('id', agencyUserId)
      .single();

    if (data?.plan !== 'agency') {
      throw new ForbiddenException('Agency plan required to manage team profiles.');
    }
  }

  async listMembers(agencyUserId: string): Promise<AgencyMember[]> {
    await this.requireAgencyPlan(agencyUserId);

    const { data, error } = await this.db
      .from('agency_members')
      .select(`
        id, member_user_id, label, is_active, created_at,
        users!member_user_id (email, full_name, plan, applications_this_month)
      `)
      .eq('agency_user_id', agencyUserId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row: any) => ({
      id:                      row.id,
      member_user_id:          row.member_user_id,
      label:                   row.label,
      is_active:               row.is_active,
      created_at:              row.created_at,
      email:                   row.users?.email,
      full_name:               row.users?.full_name,
      plan:                    row.users?.plan,
      applications_this_month: row.users?.applications_this_month,
    }));
  }

  async addMember(agencyUserId: string, memberEmail: string, label?: string): Promise<AgencyMember> {
    await this.requireAgencyPlan(agencyUserId);

    // Check slot limit: agency plan allows 10 active members
    const { count } = await this.db
      .from('agency_members')
      .select('id', { count: 'exact', head: true })
      .eq('agency_user_id', agencyUserId)
      .eq('is_active', true);

    if ((count ?? 0) >= 10) {
      throw new ForbiddenException('Agency plan supports up to 10 active profiles.');
    }

    // Find member by email
    const { data: member } = await this.db
      .from('users')
      .select('id, email, full_name')
      .eq('email', memberEmail)
      .single();

    if (!member) {
      throw new NotFoundException(`No user found with email: ${memberEmail}`);
    }

    const { data, error } = await this.db
      .from('agency_members')
      .upsert({
        agency_user_id: agencyUserId,
        member_user_id: member.id,
        label:          label ?? null,
        is_active:      true,
      }, { onConflict: 'agency_user_id,member_user_id' })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { ...data, email: member.email, full_name: member.full_name };
  }

  async updateMember(agencyUserId: string, memberId: string, label?: string, isActive?: boolean): Promise<AgencyMember> {
    await this.requireAgencyPlan(agencyUserId);

    const updates: Record<string, unknown> = {};
    if (label    !== undefined) updates.label     = label;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data, error } = await this.db
      .from('agency_members')
      .update(updates)
      .eq('id', memberId)
      .eq('agency_user_id', agencyUserId)
      .select()
      .single();

    if (error || !data) throw new NotFoundException('Member not found.');
    return data;
  }

  async removeMember(agencyUserId: string, memberId: string): Promise<void> {
    await this.requireAgencyPlan(agencyUserId);

    const { error } = await this.db
      .from('agency_members')
      .update({ is_active: false })
      .eq('id', memberId)
      .eq('agency_user_id', agencyUserId);

    if (error) throw new Error(error.message);
  }

  async getBulkApplyStatus(agencyUserId: string): Promise<Record<string, unknown>[]> {
    await this.requireAgencyPlan(agencyUserId);

    const { data: members } = await this.db
      .from('agency_members')
      .select('member_user_id, label')
      .eq('agency_user_id', agencyUserId)
      .eq('is_active', true);

    if (!members?.length) return [];

    const memberIds = members.map((m: any) => m.member_user_id);
    const labelMap = Object.fromEntries(members.map((m: any) => [m.member_user_id, m.label]));

    const { data: stats } = await this.db
      .from('applications')
      .select('user_id, status')
      .in('user_id', memberIds);

    const grouped: Record<string, Record<string, number>> = {};
    for (const row of stats ?? []) {
      if (!grouped[row.user_id]) grouped[row.user_id] = {};
      grouped[row.user_id][row.status] = (grouped[row.user_id][row.status] ?? 0) + 1;
    }

    return memberIds.map(uid => ({
      member_user_id: uid,
      label:          labelMap[uid],
      stats:          grouped[uid] ?? {},
    }));
  }
}
