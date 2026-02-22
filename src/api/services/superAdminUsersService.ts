import { insforge } from '../insforge/client';
import type { UUID } from '../models/entities';
import type { CompanyRole } from '../models/core';

export type MembershipRow = {
  id: UUID;
  company_id: UUID;
  user_id: UUID;
  role: string;
  created_at: string;
  company_name?: string;
  email?: string | null;
  full_name?: string | null;
};

export async function listAllMemberships(): Promise<MembershipRow[]> {
  const { data: memberships, error: mErr } = await insforge.database
    .from('company_memberships')
    .select('id, company_id, user_id, role, created_at, companies(name)')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (mErr) throw mErr;

  const { data: profiles } = await insforge.database
    .from('user_profiles')
    .select('company_id, user_id, email, full_name');
  const profileMap = new Map<string, { email: string | null; full_name: string | null }>();
  (profiles ?? []).forEach((p: { company_id: string; user_id: string; email: string | null; full_name: string | null }) => {
    profileMap.set(`${p.company_id}:${p.user_id}`, { email: p.email ?? null, full_name: p.full_name ?? null });
  });

  return (memberships ?? []).map((m: any) => {
    const companyName = m.companies?.name ?? '';
    const key = `${m.company_id}:${m.user_id}`;
    const prof = profileMap.get(key);
    return {
      id: m.id,
      company_id: m.company_id,
      user_id: m.user_id,
      role: m.role,
      created_at: m.created_at,
      company_name: companyName,
      email: prof?.email ?? null,
      full_name: prof?.full_name ?? null
    };
  }) as MembershipRow[];
}

export async function updateMembershipRole(membershipId: UUID, role: CompanyRole): Promise<void> {
  const { error } = await insforge.database
    .from('company_memberships')
    .update({ role })
    .eq('id', membershipId);
  if (error) throw error;
}
