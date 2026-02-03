import React, { useMemo, useState } from 'react';
import { XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ModuleKey, UUID } from '../../api/models/core';
import { createRisk } from '../../api/services/risksService';

type RiskAssessmentType = 'baseline' | 'task';

export function RiskCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  defaultModule?: ModuleKey;
  onCreated?: () => void;
}) {
  const [assessmentType, setAssessmentType] = useState<RiskAssessmentType>('baseline');
  const [module, setModule] = useState<ModuleKey>(props.defaultModule ?? 'safety');
  const [title, setTitle] = useState('');
  const [hazard, setHazard] = useState('');
  const [controls, setControls] = useState('');
  const [likelihood, setLikelihood] = useState(3);
  const [consequence, setConsequence] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Baseline Risk Assessment fields
  const [area, setArea] = useState('');
  const [activity, setActivity] = useState('');
  const [hazardAspect, setHazardAspect] = useState('');
  const [potentialRisk, setPotentialRisk] = useState('');
  const [riskType, setRiskType] = useState<'Safety' | 'Health' | 'Environmental' | 'Quality' | 'Operational' | 'Financial'>('Safety');
  const [existingControls, setExistingControls] = useState('');
  const [additionalControls, setAdditionalControls] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [completionDate, setCompletionDate] = useState('');

  // Task Risk Assessment fields
  const [taskProcess, setTaskProcess] = useState('');
  const [hazards, setHazards] = useState('');
  const [whoAtRisk, setWhoAtRisk] = useState('');
  const [ppeIssued, setPpeIssued] = useState('');
  const [ppeSize, setPpeSize] = useState('');
  const [ppeDate, setPpeDate] = useState('');
  const [ppeRecipient, setPpeRecipient] = useState('');
  const [ppeSignatures, setPpeSignatures] = useState('');

  const riskRating = useMemo(() => likelihood * consequence, [likelihood, consequence]);
  const riskIndex = useMemo(() => {
    if (riskRating >= 20) return 'Critical';
    if (riskRating >= 12) return 'High';
    if (riskRating >= 6) return 'Medium';
    if (riskRating >= 3) return 'Low';
    return 'Minimal';
  }, [riskRating]);

  const canSubmit = useMemo(() => {
    if (assessmentType === 'baseline') {
      return title.trim().length > 2 && area.trim().length > 0 && activity.trim().length > 0;
    } else {
      return title.trim().length > 2 && taskProcess.trim().length > 0;
    }
  }, [title, assessmentType, area, activity, taskProcess]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);

      // Build comprehensive description with all fields
      const descriptionParts: string[] = [];
      
      if (assessmentType === 'baseline') {
        descriptionParts.push(`Assessment Type: Baseline Risk Assessment`);
        descriptionParts.push(`Area/Location: ${area || 'Not specified'}`);
        descriptionParts.push(`Activity/Process: ${activity || 'Not specified'}`);
        descriptionParts.push(`Hazard/Aspect: ${hazardAspect || hazard || 'Not specified'}`);
        descriptionParts.push(`Potential Risk: ${potentialRisk || 'Not specified'}`);
        descriptionParts.push(`Risk Type: ${riskType}`);
        descriptionParts.push(`Risk Rating: ${riskRating} (${riskIndex})`);
        descriptionParts.push(`Existing Controls: ${existingControls || controls || 'Not specified'}`);
        descriptionParts.push(`Additional Controls: ${additionalControls || 'Not specified'}`);
        descriptionParts.push(`Responsible Person: ${responsiblePerson || 'Not specified'}`);
        if (targetDate) descriptionParts.push(`Target Date: ${targetDate}`);
        if (completionDate) descriptionParts.push(`Completion Date: ${completionDate}`);
      } else {
        descriptionParts.push(`Assessment Type: Task Risk Assessment`);
        descriptionParts.push(`Task/Process: ${taskProcess || 'Not specified'}`);
        descriptionParts.push(`Hazards: ${hazards || hazard || 'Not specified'}`);
        descriptionParts.push(`Who is at Risk: ${whoAtRisk || 'Not specified'}`);
        descriptionParts.push(`Risk Rating: ${riskRating} (${riskIndex})`);
        descriptionParts.push(`Controls: ${controls || 'Not specified'}`);
        if (ppeIssued) {
          descriptionParts.push(`PPE Issued: ${ppeIssued}`);
          if (ppeSize) descriptionParts.push(`PPE Size: ${ppeSize}`);
          if (ppeDate) descriptionParts.push(`PPE Issue Date: ${ppeDate}`);
          if (ppeRecipient) descriptionParts.push(`PPE Recipient: ${ppeRecipient}`);
          if (ppeSignatures) descriptionParts.push(`PPE Signatures: ${ppeSignatures}`);
        }
      }

      const fullDescription = descriptionParts.join('\n\n');

      await createRisk({
        companyId: props.companyId,
        module,
        title: assessmentType === 'baseline' 
          ? `[BASELINE] ${title.trim()}${area ? ` - ${area}` : ''}`
          : `[TASK] ${title.trim()}${taskProcess ? ` - ${taskProcess}` : ''}`,
        description: fullDescription,
        hazard: assessmentType === 'baseline' ? (hazardAspect || hazard) : (hazards || hazard) || undefined,
        controls: assessmentType === 'baseline' ? (existingControls || controls) : controls || undefined,
        likelihood,
        consequence,
        createdByUserId: props.createdByUserId
      });
      props.onCreated?.();
      props.onClose();
      // Reset form
      setTitle('');
      setHazard('');
      setControls('');
      setLikelihood(3);
      setConsequence(3);
      setArea('');
      setActivity('');
      setHazardAspect('');
      setPotentialRisk('');
      setRiskType('Safety');
      setExistingControls('');
      setAdditionalControls('');
      setResponsiblePerson('');
      setTargetDate('');
      setCompletionDate('');
      setTaskProcess('');
      setHazards('');
      setWhoAtRisk('');
      setPpeIssued('');
      setPpeSize('');
      setPpeDate('');
      setPpeRecipient('');
      setPpeSignatures('');
      setAssessmentType('baseline');
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-4xl mx-4 my-8 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-sm font-semibold text-charcoal">New Risk Assessment</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Complete all required fields for {assessmentType === 'baseline' ? 'baseline' : 'task'} risk assessment.</p>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create risk</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          {/* Assessment Type Selection */}
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1.5">Assessment Type *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAssessmentType('baseline')}
                className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  assessmentType === 'baseline'
                    ? 'border-navy bg-navy-50 text-navy'
                    : 'border-surface-300 bg-white text-charcoal hover:bg-surface-50'
                }`}
              >
                Baseline Risk Assessment
              </button>
              <button
                type="button"
                onClick={() => setAssessmentType('task')}
                className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  assessmentType === 'task'
                    ? 'border-navy bg-navy-50 text-navy'
                    : 'border-surface-300 bg-white text-charcoal hover:bg-surface-50'
                }`}
              >
                Task Risk Assessment
              </button>
            </div>
          </div>

          {/* Common Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Module *</label>
              <select
                value={module}
                onChange={(e) => setModule(e.target.value as ModuleKey)}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
              >
                <option value="safety">Safety</option>
                <option value="quality">Quality</option>
                <option value="environment">Environment</option>
                <option value="health">Health</option>
                <option value="legal">Legal</option>
                <option value="hr">HR</option>
                <option value="general">General</option>
                <option value="security">Security</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={assessmentType === 'baseline' ? 'e.g. Warehouse Operations Risk Assessment' : 'e.g. Scaffold Erection Task Risk Assessment'}
                className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
              />
            </div>
          </div>

          {/* Baseline Risk Assessment Fields */}
          {assessmentType === 'baseline' && (
            <>
              <div className="border-t border-surface-200 pt-4">
                <h3 className="text-sm font-semibold text-charcoal mb-3">Baseline Risk Assessment Details</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Area / Location *</label>
                      <input
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                        placeholder="e.g. Warehouse A, Site 3"
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Activity / Process *</label>
                      <input
                        value={activity}
                        onChange={(e) => setActivity(e.target.value)}
                        placeholder="e.g. Material handling, Welding operations"
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Hazard / Aspect</label>
                      <input
                        value={hazardAspect}
                        onChange={(e) => setHazardAspect(e.target.value)}
                        placeholder="Specific hazard or environmental aspect"
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Risk Type</label>
                      <select
                        value={riskType}
                        onChange={(e) => setRiskType(e.target.value as typeof riskType)}
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                      >
                        <option value="Safety">Safety</option>
                        <option value="Health">Health</option>
                        <option value="Environmental">Environmental</option>
                        <option value="Quality">Quality</option>
                        <option value="Operational">Operational</option>
                        <option value="Financial">Financial</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Potential Risk</label>
                    <textarea
                      value={potentialRisk}
                      onChange={(e) => setPotentialRisk(e.target.value)}
                      rows={2}
                      placeholder="Describe the potential risk..."
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Existing Controls</label>
                    <textarea
                      value={existingControls}
                      onChange={(e) => setExistingControls(e.target.value)}
                      rows={3}
                      placeholder="Current controls in place..."
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Additional Controls</label>
                    <textarea
                      value={additionalControls}
                      onChange={(e) => setAdditionalControls(e.target.value)}
                      rows={3}
                      placeholder="Additional controls required..."
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Responsible Person</label>
                      <input
                        value={responsiblePerson}
                        onChange={(e) => setResponsiblePerson(e.target.value)}
                        placeholder="Name/role"
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Target Date</label>
                      <input
                        type="date"
                        value={targetDate}
                        onChange={(e) => setTargetDate(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Completion Date</label>
                      <input
                        type="date"
                        value={completionDate}
                        onChange={(e) => setCompletionDate(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Task Risk Assessment Fields */}
          {assessmentType === 'task' && (
            <>
              <div className="border-t border-surface-200 pt-4">
                <h3 className="text-sm font-semibold text-charcoal mb-3">Task Risk Assessment Details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Task / Process *</label>
                    <input
                      value={taskProcess}
                      onChange={(e) => setTaskProcess(e.target.value)}
                      placeholder="e.g. Scaffold erection, Confined space entry"
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Hazards</label>
                    <textarea
                      value={hazards}
                      onChange={(e) => setHazards(e.target.value)}
                      rows={3}
                      placeholder="Identify all hazards associated with this task..."
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Who is at Risk</label>
                    <textarea
                      value={whoAtRisk}
                      onChange={(e) => setWhoAtRisk(e.target.value)}
                      rows={2}
                      placeholder="Identify personnel, contractors, or public at risk..."
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Controls</label>
                    <textarea
                      value={controls}
                      onChange={(e) => setControls(e.target.value)}
                      rows={3}
                      placeholder="Risk controls and mitigation measures..."
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                    />
                  </div>
                  <div className="border-t border-surface-200 pt-4">
                    <h4 className="text-sm font-semibold text-charcoal mb-3">PPE Issued</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">PPE Type</label>
                        <input
                          value={ppeIssued}
                          onChange={(e) => setPpeIssued(e.target.value)}
                          placeholder="e.g. Hard hat, Safety boots, Gloves"
                          className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Size</label>
                        <input
                          value={ppeSize}
                          onChange={(e) => setPpeSize(e.target.value)}
                          placeholder="e.g. Large, Medium, 42"
                          className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Issue Date</label>
                        <input
                          type="date"
                          value={ppeDate}
                          onChange={(e) => setPpeDate(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Recipient</label>
                        <input
                          value={ppeRecipient}
                          onChange={(e) => setPpeRecipient(e.target.value)}
                          placeholder="Name of recipient"
                          className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Signatures</label>
                        <input
                          value={ppeSignatures}
                          onChange={(e) => setPpeSignatures(e.target.value)}
                          placeholder="Issuer and recipient signatures"
                          className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Risk Rating Section */}
          <div className="border-t border-surface-200 pt-4">
            <h3 className="text-sm font-semibold text-charcoal mb-3">Risk Rating</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Likelihood (1–5) *</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={likelihood}
                  onChange={(e) => setLikelihood(Number(e.target.value))}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Consequence (1–5) *</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={consequence}
                  onChange={(e) => setConsequence(Number(e.target.value))}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                />
              </div>
            </div>
            <div className="mt-4 p-4 bg-surface-50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-charcoal">Risk Rating (S × L):</span>
                <span className="text-lg font-bold text-navy">{riskRating}</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-medium text-charcoal">Risk Index:</span>
                <span className={`text-sm font-semibold ${
                  riskIndex === 'Critical' ? 'text-critical' :
                  riskIndex === 'High' ? 'text-warning' :
                  riskIndex === 'Medium' ? 'text-teal' :
                  'text-success'
                }`}>
                  {riskIndex}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-200">
            <button
              type="button"
              onClick={props.onClose}
              className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-navy-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Save Risk Assessment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
