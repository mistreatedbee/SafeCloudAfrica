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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (type: AssessmentType) => {
    if (!activeCompanyId || !user?.id) return;
    setError(null);
    setLoading(true);
    try {
      const prefix = type === 'baseline' ? 'Baseline' : type === 'task' ? 'Task' : type === 'critical_task' ? 'Critical Task' : 'Pre-work';
      const assessment = await createRiskAssessment({
        companyId: activeCompanyId,
        assessmentType: type,
        title: `${prefix} Risk Assessment - ${new Date().toLocaleDateString()}`,
        createdByUserId: user.id as UUID
      });
      navigate(`/risks/${assessment.id}`);
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
              onClick={() => handleCreate(type)}
              disabled={loading}
              className="bg-white border-2 rounded-lg p-6 text-left hover:border-blue-500 hover:bg-blue-50/50 transition disabled:opacity-60 border-gray-200"
            >
              <div className="text-blue-600 mb-3">{icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{label}</h3>
              <p className="text-sm text-gray-600">{description}</p>
            </button>
          ))}
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => navigate('/risks')}
            className="text-gray-600 hover:text-gray-900 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </Layout>
  );
}
