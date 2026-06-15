import { readBearerToken } from '../_insforge.js';
import { applyNoStoreHeaders } from '../_response.js';
import { generateMonthlyComplianceReport } from '../../src/api/services/complianceScoringService.js';

const MODULE = 'api.cron.generate-monthly-report';

function authorizeCron(req: any): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = readBearerToken(req);
  if (bearer && bearer === secret) return true;
  const q = String(req.query?.secret ?? '');
  if (q && q === secret) return true;
  return false;
}

function getPreviousMonthDate(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);

  if (!authorizeCron(req)) {
    console.warn(`[${MODULE}] Unauthorized request`);
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  // GET: cron-driven batch run using env vars (CRON_COMPANY_IDS, CRON_RECIPIENT_EMAILS)
  if (req.method === 'GET') {
    const cronCompanyIds = (process.env.CRON_COMPANY_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const cronRecipients = (process.env.CRON_RECIPIENT_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));
    const reportMonth = getPreviousMonthDate();

    if (cronCompanyIds.length === 0) {
      console.warn(`[${MODULE}] CRON_COMPANY_IDS not configured — nothing to process`);
      return res.status(200).json({ ok: true, processed: 0, skipped: 'no_companies_configured' });
    }

    const results: { companyId: string; ok: boolean; error?: string }[] = [];
    for (const companyId of cronCompanyIds) {
      try {
        await generateMonthlyComplianceReport({
          companyId,
          reportMonth,
          recipientEmails: cronRecipients,
          createdByUserId: null
        });
        console.info(`[${MODULE}] Report sent for company ${companyId}, month ${reportMonth}`);
        results.push({ companyId, ok: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[${MODULE}] Failed for company ${companyId}: ${msg}`);
        results.push({ companyId, ok: false, error: msg });
      }
    }
    const failCount = results.filter((r) => !r.ok).length;
    return res.status(200).json({ ok: failCount === 0, processed: results.length, results });
  }

  // POST: manual/API-driven for a single company
  if (req.method === 'POST') {
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

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
