import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { AlertTriangle, Plus, Search, Loader2 } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import { listRiskAssessments, listRiskAssessmentItems, type RiskAssessment, type RiskAssessmentItem } from '../api/services/risksService';
import type { UUID } from '../api/models/entities';
import { toCsv, downloadTextFile } from '../utils/csv';
import { useIdentity } from '../hooks/useIdentity';
import { exportHighRiskRegisterCSV, downloadFile } from '../api/services/exportService';

const TYPE_OPTIONS = ['all', 'baseline', 'task', 'task-based', 'critical_task', 'pre_work'] as const;
const STATUS_OPTIONS = ['all', 'draft', 'active', 'in-progress', 'review_required', 'under_review', 'reviewed', 'approved', 'closed', 'archived'] as const;

export function RisksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<RiskAssessment | null>(null);
  const [assessmentItems, setAssessmentItems] = useState<RiskAssessmentItem[]>([]);
  const filterType = (searchParams.get('type') as typeof TYPE_OPTIONS[number]) || 'all';
  const filterStatus = (searchParams.get('status') as typeof STATUS_OPTIONS[number]) || 'all';
  const [filterArea, setFilterArea] = useState(searchParams.get('area') || '');
  const [filterActivity, setFilterActivity] = useState(searchParams.get('activity') || '');
  const [fromDate, setFromDate] = useState(searchParams.get('from') || '');
  const [toDate, setToDate] = useState(searchParams.get('to') || '');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const { fullName, organisationName } = useIdentity();

  useEffect(() => {
    loadAssessments();
  }, [activeCompanyId, filterType, filterStatus, filterArea, filterActivity, fromDate, toDate, searchTerm]);

  const loadAssessments = async () => {
    if (!activeCompanyId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await listRiskAssessments({
        companyId: activeCompanyId,
        limit: 500,
        assessmentType: filterType !== 'all' ? filterType : undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined,
        area: filterArea.trim() || undefined,
        activity: filterActivity.trim() || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: searchTerm.trim() || undefined
      });
      setAssessments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load risk assessments');
    } finally {
      setLoading(false);
    }
  };

  const loadAssessmentItems = async (assessmentId: UUID) => {
    try {
      const items = await listRiskAssessmentItems(assessmentId);
      setAssessmentItems(items);
    } catch (e) {
      console.error('Failed to load assessment items:', e);
    }
  };

  const handleSelectAssessment = (assessment: RiskAssessment) => {
    setSelectedAssessment(assessment);
    loadAssessmentItems(assessment.id);
  };

  const applyFilters = () => {
    const p = new URLSearchParams(searchParams);
    if (filterType !== 'all') p.set('type', filterType); else p.delete('type');
    if (filterStatus !== 'all') p.set('status', filterStatus); else p.delete('status');
    if (filterArea.trim()) p.set('area', filterArea.trim()); else p.delete('area');
    if (filterActivity.trim()) p.set('activity', filterActivity.trim()); else p.delete('activity');
    if (fromDate) p.set('from', fromDate); else p.delete('from');
    if (toDate) p.set('to', toDate); else p.delete('to');
    if (searchTerm.trim()) p.set('search', searchTerm.trim()); else p.delete('search');
    setSearchParams(p);
  };

  const filteredAssessments = assessments;

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-700';
      case 'in-progress': case 'active': return 'bg-blue-100 text-blue-700';
      case 'review_required': return 'bg-amber-100 text-amber-800';
      case 'under_review': return 'bg-indigo-100 text-indigo-700';
      case 'reviewed': return 'bg-purple-100 text-purple-700';
      case 'approved': return 'bg-green-100 text-green-700';
      case 'closed': case 'archived': return 'bg-gray-200 text-gray-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getTypeLabel = (type: string) => {
    if (type === 'task-based') return 'Task';
    if (type === 'critical_task') return 'Critical Task';
    if (type === 'pre_work') return 'Pre-work';
    return type ? String(type).replace(/_/g, ' ') : '—';
  };

  const handleExportCsv = () => {
    if (!activeCompanyId || filteredAssessments.length === 0) return;

    const rows = filteredAssessments.map((a) => ({
      assessment_number: a.assessment_number,
      title: a.title,
      type: a.assessment_type,
      status: a.status,
      is_critical: a.is_critical,
      is_prework: a.is_prework,
      review_due_at: a.review_due_at ?? '',
      high_risks: a.high_risks,
      medium_risks: a.medium_risks,
      low_risks: a.low_risks,
      total_risks: a.total_risks,
    }));

    const metaLines = [
      `Company: ${organisationName}`,
      `Generated by: ${fullName}`,
      `Generated at: ${new Date().toISOString()}`,
      '',
    ];

    const csvBody = toCsv(rows);
    const content = `${metaLines.join('\r\n')}\r\n${csvBody}`;
    const safeOrg = organisationName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'safecloudafrica';
    const today = new Date().toISOString().slice(0, 10);
    const filename = `${safeOrg}-risk-assessments-${today}.csv`;

    downloadTextFile(filename, content, 'text/csv;charset=utf-8');
  };

  const handleExportHighRiskRegister = () => {
    if (!activeCompanyId || filteredAssessments.length === 0) return;
    const blob = exportHighRiskRegisterCSV(filteredAssessments);
    const filename = `high-risk-register-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(blob, filename);
  };

  return (
    <Layout title="Risk Assessments">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-orange-600" />
            <h1 className="text-3xl font-bold text-gray-900">Risk Assessments</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={!activeCompanyId || filteredAssessments.length === 0}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Export CSV
            </button>
            <button
              onClick={handleExportHighRiskRegister}
              disabled={!activeCompanyId || filteredAssessments.length === 0}
              className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-4 py-2 rounded-lg text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Export high-risk register
            </button>
            <Link
              to="/risks/new"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              New Assessment
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            {/* Search */}
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search assessments..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set('type', e.target.value); return p; })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t === 'all' ? 'All Types' : getTypeLabel(t)}</option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set('status', e.target.value); return p; })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All Status' : s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Area"
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32"
            />
            <input
              type="text"
              placeholder="Activity"
              value={filterActivity}
              onChange={(e) => setFilterActivity(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32"
            />
            <input
              type="date"
              placeholder="From"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <input
              type="date"
              placeholder="To"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              type="button"
              onClick={applyFilters}
              className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Assessments List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Assessments ({filteredAssessments.length})</h2>
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="p-6 text-center">
                    <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
                  </div>
                ) : filteredAssessments.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    No assessments found
                  </div>
                ) : (
                  filteredAssessments.map(assessment => (
                    <div
                      key={assessment.id}
                      className={`w-full text-left p-4 hover:bg-gray-50 transition border-l-4 ${
                        selectedAssessment?.id === assessment.id ? 'bg-blue-50 border-blue-600' : 'border-transparent'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectAssessment(assessment)}
                        className="w-full text-left"
                      >
                        <p className="font-medium text-gray-900 truncate">{assessment.assessment_number}</p>
                        <p className="text-sm text-gray-600 truncate">{assessment.title}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(assessment.status)}`}>
                            {assessment.status.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                            {getTypeLabel(assessment.assessment_type)}
                          </span>
                          {assessment.is_critical && (
                            <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-semibold">Critical</span>
                          )}
                          {assessment.is_prework && !assessment.is_critical && (
                            <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold">Prework</span>
                          )}
                          {assessment.review_due_at && (
                            <span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">
                              Review due {new Date(assessment.review_due_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </button>
                      <Link
                        to={`/risks/${assessment.id}`}
                        className="mt-2 inline-block text-sm text-blue-600 hover:underline"
                      >
                        View full →
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Assessment Details */}
          <div className="lg:col-span-2">
            {selectedAssessment ? (
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-gray-900">{selectedAssessment.title}</h2>
                    <p className="text-sm text-gray-600 mt-1">{selectedAssessment.assessment_number}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(selectedAssessment.status)}`}>
                        {selectedAssessment.status}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                        {getTypeLabel(selectedAssessment.assessment_type)}
                      </span>
                      {selectedAssessment.is_critical && (
                        <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-semibold">
                          Critical
                        </span>
                      )}
                      {selectedAssessment.is_prework && !selectedAssessment.is_critical && (
                        <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold">
                          Prework
                        </span>
                      )}
                      {selectedAssessment.review_due_at && (
                        <span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">
                          Review due {new Date(selectedAssessment.review_due_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {/* Summary Stats */}
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

                  {/* Details */}
                  <div className="space-y-4 mb-6 pb-6 border-b border-gray-200">
                    {selectedAssessment.description && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Description</p>
                        <p className="text-sm text-gray-600">{selectedAssessment.description}</p>
                      </div>
                    )}
                    {selectedAssessment.scope && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Scope</p>
                        <p className="text-sm text-gray-600">{selectedAssessment.scope}</p>
                      </div>
                    )}
                    {selectedAssessment.objective && (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Objective</p>
                        <p className="text-sm text-gray-600">{selectedAssessment.objective}</p>
                      </div>
                    )}
                  </div>

                  {/* Identified Hazards */}
                  <h3 className="font-semibold text-gray-900 mb-4">Identified Hazards ({assessmentItems.length})</h3>
                  {assessmentItems.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No hazards identified yet. Add items to this assessment to continue.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {assessmentItems.map(item => (
                        <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{item.hazard_description}</p>
                              <div className="flex gap-2 mt-2">
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${getRiskColor(item.risk_level)}`}>
                                  {item.risk_level.toUpperCase()} (L:{item.likelihood} × C:{item.consequence})
                                </span>
                              </div>
                              {item.existing_controls && (
                                <p className="text-xs text-gray-600 mt-2">Controls: {item.existing_controls}</p>
                              )}
                            </div>
                          </div>
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
    </Layout>
  );
}

