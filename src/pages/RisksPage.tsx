import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangleIcon, PlusIcon, SearchIcon, Loader2Icon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import { Layout } from '../components/layout/Layout';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  createRiskAssessment,
  listRiskAssessments,
  listRiskAssessmentItems,
  type AssessmentType,
  type RiskAssessment,
  type RiskAssessmentItem,
  getAssessmentLabel
} from '../api/services/risksService';
import type { UUID } from '../api/models/entities';

const CREATE_TYPES: Array<{ type: AssessmentType; title: string; blurb: string }> = [
  { type: 'baseline', title: 'Baseline Risk Assessment', blurb: 'Area, hazards, controls, revised risk, owners and dates.' },
  { type: 'task', title: 'Task Risk Assessment', blurb: 'Task-level hazard/risk with assessor, review cycle and assignment.' },
  { type: 'critical_task', title: 'Critical Task Risk Assessment', blurb: 'Critical process/task with inventory/instruction and risk index.' },
  { type: 'pre_work', title: 'Pre-Work Risk Assessment (Daily)', blurb: 'Daily hazards, controls, signatures and supervisor sign-off.' }
];

type RiskLevelFilter = 'all' | 'low' | 'medium' | 'high' | 'critical';
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export function RisksPage() {
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<RiskAssessment | null>(null);
  const [assessmentItems, setAssessmentItems] = useState<RiskAssessmentItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<'all' | AssessmentType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | RiskAssessment['status']>('all');
  const [riskLevelFilter, setRiskLevelFilter] = useState<RiskLevelFilter>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const canCreate =
    activeRole === 'owner' ||
    activeRole === 'admin' ||
    activeRole === 'manager' ||
    activeRole === 'supervisor' ||
    activeRole === 'consultant';

  useEffect(() => {
    void loadAssessments();
  }, [activeCompanyId]);

  async function loadAssessments() {
    if (!activeCompanyId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await listRiskAssessments({ companyId: activeCompanyId, limit: 500 });
      setAssessments(data);
      if (selectedAssessment) {
        const refreshed = data.find((r) => r.id === selectedAssessment.id) ?? null;
        setSelectedAssessment(refreshed);
        if (refreshed) void loadAssessmentItems(refreshed.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load risk assessments');
    } finally {
      setLoading(false);
    }
  }

  async function loadAssessmentItems(assessmentId: UUID) {
    try {
      const items = await listRiskAssessmentItems(assessmentId);
      setAssessmentItems(items);
    } catch {
      setAssessmentItems([]);
    }
  }

  function handleSelectAssessment(assessment: RiskAssessment) {
    setSelectedAssessment(assessment);
    void loadAssessmentItems(assessment.id);
  }

  async function handleCreateAssessment(type: AssessmentType) {
    if (!activeCompanyId || !user?.id || !canCreate) return;
    try {
      const created = await createRiskAssessment({
        companyId: activeCompanyId,
        assessmentType: type,
        title: `${CREATE_TYPES.find((t) => t.type === type)?.title ?? 'Risk Assessment'} - ${new Date().toLocaleDateString()}`,
        processInvolved: departmentFilter.trim() || undefined,
        location: siteFilter.trim() || undefined,
        createdByUserId: user.id as UUID
      });
      setAssessments((prev) => [created, ...prev]);
      setShowCreate(false);
      handleSelectAssessment(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create assessment');
    }
  }

  const filteredAssessments = useMemo(() => {
    return assessments.filter((a) => {
      const label = getAssessmentLabel(a).toLowerCase();
      if (typeFilter !== 'all') {
        if (typeFilter === 'baseline' && label !== 'baseline') return false;
        if (typeFilter === 'task' && label !== 'task') return false;
        if (typeFilter === 'critical_task' && label !== 'critical task') return false;
        if (typeFilter === 'pre_work' && label !== 'pre-work') return false;
      }
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (monthFilter !== 'all') {
        const m = new Date(a.created_at).toISOString().slice(0, 7);
        if (m !== monthFilter) return false;
      }
      if (departmentFilter.trim() && !(a.process_involved ?? '').toLowerCase().includes(departmentFilter.toLowerCase())) {
        return false;
      }
      if (siteFilter.trim() && !(a.location ?? '').toLowerCase().includes(siteFilter.toLowerCase())) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const text = `${a.title} ${a.assessment_number} ${a.location ?? ''} ${a.process_involved ?? ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (riskLevelFilter !== 'all') {
        if (riskLevelFilter === 'high' || riskLevelFilter === 'critical') {
          if ((a.high_risks ?? 0) < 1) return false;
        }
        if (riskLevelFilter === 'medium') {
          if ((a.medium_risks ?? 0) < 1) return false;
        }
        if (riskLevelFilter === 'low') {
          if ((a.low_risks ?? 0) < 1) return false;
        }
      }
      return true;
    });
  }, [assessments, departmentFilter, monthFilter, riskLevelFilter, searchTerm, siteFilter, statusFilter, typeFilter]);

  const monthOptions = useMemo(() => {
    return Array.from(new Set(assessments.map((a) => new Date(a.created_at).toISOString().slice(0, 7)))).sort().reverse();
  }, [assessments]);

  return (
    <Layout title="Risk Assessments">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangleIcon className="w-7 h-7 text-warning" />
            <div>
              <h1 className="text-2xl font-bold text-charcoal">Risk Assessments</h1>
              <p className="text-sm text-charcoal-500">Updated baseline, task, critical-task and pre-work forms.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            disabled={!canCreate}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-4 h-4" />
            New Assessment
          </button>
        </motion.div>

        {showCreate && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 p-5 shadow-card">
            <h3 className="font-semibold text-charcoal mb-4">Select Assessment Type</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CREATE_TYPES.map((entry) => (
                <button
                  key={entry.type}
                  type="button"
                  onClick={() => void handleCreateAssessment(entry.type)}
                  className="text-left rounded-xl border border-surface-300 bg-surface-50 hover:bg-surface-100 p-4 transition-colors"
                >
                  <p className="font-semibold text-charcoal">{entry.title}</p>
                  <p className="text-sm text-charcoal-500 mt-1">{entry.blurb}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {error && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Unable to load risk assessments</p>
            <p className="text-sm text-charcoal-500 mt-1">{error}</p>
          </motion.div>
        )}

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                type="text"
                placeholder="Search assessments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="all">All Types</option>
              <option value="baseline">Baseline</option>
              <option value="task">Task</option>
              <option value="critical_task">Critical Task</option>
              <option value="pre_work">Pre-Work</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="in-progress">In Progress</option>
              <option value="review_required">Review Required</option>
              <option value="under_review">Under Review</option>
              <option value="reviewed">Reviewed</option>
              <option value="approved">Approved</option>
              <option value="closed">Closed</option>
            </select>
            <select
              value={riskLevelFilter}
              onChange={(e) => setRiskLevelFilter(e.target.value as RiskLevelFilter)}
              className="px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="all">All Risk Levels</option>
              <option value="high">High / Critical</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="all">All Months</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Filter department"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <input
              type="text"
              placeholder="Filter site"
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
                <h2 className="font-semibold text-charcoal">Assessments</h2>
                <span className="text-sm text-charcoal-400">{filteredAssessments.length}</span>
              </div>
              <div className="divide-y max-h-[32rem] overflow-y-auto">
                {loading ? (
                  <div className="p-6 text-center">
                    <Loader2Icon className="w-8 h-8 text-charcoal-400 animate-spin mx-auto" />
                  </div>
                ) : filteredAssessments.length === 0 ? (
                  <div className="p-6 text-center text-sm text-charcoal-500">No assessments found.</div>
                ) : (
                  filteredAssessments.map((assessment) => (
                    <button
                      key={assessment.id}
                      type="button"
                      onClick={() => handleSelectAssessment(assessment)}
                      className={`w-full text-left p-4 transition-colors hover:bg-surface-50 ${
                        selectedAssessment?.id === assessment.id ? 'bg-teal/10 border-l-4 border-teal' : ''
                      }`}
                    >
                      <p className="font-medium text-charcoal truncate">{assessment.assessment_number}</p>
                      <p className="text-sm text-charcoal-500 truncate mt-0.5">{assessment.title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-1 rounded bg-surface-100 text-charcoal-600">{getAssessmentLabel(assessment)}</span>
                        <StatusBadge status={assessment.status as any} size="sm" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            {selectedAssessment ? (
              <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-200 bg-surface-50">
                  <h2 className="font-semibold text-charcoal">{selectedAssessment.title}</h2>
                  <p className="text-sm text-charcoal-500 mt-1">
                    {selectedAssessment.assessment_number} • {getAssessmentLabel(selectedAssessment)}
                  </p>
                  <p className="text-xs text-charcoal-500 mt-1">
                    Department: {selectedAssessment.process_involved ?? 'N/A'} • Site: {selectedAssessment.location ?? 'N/A'}
                  </p>
                </div>
                <div className="p-5 space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-critical/10 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold text-critical">{selectedAssessment.high_risks}</p>
                      <p className="text-xs text-charcoal-500 mt-1">High/Critical</p>
                    </div>
                    <div className="bg-warning/10 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold text-warning">{selectedAssessment.medium_risks}</p>
                      <p className="text-xs text-charcoal-500 mt-1">Medium</p>
                    </div>
                    <div className="bg-success/10 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold text-success">{selectedAssessment.low_risks}</p>
                      <p className="text-xs text-charcoal-500 mt-1">Low</p>
                    </div>
                    <div className="bg-teal/10 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold text-teal">{selectedAssessment.total_risks}</p>
                      <p className="text-xs text-charcoal-500 mt-1">Total</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-charcoal mb-3">Risk Items ({assessmentItems.length})</h3>
                    {assessmentItems.length === 0 ? (
                      <div className="bg-surface-50 border border-surface-200 rounded-xl p-6 text-center text-sm text-charcoal-500">
                        No risk items captured yet.
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {assessmentItems.map((item) => (
                          <div key={item.id} className="border border-surface-300 rounded-xl p-4">
                            <p className="font-medium text-charcoal">{item.hazard_description}</p>
                            <p className="text-xs text-charcoal-500 mt-2">
                              Level: {item.risk_level.toUpperCase()} • Rating: {item.risk_rating} • S x L: {item.consequence} x {item.likelihood}
                            </p>
                            {item.existing_controls && (
                              <p className="text-xs text-charcoal-500 mt-1">Controls: {item.existing_controls}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-surface-300 p-12 text-center shadow-card">
                <AlertTriangleIcon className="w-12 h-12 text-charcoal-300 mx-auto mb-3" />
                <p className="text-sm text-charcoal-500">Select an assessment to view details.</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}
