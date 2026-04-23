import { insforge } from '../insforge/client';
import { getErrorMessage } from '../insforge/errors';
import { createActivityLog } from './activityLogService';
import type { UUID } from '../models/entities';

export type SellableFeatureKey =
  | 'bbs'
  | 'contractorsVisitors'
  | 'emergencyPreparedness'
  | 'templateLibrary'
  | 'assetManagement'
  | 'hazardousChemicals';

export type SellableFeatureState = {
  enabled: boolean;
  locked: boolean;
};

export type SellableFeaturesConfig = Record<SellableFeatureKey, SellableFeatureState>;

export const SELLABLE_FEATURES_ORDER: SellableFeatureKey[] = [
  'bbs',
  'contractorsVisitors',
  'emergencyPreparedness',
  'templateLibrary',
  'assetManagement',
  'hazardousChemicals'
];

export const SELLABLE_FEATURE_LABELS: Record<SellableFeatureKey, string> = {
  bbs: 'BBS Programme',
  contractorsVisitors: 'Contractors & Visitors',
  emergencyPreparedness: 'Emergency Preparedness',
  templateLibrary: 'Template Library',
  assetManagement: 'Asset Management',
  hazardousChemicals: 'Hazardous Chemical Management'
};

export const SELLABLE_FEATURE_ROUTE_PATHS: Record<SellableFeatureKey, string> = {
  bbs: '/dashboard/sellable/bbs',
  contractorsVisitors: '/dashboard/sellable/contractors-visitors',
  emergencyPreparedness: '/dashboard/sellable/emergency-preparedness',
  templateLibrary: '/dashboard/sellable/template-library',
  assetManagement: '/dashboard/sellable/asset-management',
  hazardousChemicals: '/dashboard/sellable/hazardous-chemicals'
};

export const SELLABLE_FEATURE_PREVIEW_BULLETS: Record<SellableFeatureKey, string[]> = {
  bbs: [
    'Capture and trend behavioural observations in real time.',
    'Track safe vs unsafe acts with actionable insights.',
    'Drive proactive coaching and engagement on site.'
  ],
  contractorsVisitors: [
    'Manage contractor and visitor records in one place.',
    'Track onboarding and safety readiness status.',
    'Improve access control and compliance visibility.'
  ],
  emergencyPreparedness: [
    'Plan and schedule emergency drills with clear ownership.',
    'Track drill outcomes and corrective follow-ups.',
    'Keep emergency documentation easy to access.'
  ],
  templateLibrary: [
    'Store approved templates for repeatable operations.',
    'Standardize form and document usage across teams.',
    'Speed up deployment of quality, safety, and HR content.'
  ],
  assetManagement: [
    'Track asset status, ownership, and lifecycle.',
    'Schedule maintenance and inspections with visibility.',
    'Reduce downtime and improve operational control.'
  ],
  hazardousChemicals: [
    'Maintain chemical registers and storage records.',
    'Track SDS availability and compliance checkpoints.',
    'Improve hazardous-chemical risk visibility and control.'
  ]
};

const DEFAULT_FEATURE_STATE: SellableFeatureState = { enabled: true, locked: true };

export const DEFAULT_SELLABLE_FEATURES_CONFIG: SellableFeaturesConfig = {
  bbs: { ...DEFAULT_FEATURE_STATE },
  contractorsVisitors: { ...DEFAULT_FEATURE_STATE },
  emergencyPreparedness: { ...DEFAULT_FEATURE_STATE },
  templateLibrary: { ...DEFAULT_FEATURE_STATE },
  assetManagement: { ...DEFAULT_FEATURE_STATE },
  hazardousChemicals: { ...DEFAULT_FEATURE_STATE }
};

type CompanyLike = {
  metadata?: Record<string, unknown> | null;
};

function normalizeFeatureState(value: unknown): SellableFeatureState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_FEATURE_STATE };
  const input = value as Record<string, unknown>;
  return {
    enabled: input.enabled === false ? false : true,
    locked: input.locked === false ? false : true
  };
}

export function getSellableFeaturesConfig(company: CompanyLike | null): SellableFeaturesConfig {
  const metadata = (company?.metadata ?? null) as Record<string, unknown> | null;
  const raw = metadata?.['sellable_features'];
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    bbs: normalizeFeatureState(obj.bbs),
    contractorsVisitors: normalizeFeatureState(obj.contractorsVisitors),
    emergencyPreparedness: normalizeFeatureState(obj.emergencyPreparedness),
    templateLibrary: normalizeFeatureState(obj.templateLibrary),
    assetManagement: normalizeFeatureState(obj.assetManagement),
    hazardousChemicals: normalizeFeatureState(obj.hazardousChemicals)
  };
}

export function mergeSellableFeaturesConfig(
  current: SellableFeaturesConfig | null | undefined,
  patch: Partial<Record<SellableFeatureKey, Partial<SellableFeatureState>>>
): SellableFeaturesConfig {
  const base = current ?? { ...DEFAULT_SELLABLE_FEATURES_CONFIG };
  const next = { ...base };

  for (const key of SELLABLE_FEATURES_ORDER) {
    const itemPatch = patch[key];
    if (!itemPatch) continue;
    next[key] = {
      enabled: itemPatch.enabled ?? base[key].enabled,
      locked: itemPatch.locked ?? base[key].locked
    };
  }
  return next;
}

export class SellableFeatureAccessError extends Error {
  readonly status = 403;
  readonly code: 'FEATURE_LOCKED' | 'FEATURE_DISABLED';
  readonly featureKey: SellableFeatureKey;
  readonly companyId: UUID;

  constructor(input: {
    code: 'FEATURE_LOCKED' | 'FEATURE_DISABLED';
    featureKey: SellableFeatureKey;
    companyId: UUID;
    message: string;
  }) {
    super(input.message);
    this.name = 'SellableFeatureAccessError';
    this.code = input.code;
    this.featureKey = input.featureKey;
    this.companyId = input.companyId;
  }
}

export function isSellableFeatureAccessError(error: unknown): error is SellableFeatureAccessError {
  return (
    error instanceof Error &&
    'code' in error &&
    (((error as any).code as string) === 'FEATURE_LOCKED' || ((error as any).code as string) === 'FEATURE_DISABLED')
  );
}

export async function getSellableFeaturesForCompany(companyId: UUID): Promise<SellableFeaturesConfig> {
  const { data, error } = await insforge.database
    .from('companies')
    .select('id, metadata')
    .eq('id', companyId)
    .maybeSingle();

  if (error) throw new Error(getErrorMessage(error));
  return getSellableFeaturesConfig((data ?? null) as CompanyLike | null);
}

export async function requireSellableFeatureAccess(companyId: UUID, featureKey: SellableFeatureKey): Promise<void> {
  const sellable = await getSellableFeaturesForCompany(companyId);
  const state = sellable[featureKey];

  if (!state.enabled) {
    throw new SellableFeatureAccessError({
      code: 'FEATURE_DISABLED',
      featureKey,
      companyId,
      message: `Feature "${featureKey}" is disabled for this organisation.`
    });
  }
  if (state.locked) {
    throw new SellableFeatureAccessError({
      code: 'FEATURE_LOCKED',
      featureKey,
      companyId,
      message: `Feature "${featureKey}" is locked for this organisation.`
    });
  }
}

export async function requestSellableFeatureUnlock(input: {
  companyId: UUID;
  featureKey: SellableFeatureKey;
  requestedByUserId: UUID;
  requestedByEmail?: string | null;
}): Promise<void> {
  const { data: memberships, error: membershipError } = await insforge.database
    .from('company_memberships')
    .select('user_id, role, status')
    .eq('company_id', input.companyId)
    .in('role', ['owner', 'admin']);

  if (membershipError) throw new Error(getErrorMessage(membershipError));

  const recipients = Array.from(
    new Set(
      (memberships ?? [])
        .filter((m: { user_id?: string | null; status?: string | null }) => {
          const s = m.status;
          return Boolean(m.user_id) && (s === 'ACTIVE' || s == null || s === '');
        })
        .map((m: { user_id: string }) => m.user_id)
    )
  );

  const sender = input.requestedByEmail?.trim() || input.requestedByUserId;
  const featureLabel = SELLABLE_FEATURE_LABELS[input.featureKey];
  const payload = recipients.map((userId) => ({
    company_id: input.companyId,
    user_id: userId,
    title: 'Sellable Feature Unlock Request',
    message: `${sender} requested unlock for ${featureLabel}.`,
    severity: 'medium',
    read_at: null,
    metadata: {
      feature_key: input.featureKey,
      requested_by_user_id: input.requestedByUserId,
      requested_by_email: input.requestedByEmail ?? null,
      notification_type: 'info',
      action: 'sellable_feature_unlock_request'
    },
  }));

  if (payload.length > 0) {
    const { error: insertError } = await insforge.database.from('notifications').insert(payload);
    if (insertError) throw new Error(getErrorMessage(insertError));
  }

  try {
    await createActivityLog({
      companyId: input.companyId,
      actorUserId: input.requestedByUserId,
      action: 'sellable_features.request_unlock',
      metadata: {
        feature_key: input.featureKey,
        recipient_count: payload.length
      }
    });
  } catch {
    // Do not fail unlock request on activity log errors.
  }
}
