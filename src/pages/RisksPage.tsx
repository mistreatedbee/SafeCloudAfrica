import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangleIcon, Loader2Icon, PlusIcon, SearchIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useTenant } from '../tenant/TenantContext';
import { getAssessmentLabel, listRiskAssessments, type AssessmentType, type RiskAssessment } from '../api/services/risksService';

type RiskLevelFilter = 'all' | 'low' | 'medium' | 'high';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

function formatDate(dateValue: string): string {
  return new Date(dateValue).toLocaleDateString();
}

function inferRowRiskLevel(assessment: RiskAssessment): 'low' | 'medium' | 'high' {
  if ((assessment.high_risks ?? 0) > 0) return 'high';
  if ((assessment.medium_risks ?? 0) > 0) return 'medium';
  return 'low';
}

export function RisksPage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | AssessmentType>('all');
  const [riskLevelFilter, setRiskLevelFilter] = useState<RiskLevelFilter>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | RiskAssessment['status']>('all');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
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
    } catch (e) {
      console.error('Failed to load risk assessments:', e);
      setError(e instanceof Error ? e.message : 'Failed to load risk assessments');
    } finally {
      setLoading(false);
    }
  }

  const filteredAssessments = useMemo(() => {
    return assessments.filter((assessment) => {
      const assessmentLabel = getAssessmentLabel(assessment).toLowerCase();

      if (typeFilter !== 'all') {
        if (typeFilter === 'baseline' && assessmentLabel !== 'baseline') return false;
        if (typeFilter === 'task' && assessmentLabel !== 'task') return false;
        if (typeFilter === 'critical_task' && assessmentLabel !== 'critical task') return false;
        if (typeFilter === 'pre_work' && assessmentLabel !== 'pre-work') return false;
      }

      if (statusFilter !== 'all' && assessment.status !== statusFilter) return false;

      if (riskLevelFilter !== 'all' && inferRowRiskLevel(assessment) !== riskLevelFilter) return false;

      if (departmentFilter.trim()) {
        const process = (assessment.process_involved ?? '').toLowerCase();
        if (!process.includes(departmentFilter.toLowerCase())) return false;
      }

      if (siteFilter.trim()) {
        const location = (assessment.location ?? '').toLowerCase();
        if (!location.includes(siteFilter.toLowerCase())) return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const haystack = `${assessment.title} ${assessment.assessment_number} ${assessment.location ?? ''} ${assessment.process_involved ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (fromDate) {
        const createdDate = new Date(assessment.created_at).toISOString().slice(0, 10);
        if (createdDate < fromDate) return false;
      }

      if (toDate) {
        const createdDate = new Date(assessment.created_at).toISOString().slice(0, 10);
        if (createdDate > toDate) return false;
      }

      return true;
    });
  }, [assessments, departmentFilter, fromDate, riskLevelFilter, searchTerm, siteFilter, statusFilter, toDate, typeFilter]);

  return (
    <Layout title="Risk Assessments">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangleIcon className="w-7 h-7 text-warning" />
            <div>
              <h1 className="text-2xl font-bold text-charcoal">Risk Assessments</h1>
              <p className="text-sm text-charcoal-500">Baseline, task, critical task, and pre-work assessments.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/risk-assessments/new')}
            disabled={!canCreate}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-4 h-4" />
            New Assessment
          </button>
        </motion.div>

        {error && (
          <motion.div variants={itemVariants} className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
            <p className="text-sm font-semibold text-critical">Unable to load risk assessments</p>
            <p className="text-sm text-charcoal-500 mt-1">{error}</p>
          </motion.div>
        )}

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 p-4 shadow-card">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative lg:col-span-2">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                type="text"
                placeholder="Search title, number, site, department"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | AssessmentType)}
              className="px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="all">All Types</option>
              <option value="baseline">Baseline</option>
              <option value="task">Task</option>
              <option value="critical_task">Critical Task</option>
              <option value="pre_work">Pre-Work</option>
            </select>
            <input
              type="text"
              placeholder="Site"
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <input
              type="text"
              placeholder="Department"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <select
              value={riskLevelFilter}
              onChange={(e) => setRiskLevelFilter(e.target.value as RiskLevelFilter)}
              className="px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="all">All Risk Levels</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | RiskAssessment['status'])}
              className="px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="in-progress">In Progress</option>
              <option value="review_required">Review Required</option>
              <option value="under_review">Under Review</option>
              <option value="reviewed">Reviewed</option>
              <option value="approved">Approved</option>
              <option value="closed">Closed</option>
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2.5 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <h2 className="font-semibold text-charcoal">Assessments</h2>
            <span className="text-sm text-charcoal-400">{filteredAssessments.length}</span>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center">
                <Loader2Icon className="w-8 h-8 text-charcoal-400 animate-spin mx-auto" />
              </div>
            ) : filteredAssessments.length === 0 ? (
              <div className="p-8 text-sm text-charcoal-500 text-center">No assessments found.</div>
            ) : (
              <table className="min-w-full divide-y divide-surface-200">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Site / Department</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Risk Level</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Last Updated</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200">
                  {filteredAssessments.map((assessment) => {
                    const level = inferRowRiskLevel(assessment);
                    return (
                      <tr
                        key={assessment.id}
                        onClick={() => navigate(`/risk-assessments/${assessment.id}`)}
                        className="cursor-pointer hover:bg-surface-50"
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-charcoal">{assessment.title || assessment.assessment_number}</p>
                          <p className="text-xs text-charcoal-500 mt-0.5">{assessment.assessment_number}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-charcoal">{getAssessmentLabel(assessment)}</td>
                        <td className="px-4 py-3 text-sm text-charcoal">
                          <p>{assessment.location ?? 'N/A'}</p>
                          <p className="text-xs text-charcoal-500 mt-0.5">{assessment.process_involved ?? 'N/A'}</p>
                        </td>
                        <td className="px-4 py-3 text-sm capitalize">
                          <span className={level === 'high' ? 'text-critical' : level === 'medium' ? 'text-warning' : 'text-success'}>
                            {level}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-charcoal">{formatDate(assessment.updated_at)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={assessment.status as never} size="sm" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>
      </motion.div>
    </Layout>
  );
}
