import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';
import { useTenant } from '../../tenant/TenantContext';
import { useUser } from '@insforge/react';
import { createRiskAssessment, type AssessmentType } from '../../api/services/risksService';
import type { UUID } from '../../api/models/entities';
import { FileTextIcon, ClipboardListIcon, AlertTriangleIcon, CalendarCheckIcon } from 'lucide-react';

const TYPES: { type: AssessmentType; label: string; description: string; icon: React.ReactNode }[] = [
  { type: 'baseline', label: 'Baseline Risk Assessment', description: 'Company-wide baseline hazards and controls', icon: <FileTextIcon className="w-8 h-8" /> },
  { type: 'task', label: 'Task Risk Assessment', description: 'Specific task or activity hazard assessment', icon: <ClipboardListIcon className="w-8 h-8" /> },
  { type: 'critical_task', label: 'Critical Tasks Risk Assessment', description: 'Critical tasks with inventory and instructions', icon: <AlertTriangleIcon className="w-8 h-8" /> },
  { type: 'pre_work', label: 'Pre-work Risk Assessment', description: 'Daily team-based with signatures', icon: <CalendarCheckIcon className="w-8 h-8" /> }
];

export function RiskAssessmentCreatePage() {
  const navigate = useNavigate();
  const { activeCompanyId } = useTenant();
  const { user } = useUser();
  const [selectedType, setSelectedType] = useState<AssessmentType | null>(null);
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [site, setSite] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!activeCompanyId || !user?.id || !selectedType) return;
    setError(null);
    setLoading(true);
    try {
      const prefix =
        selectedType === 'baseline' ? 'Baseline' :
        selectedType === 'task' ? 'Task' :
        selectedType === 'critical_task' ? 'Critical Task' :
        'Pre-work';
      const assessment = await createRiskAssessment({
        companyId: activeCompanyId,
        assessmentType: selectedType,
        title: title.trim() || `${prefix} Risk Assessment - ${new Date().toLocaleDateString()}`,
        processInvolved: department.trim() || undefined,
        location: site.trim() || undefined,
        createdByUserId: user.id as UUID
      });
      navigate(`/risk-assessments/${assessment.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create assessment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="New Risk Assessment">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">New Risk Assessment</h1>
        <p className="text-gray-600 mb-6">Choose the type of assessment to create.</p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TYPES.map(({ type, label, description, icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              disabled={loading}
              className={`bg-white border-2 rounded-lg p-6 text-left hover:border-blue-500 hover:bg-blue-50/50 transition disabled:opacity-60 ${
                selectedType === type ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200'
              }`}
            >
              <div className="text-blue-600 mb-3">{icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{label}</h3>
              <p className="text-sm text-gray-600">{description}</p>
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="block text-xs text-charcoal-500 mb-1">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Assessment title"
              className="w-full px-3 py-2 border border-surface-300 rounded-lg"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-charcoal-500 mb-1">Department</span>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Department / process"
              className="w-full px-3 py-2 border border-surface-300 rounded-lg"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-charcoal-500 mb-1">Site</span>
            <input
              type="text"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              placeholder="Site / location"
              className="w-full px-3 py-2 border border-surface-300 rounded-lg"
            />
          </label>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading || !selectedType}
            className="px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium disabled:opacity-60"
          >
            {loading ? 'Creating...' : 'Create Assessment'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/risk-assessments')}
            className="text-gray-600 hover:text-gray-900 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </Layout>
  );
}
