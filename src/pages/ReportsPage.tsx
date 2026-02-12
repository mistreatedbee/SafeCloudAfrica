import React from 'react';
import { motion } from 'framer-motion';
import { useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import {
  BarChart3Icon,
  DownloadIcon,
  FileTextIcon,
  CalendarIcon,
  TrendingUpIcon,
  PieChartIcon } from
'lucide-react';
import { Layout } from '../components/layout/Layout';
import { TrendChart } from '../components/ui/TrendChart';
import { toCsv, downloadTextFile } from '../utils/csv';
import { listIncidents } from '../api/services/incidentsService';
import { listTasks } from '../api/services/tasksService';
import { listDocuments } from '../api/services/documentsService';
import { createActivityLog, listActivityLogs } from '../api/services/activityLogService';
import { listTrainingCourses, listTrainingRecords } from '../api/services/trainingService';
import { listInspections } from '../api/services/inspectionsService';
import { listPjos, listPjoResponses } from '../api/services/pjoService';
import { listAuditFindings } from '../api/services/auditFindingsService';
import { isNearMiss } from '../api/utils/incidents';
import { useIdentity } from '../hooks/useIdentity';

type ReportTemplate = {
  id: 'compliance' | 'incidents' | 'training' | 'audits' | 'inspections' | 'pjo';
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
};

// Report templates are configuration (not data).
const reportTemplates: ReportTemplate[] = [
  {
    id: 'compliance',
    name: 'Monthly Compliance Export',
    description: 'Live snapshot of incidents, tasks, and documents by module',
    icon: TrendingUpIcon,
    color: '#0FB9B1'
  },
  {
    id: 'incidents',
    name: 'Incident Summary Export',
    description: 'Live incident records for auditing and analysis',
    icon: BarChart3Icon,
    color: '#E74C3C'
  },
  {
    id: 'training',
    name: 'Training Status Export',
    description: 'Exports training courses and records (live)',
    icon: FileTextIcon,
    color: '#F5A623'
  },
  {
    id: 'audits',
    name: 'Audit Findings Export',
    description: 'Exports inspections and audit findings (live)',
    icon: PieChartIcon,
    color: '#3498DB'
  },
  {
    id: 'inspections',
    name: 'Inspections Export',
    description: 'Exports inspections with findings and non-conformances (live)',
    icon: PieChartIcon,
    color: '#2ECC71'
  },
  {
    id: 'pjo',
    name: 'PJO Export',
    description: 'Exports Planned Job Observations with checklist responses (live)',
    icon: BarChart3Icon,
    color: '#1ABC9C'
  }
];

const containerVariants = {
  hidden: {
    opacity: 0
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};
const itemVariants = {
  hidden: {
    opacity: 0,
    y: 20
  },
  visible: {
    opacity: 1,
    y: 0
  }
};
export function ReportsPage() {
  const { user } = useUser();
  const { activeCompanyId } = useTenant();
  const { fullName, organisationName } = useIdentity();

  const { data: charts } = useAsync(async () => {
    if (!activeCompanyId) return { incidentTrends: [], comparison: [] as any[] };
    const incidents = await listIncidents({ companyId: activeCompanyId, limit: 500 });

    const byMonth = new Map<string, { incidents: number; nearMisses: number; lti: number }>();
    for (const i of incidents) {
      const d = new Date(i.occurred_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      const entry = byMonth.get(key) ?? { incidents: 0, nearMisses: 0, lti: 0 };
      entry.incidents += 1;
      if (isNearMiss(i)) entry.nearMisses += 1;
      if (String(i.severity).toLowerCase() === 'critical') entry.lti += 1;
      byMonth.set(key, entry);
    }

    const incidentTrends = Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, v]) => ({ month, ...v }));

    // Simple comparison uses the same series for now (bar chart expects month/incidents/nearMisses).
    const comparison = incidentTrends.map((r) => ({ month: r.month, incidents: r.incidents, nearMisses: r.nearMisses }));

    return { incidentTrends, comparison };
  }, [activeCompanyId]);

  const { data: recent, loading: recentLoading } = useAsync(async () => {
    if (!activeCompanyId) return [];
    return await listActivityLogs({ companyId: activeCompanyId, actionPrefix: 'reports.' , limit: 25 });
  }, [activeCompanyId]);

  async function generate(template: ReportTemplate) {
    if (!activeCompanyId || !user?.id) return;

    const now = new Date();
    const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const safeOrg = organisationName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'safecloudafrica';
    const metaLines = [
      `Company: ${organisationName}`,
      `Generated by: ${fullName}`,
      `Generated at: ${now.toISOString()}`,
      '',
    ];

    if (template.id === 'compliance') {
      const [incidents, tasks, documents] = await Promise.all([
        listIncidents({ companyId: activeCompanyId, limit: 2000 }),
        listTasks({ companyId: activeCompanyId, limit: 2000 }),
        listDocuments(activeCompanyId)
      ]);

      const rows = [
        ...incidents.map((i) => ({
          record_type: 'incident',
          module: i.module,
          id: i.id,
          title: i.title,
          status: i.status,
          category: i.category,
          severity: i.severity,
          occurred_at: i.occurred_at
        })),
        ...tasks.map((t) => ({
          record_type: 'task',
          module: t.module,
          id: t.id,
          title: t.title,
          status: t.status,
          category: '',
          severity: t.priority,
          occurred_at: t.created_at
        })),
        ...documents.map((d) => ({
          record_type: 'document',
          module: d.module,
          id: d.id,
          title: d.title,
          status: d.status,
          category: d.category,
          severity: '',
          occurred_at: d.updated_at
        }))
      ];

      const csv = toCsv(rows);
      const content = `${metaLines.join('\r\n')}\r\n${csv}`;
      const filename = `${safeOrg}-compliance-${dateStamp}.csv`;
      downloadTextFile(filename, content, 'text/csv;charset=utf-8');

      await createActivityLog({
        companyId: activeCompanyId,
        actorUserId: user.id,
        action: 'reports.generate.compliance',
        entityType: 'report',
        metadata: { filename, format: 'CSV' }
      });
      return;
    }

    if (template.id === 'incidents') {
      const incidents = await listIncidents({ companyId: activeCompanyId, limit: 2000 });
      const csv = toCsv(
        incidents.map((i) => ({
          id: i.id,
          module: i.module,
          category: i.category,
          subcategory: i.subcategory,
          title: i.title,
          status: i.status,
          severity: i.severity,
          occurred_at: i.occurred_at,
          location: i.location ?? ''
        }))
      );
      const content = `${metaLines.join('\r\n')}\r\n${csv}`;
      const filename = `${safeOrg}-incidents-${dateStamp}.csv`;
      downloadTextFile(filename, content, 'text/csv;charset=utf-8');
      await createActivityLog({
        companyId: activeCompanyId,
        actorUserId: user.id,
        action: 'reports.generate.incidents',
        entityType: 'report',
        metadata: { filename, format: 'CSV' }
      });
      return;
    }

    if (template.id === 'training') {
      const [courses, records] = await Promise.all([
        listTrainingCourses(activeCompanyId),
        listTrainingRecords(activeCompanyId, { limit: 5000 })
      ]);
      const courseById = new Map(courses.map((c) => [c.id, c.name]));
      const csv = toCsv(
        records.map((r) => ({
          record_id: r.id,
          user_id: r.user_id,
          course_id: r.course_id,
          course_name: courseById.get(r.course_id) ?? '',
          completed_at: r.completed_at,
          expires_at: r.expires_at ?? '',
          certificate_bucket: r.certificate_bucket ?? '',
          certificate_key: r.certificate_key ?? ''
        }))
      );
      const content = `${metaLines.join('\r\n')}\r\n${csv}`;
      const filename = `${safeOrg}-training-${dateStamp}.csv`;
      downloadTextFile(filename, content, 'text/csv;charset=utf-8');
      await createActivityLog({
        companyId: activeCompanyId,
        actorUserId: user.id,
        action: 'reports.generate.training',
        entityType: 'report',
        metadata: { filename, format: 'CSV' }
      });
      return;
    }

    if (template.id === 'audits') {
      const inspections = await listInspections({ companyId: activeCompanyId, limit: 2000 });
      const allFindings: any[] = [];
      for (const ins of inspections) {
        const findings = await listAuditFindings(activeCompanyId, ins.id, 500);
        for (const f of findings) {
          allFindings.push({ inspection: ins, finding: f });
        }
      }
      const csv = toCsv(
        allFindings.map(({ inspection, finding }) => ({
          inspection_id: inspection.id,
          inspection_title: inspection.title,
          inspection_status: inspection.status,
          inspection_module: inspection.module,
          finding_id: finding.id,
          finding_title: finding.title,
          finding_severity: finding.severity,
          finding_status: finding.status,
          nonconformance: finding.nonconformance,
          finding_created_at: finding.created_at
        }))
      );
      const content = `${metaLines.join('\r\n')}\r\n${csv}`;
      const filename = `${safeOrg}-audits-${dateStamp}.csv`;
      downloadTextFile(filename, content, 'text/csv;charset=utf-8');
      await createActivityLog({
        companyId: activeCompanyId,
        actorUserId: user.id,
        action: 'reports.generate.audits',
        entityType: 'report',
        metadata: { filename, format: 'CSV' }
      });
      return;
    }

    if (template.id === 'inspections') {
      const inspections = await listInspections({ companyId: activeCompanyId, limit: 2000 });
      const rows = inspections.map((i) => ({
        id: i.id,
        module: i.module,
        title: i.title,
        status: i.status,
        scheduled_at: i.scheduled_at,
        completed_at: i.completed_at,
        location: i.location ?? '',
        findings_count: i.findings_count ?? 0,
        nonconformances_count: i.nonconformances_count ?? 0
      }));
      const csv = toCsv(rows);
      const content = `${metaLines.join('\r\n')}\r\n${csv}`;
      const filename = `${safeOrg}-inspections-${dateStamp}.csv`;
      downloadTextFile(filename, content, 'text/csv;charset=utf-8');
      await createActivityLog({
        companyId: activeCompanyId,
        actorUserId: user.id,
        action: 'reports.generate.inspections',
        entityType: 'report',
        metadata: { filename, format: 'CSV' }
      });
      return;
    }

    if (template.id === 'pjo') {
      const pjos = await listPjos({ companyId: activeCompanyId, limit: 1000 });
      const pjoIds = pjos.map((p) => p.id);

      // Fetch all responses for included PJOs
      let responses: any[] = [];
      if (pjoIds.length > 0) {
        const batches: string[][] = [];
        const batchSize = 100;
        for (let i = 0; i < pjoIds.length; i += batchSize) {
          batches.push(pjoIds.slice(i, i + batchSize));
        }

        for (const batch of batches) {
          const { data, error } = await (await import('../api/insforge/client')).insforge.database
            .from('pjo_responses')
            .select('*')
            .eq('company_id', activeCompanyId)
            .in('pjo_id', batch);
          if (error) {
            throw new Error((await import('../api/insforge/errors')).getErrorMessage(error));
          }
          responses = responses.concat(data ?? []);
        }
      }

      const responsesByPjo = new Map<string, any[]>();
      for (const r of responses) {
        const key = String(r.pjo_id);
        const arr = responsesByPjo.get(key) ?? [];
        arr.push(r);
        responsesByPjo.set(key, arr);
      }

      const rows = pjos.flatMap((pjo) => {
        const rList = responsesByPjo.get(pjo.id) ?? [];
        if (rList.length === 0) {
          return [
            {
              pjo_id: pjo.id,
              employee_name: pjo.employee_name,
              job_observed: pjo.job_observed,
              department: pjo.department ?? '',
              site: pjo.site ?? '',
              observed_at: pjo.observed_at,
              status: pjo.status,
              question_no: '',
              question_text: '',
              yes_no: '',
              rating: '',
              deviation: '',
              suggested_corrective_action: '',
              responsible_person: '',
              responsible_department: '',
              corrective_action_implemented: '',
              implemented_at: '',
              category: '',
              ncr_id: ''
            }
          ];
        }

        return rList.map((r) => ({
          pjo_id: pjo.id,
          employee_name: pjo.employee_name,
          job_observed: pjo.job_observed,
          department: pjo.department ?? '',
          site: pjo.site ?? '',
          observed_at: pjo.observed_at,
          status: pjo.status,
          question_no: r.question_no,
          question_text: r.question_text,
          yes_no: r.yes_no === null ? '' : r.yes_no ? 'Yes' : 'No',
          rating: r.rating ?? '',
          deviation: r.deviation ?? '',
          suggested_corrective_action: r.suggested_corrective_action ?? '',
          responsible_person: r.responsible_person ?? '',
          responsible_department: r.responsible_department ?? '',
          corrective_action_implemented: r.corrective_action_implemented ? 'Yes' : 'No',
          implemented_at: r.implemented_at ?? '',
          category: r.category ?? '',
          ncr_id: r.ncr_id ?? ''
        }));
      });

      const csv = toCsv(rows);
      const content = `${metaLines.join('\r\n')}\r\n${csv}`;
      const filename = `${safeOrg}-pjo-${dateStamp}.csv`;
      downloadTextFile(filename, content, 'text/csv;charset=utf-8');
      await createActivityLog({
        companyId: activeCompanyId,
        actorUserId: user.id,
        action: 'reports.generate.pjo',
        entityType: 'report',
        metadata: { filename, format: 'CSV' }
      });
      return;
    }

    // Fallback (should not happen)
    const filename = `${safeOrg}-${template.id}-${dateStamp}.csv`;
    downloadTextFile(filename, `${metaLines.join('\r\n')}\r\n`, 'text/csv;charset=utf-8');
  }

  const recentReports = (recent ?? []).map((r) => ({
    id: r.id,
    name: String(r.action).replace('reports.generate.', '').toUpperCase(),
    generatedDate: r.created_at,
    generatedBy: (user?.email ?? 'User'),
    format: String((r.metadata as any)?.format ?? 'CSV')
  }));

  return (
    <Layout title="Reports & Analytics">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6">

        {/* Report Templates */}
        <motion.div variants={itemVariants}>
          <h2 className="text-lg font-semibold text-charcoal mb-4">
            Generate Report
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {reportTemplates.map((template) =>
            <button
              key={template.id}
              type="button"
              onClick={() => void generate(template)}
              className="flex flex-col items-start gap-3 p-5 bg-white rounded-xl border border-surface-300 shadow-card hover:shadow-card-hover transition-all text-left active:scale-[0.99]">

                <div
                className="p-3 rounded-lg"
                style={{
                  backgroundColor: `${template.color}15`
                }}>

                  <template.icon
                  className="w-6 h-6"
                  style={{
                    color: template.color
                  }} />

                </div>
                <div>
                  <p className="font-medium text-charcoal">{template.name}</p>
                  <p className="text-sm text-charcoal-400 mt-1">
                    {template.description}
                  </p>
                </div>
              </button>
            )}
          </div>
        </motion.div>

        {/* Analytics Charts */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <TrendChart title="Incident Trends" type="line" height={280} data={charts?.incidentTrends ?? []} />
          <TrendChart title="Monthly Comparison" type="bar" height={280} data={charts?.comparison ?? []} />
        </motion.div>

        {/* Recent Reports */}
        <motion.div variants={itemVariants}>
          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200">
              <h3 className="font-semibold text-charcoal">Recent Reports</h3>
            </div>
            <div className="divide-y divide-surface-100">
              {recentLoading && (
                <div className="px-5 py-4">
                  <p className="text-sm text-charcoal-500">Loading recent exports…</p>
                </div>
              )}
              {recentReports.map((report) =>
              <div
                key={report.id}
                className="px-5 py-4 flex items-center justify-between hover:bg-surface-50 transition-colors">

                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-teal-50 rounded-lg">
                      <FileTextIcon className="w-5 h-5 text-teal" />
                    </div>
                    <div>
                      <p className="font-medium text-charcoal">{report.name}</p>
                      <div className="flex items-center gap-3 mt-1 text-sm text-charcoal-400">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-3.5 h-3.5" />
                          {report.generatedDate}
                        </span>
                        <span>•</span>
                        <span>{report.generatedBy}</span>
                        <span className="px-1.5 py-0.5 bg-surface-200 rounded text-xs">
                          {report.format}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button type="button" className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-400 hover:text-teal transition-colors">
                    <DownloadIcon className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Layout>);

}