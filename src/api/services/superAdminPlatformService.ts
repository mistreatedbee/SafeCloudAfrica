import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import type { Company } from '../models/entities';

export type CompanyWithCount = Company & { user_count?: number };

export type PlatformOverviewStats = {
  totalOrgs: number;
  totalUsers: number;
  activeLicenses: number;
  expiringSoon: number;
};

const COMPANY_LIST_COLUMNS =
  'id,name,code,license_type,employee_limit,modules_enabled,metadata,status,subscription_status,created_at';

function isMissingRpcError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('could not find the function') ||
    msg.includes('schema cache')
  );
}

export async function listPlatformCompaniesSummary(): Promise<CompanyWithCount[]> {
  const { data, error } = await insforge.database.rpc('list_platform_companies_summary');
  if (!error && Array.isArray(data)) {
    return data as CompanyWithCount[];
  }
  if (error && !isMissingRpcError(error)) {
    throw new Error(getErrorMessage(error));
  }

  const { data: companies, error: companiesError } = await insforge.database
    .from('companies')
    .select(COMPANY_LIST_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(500);
  if (companiesError) throw new Error(getErrorMessage(companiesError));

  const { data: counts, error: countsError } = await insforge.database
    .from('company_memberships')
    .select('company_id');
  if (countsError) throw new Error(getErrorMessage(countsError));

  const countByCompany: Record<string, number> = {};
  (counts ?? []).forEach((row: { company_id: string }) => {
    countByCompany[row.company_id] = (countByCompany[row.company_id] ?? 0) + 1;
  });

  return ((companies ?? []) as Company[]).map((company) => ({
    ...company,
    user_count: countByCompany[company.id] ?? 0
  }));
}

export async function getPlatformOverviewStats(): Promise<PlatformOverviewStats> {
  const { data, error } = await insforge.database.rpc('get_platform_overview_stats');
  if (!error && data && typeof data === 'object') {
    const stats = data as PlatformOverviewStats;
    return {
      totalOrgs: stats.totalOrgs ?? 0,
      totalUsers: stats.totalUsers ?? 0,
      activeLicenses: stats.activeLicenses ?? 0,
      expiringSoon: stats.expiringSoon ?? 0
    };
  }
  if (error && !isMissingRpcError(error)) {
    throw new Error(getErrorMessage(error));
  }

  const [companiesRes, membershipsRes] = await Promise.all([
    insforge.database.from('companies').select('id', { count: 'planned', head: true }),
    insforge.database.from('company_memberships').select('user_id', { count: 'planned', head: true })
  ]);
  if (companiesRes.error) throw new Error(getErrorMessage(companiesRes.error));
  if (membershipsRes.error) throw new Error(getErrorMessage(membershipsRes.error));

  let activeLicenses = 0;
  let expiringSoon = 0;
  try {
    const { data: licenses, error: licensesError } = await insforge.database
      .from('org_licenses')
      .select('id, end_date, status')
      .eq('status', 'active');
    if (licensesError) throw licensesError;
    activeLicenses = licenses?.length ?? 0;
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    expiringSoon =
      licenses?.filter(
        (license: { end_date: string }) =>
          license.end_date && new Date(license.end_date) <= in30Days && new Date(license.end_date) >= now
      ).length ?? 0;
  } catch {
    // org_licenses may not exist on older tenants
  }

  return {
    totalOrgs: companiesRes.count ?? 0,
    totalUsers: membershipsRes.count ?? 0,
    activeLicenses,
    expiringSoon
  };
}
