import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, Search, Loader2 } from 'lucide-react';
import { useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-orange-600" />
            <h1 className="text-3xl font-bold text-gray-900">Risk Assessments</h1>
          </div>
          <button
            onClick={() => setShowCreate((s) => !s)}
            disabled={!canCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
            New Assessment
          </button>
        </div>

        {showCreate && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-blue-200">
            <h3 className="font-semibold text-gray-900 mb-4">Select Updated Assessment Type</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CREATE_TYPES.map((entry) => (
                <button
                  key={entry.type}
                  onClick={() => void handleCreateAssessment(entry.type)}
                  className="bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-lg p-4 text-left transition"
                >
                  <h4 className="font-semibold text-blue-900 mb-1">{entry.title}</h4>
                  <p className="text-sm text-blue-700">{entry.blurb}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">{error}</div>}

        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-3">
            <input
              type="text"
              placeholder="Search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-lg">
              <option value="all">All Types</option>
              <option value="baseline">Baseline</option>
              <option value="task">Task</option>
              <option value="critical_task">Critical Task</option>
              <option value="pre_work">Pre-Work Daily</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-lg">
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="in-progress">In Progress</option>
              <option value="review_required">Review Required</option>
              <option value="under_review">Under Review</option>
              <option value="reviewed">Reviewed</option>
              <option value="approved">Approved</option>
              <option value="closed">Closed</option>
            </select>
            <select value={riskLevelFilter} onChange={(e) => setRiskLevelFilter(e.target.value as RiskLevelFilter)} className="px-3 py-2 border border-gray-300 rounded-lg">
              <option value="all">All Risk Levels</option>
              <option value="high">High / Critical</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
              <option value="all">All Months</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Department"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              type="text"
              placeholder="Site"
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Assessments ({filteredAssessments.length})</h2>
              </div>
              <div className="divide-y max-h-[32rem] overflow-y-auto">
                {loading ? (
                  <div className="p-6 text-center">
                    <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
                  </div>
                ) : filteredAssessments.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">No assessments found</div>
                ) : (
                  filteredAssessments.map((assessment) => (
                    <button
                      key={assessment.id}
                      onClick={() => handleSelectAssessment(assessment)}
                      className={`w-full text-left p-4 hover:bg-gray-50 transition ${selectedAssessment?.id === assessment.id ? 'bg-blue-50 border-l-4 border-blue-600' : ''}`}
                    >
                      <p className="font-medium text-gray-900 truncate">{assessment.assessment_number}</p>
                      <p className="text-sm text-gray-600 truncate">{assessment.title}</p>
                      <div className="flex gap-2 mt-2">
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{getAssessmentLabel(assessment)}</span>
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">{assessment.status}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            {selectedAssessment ? (
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="font-semibold text-gray-900">{selectedAssessment.title}</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedAssessment.assessment_number} | {getAssessmentLabel(selectedAssessment)} | {selectedAssessment.status}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Department: {selectedAssessment.process_involved ?? 'N/A'} | Site: {selectedAssessment.location ?? 'N/A'}
                  </p>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-red-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-red-600">{selectedAssessment.high_risks}</p>
                      <p className="text-xs text-red-700 mt-1">High/Critical</p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-yellow-600">{selectedAssessment.medium_risks}</p>
                      <p className="text-xs text-yellow-700 mt-1">Medium</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-600">{selectedAssessment.low_risks}</p>
                      <p className="text-xs text-green-700 mt-1">Low</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-blue-600">{selectedAssessment.total_risks}</p>
                      <p className="text-xs text-blue-700 mt-1">Total</p>
                    </div>
                  </div>

                  <h3 className="font-semibold text-gray-900 mb-4">Risk Items ({assessmentItems.length})</h3>
                  {assessmentItems.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No risk items captured yet.</div>
                  ) : (
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {assessmentItems.map((item) => (
                        <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                          <p className="font-medium text-gray-900">{item.hazard_description}</p>
                          <p className="text-xs text-gray-600 mt-2">
                            Level: {item.risk_level.toUpperCase()} | Rating: {item.risk_rating} | S x L: {item.consequence} x {item.likelihood}
                          </p>
                          {item.existing_controls && <p className="text-xs text-gray-600 mt-1">Controls: {item.existing_controls}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Select an assessment to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
