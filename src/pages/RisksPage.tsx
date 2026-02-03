import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Search, Filter, Loader2 } from 'lucide-react';
import { useUser } from '@insforge/react';
import { useTenant } from '../tenant/TenantContext';
import { listRiskAssessments, createRiskAssessment, listRiskAssessmentItems, type RiskAssessment, type RiskAssessmentItem } from '../api/services/risksService';
import type { UUID } from '../api/models/entities';

export function RisksPage() {
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<RiskAssessment | null>(null);
  const [assessmentItems, setAssessmentItems] = useState<RiskAssessmentItem[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'baseline' | 'task-based'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | RiskAssessment['status']>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadAssessments();
  }, [activeCompanyId]);


  const loadAssessments = async () => {
    if (!activeCompanyId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await listRiskAssessments({ companyId: activeCompanyId, limit: 500 });
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

  const handleCreateAssessment = async (type: 'baseline' | 'task-based') => {
    if (!user?.id) return;
    try {
      const assessment = await createRiskAssessment({
        companyId: activeCompanyId,
        assessmentType: type,
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} Risk Assessment - ${new Date().toLocaleDateString()}`,
        createdByUserId: user.id as UUID
      });
      setAssessments([assessment, ...assessments]);
      setShowCreate(false);
      handleSelectAssessment(assessment);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create assessment');
    }
  };

  const filteredAssessments = assessments.filter(a => {
    if (filterType !== 'all' && a.assessment_type !== filterType) return false;
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (searchTerm && !a.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !a.assessment_number.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

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
      case 'in-progress': return 'bg-blue-100 text-blue-700';
      case 'reviewed': return 'bg-purple-100 text-purple-700';
      case 'approved': return 'bg-green-100 text-green-700';
      case 'closed': return 'bg-gray-200 text-gray-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-orange-600" />
            <h1 className="text-3xl font-bold text-gray-900">Risk Assessments</h1>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Assessment
          </button>
        </div>

        {/* Create Options */}
        {showCreate && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-blue-200">
            <h3 className="font-semibold text-gray-900 mb-4">Select Assessment Type</h3>
            <div className="flex gap-4">
              <button
                onClick={() => handleCreateAssessment('baseline')}
                className="flex-1 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-lg p-4 text-left transition"
              >
                <h4 className="font-semibold text-blue-900 mb-2">Baseline Risk Assessment</h4>
                <p className="text-sm text-blue-700">Company-wide baseline hazards and controls</p>
              </button>
              <button
                onClick={() => handleCreateAssessment('task-based')}
                className="flex-1 bg-green-50 hover:bg-green-100 border border-green-300 rounded-lg p-4 text-left transition"
              >
                <h4 className="font-semibold text-green-900 mb-2">Task-Based Assessment</h4>
                <p className="text-sm text-green-700">Specific task or activity hazard assessment</p>
              </button>
            </div>
            <button
              onClick={() => setShowCreate(false)}
              className="mt-4 text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        )}

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
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="baseline">Baseline</option>
              <option value="task-based">Task-Based</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="in-progress">In Progress</option>
              <option value="reviewed">Reviewed</option>
              <option value="approved">Approved</option>
              <option value="closed">Closed</option>
            </select>
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
                    <button
                      key={assessment.id}
                      onClick={() => handleSelectAssessment(assessment)}
                      className={`w-full text-left p-4 hover:bg-gray-50 transition ${
                        selectedAssessment?.id === assessment.id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 truncate">{assessment.assessment_number}</p>
                          <p className="text-sm text-gray-600 truncate">{assessment.title}</p>
                          <div className="flex gap-2 mt-2">
                            <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(assessment.status)}`}>
                              {assessment.status}
                            </span>
                            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                              {assessment.assessment_type === 'baseline' ? 'Baseline' : 'Task'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Assessment Details */}
          <div className="lg:col-span-2">
            {selectedAssessment ? (
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="font-semibold text-gray-900">{selectedAssessment.title}</h2>
                  <p className="text-sm text-gray-600 mt-1">{selectedAssessment.assessment_number}</p>
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
    </div>
  );
}

