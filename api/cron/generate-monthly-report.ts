import { readBearerToken } from '../_insforge.js';
import { applyNoStoreHeaders } from '../_response.js';
import { generateMonthlyComplianceReport } from '../../src/api/services/complianceScoringService.js';

const MODULE = 'api.cron.generate-monthly-report';

function authorizeCron(req: any): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = readBearerToken(req);
  return !!(bearer && bearer === secret);
}

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!authorizeCron(req)) {
    console.warn(`[${MODULE}] Unauthorized request`);
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const { companyId, reportMonth, recipientEmails } = req.body ?? {};

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ ok: false, error: 'companyId is required' });
  }
  if (!Array.isArray(recipientEmails)) {
    return res.status(400).json({ ok: false, error: 'recipientEmails must be an array' });
  }

  try {
    await generateMonthlyComplianceReport({
      companyId,
      reportMonth: typeof reportMonth === 'string' ? reportMonth : undefined,
      recipientEmails: recipientEmails.filter((e: unknown) => typeof e === 'string' && e.includes('@')),
      createdByUserId: null
    });

    console.info(`[${MODULE}] Queued report for company ${companyId}, month ${reportMonth ?? 'current'}`);
    return res.status(200).json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${MODULE}] Failed for company ${companyId}: ${msg}`);
    return res.status(500).json({ ok: false, error: msg });
  }
}
