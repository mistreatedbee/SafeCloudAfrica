import React, { useMemo, useState } from 'react';
import { XIcon, FileIcon, UploadIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ModuleKey, Severity, UUID } from '../../api/models/core';
import { createTask } from '../../api/services/tasksService';

type TaskType = 'general' | 'corrective_action';

export function TaskCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  defaultModule?: ModuleKey;
  isCorrectiveAction?: boolean;
  linkedSource?: { type: string; id?: string };
  onCreated?: () => void;
}) {
  const [taskType, setTaskType] = useState<TaskType>(props.isCorrectiveAction ? 'corrective_action' : 'general');
  const [module, setModule] = useState<ModuleKey>(props.defaultModule ?? 'safety');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Severity>('medium');
  const [dueAt, setDueAt] = useState('');
  
  // Corrective Action specific fields
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [reviewerAuthoriser, setReviewerAuthoriser] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [effectivenessConfirmed, setEffectivenessConfirmed] = useState(false);
  const [signedOff, setSignedOff] = useState(false);
  const [signedOffBy, setSignedOffBy] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const basicValid = title.trim().length > 2;
    if (taskType === 'corrective_action') {
      return basicValid && 
             responsiblePerson.trim().length > 0 &&
             reviewerAuthoriser.trim().length > 0;
    }
    return basicValid;
  }, [title, taskType, responsiblePerson, reviewerAuthoriser]);

  const canClose = useMemo(() => {
    if (taskType !== 'corrective_action') return true;
    return effectivenessConfirmed && signedOff && signedOffBy.trim().length > 0;
  }, [taskType, effectivenessConfirmed, signedOff, signedOffBy]);

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    setEvidenceFiles(prev => [...prev, ...fileArray]);
  };

  const removeFile = (index: number) => {
    setEvidenceFiles(prev => prev.filter((_, i) => i !== index));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      
      // Build comprehensive description
      const descriptionParts: string[] = [];
      if (description) descriptionParts.push(description);
      
      if (taskType === 'corrective_action') {
        descriptionParts.push('\n--- CORRECTIVE ACTION DETAILS ---');
        descriptionParts.push(`Task Type: Corrective Action`);
        descriptionParts.push(`Responsible Person: ${responsiblePerson}`);
        descriptionParts.push(`Reviewer / Authoriser: ${reviewerAuthoriser}`);
        if (props.linkedSource) {
          descriptionParts.push(`Linked Source: ${props.linkedSource.type}${props.linkedSource.id ? ` (ID: ${props.linkedSource.id})` : ''}`);
        }
        if (evidenceFiles.length > 0) {
          descriptionParts.push(`\nEvidence Files: ${evidenceFiles.length} file(s) uploaded`);
          evidenceFiles.forEach((f, i) => {
            descriptionParts.push(`  - File ${i + 1}: ${f.name} (${(f.size / 1024).toFixed(2)} KB)`);
          });
        }
        descriptionParts.push(`\n--- CLOSURE CONDITIONS ---`);
        descriptionParts.push(`Effectiveness Confirmed: ${effectivenessConfirmed ? 'Yes' : 'No'}`);
        descriptionParts.push(`Signed Off: ${signedOff ? 'Yes' : 'No'}`);
        if (signedOffBy) descriptionParts.push(`Signed Off By: ${signedOffBy}`);
        descriptionParts.push(`\n⚠️ Task can only be closed when: Task completed, Evidence attached, Effectiveness confirmed, Signed off by authority`);
      }

      const fullDescription = descriptionParts.join('\n\n');
      const taskTitle = taskType === 'corrective_action' ? `[CAPA] ${title.trim()}` : title.trim();

      await createTask({
        companyId: props.companyId,
        module,
        title: taskTitle,
        description: fullDescription || undefined,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        createdByUserId: props.createdByUserId
      });
      
      props.onCreated?.();
      props.onClose();
      resetForm();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setTaskType(props.isCorrectiveAction ? 'corrective_action' : 'general');
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDueAt('');
    setResponsiblePerson('');
    setReviewerAuthoriser('');
    setEvidenceFiles([]);
    setEffectivenessConfirmed(false);
    setSignedOff(false);
    setSignedOffBy('');
    setModule(props.defaultModule ?? 'safety');
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-4xl mx-4 my-8 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-sm font-semibold text-charcoal">
              {taskType === 'corrective_action' ? 'Create Corrective Action' : 'Create Task'}
            </p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              {taskType === 'corrective_action' 
                ? 'All corrective actions funnel into the global task manager. System will send reminders and escalate if overdue.'
                : 'Tasks are company-wide and appear immediately.'}
            </p>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-6">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create task</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          {/* Task Type Selection */}
          {!props.isCorrectiveAction && (
            <div>
              <label className="block text-sm font-medium text-charcoal mb-1.5">Task Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTaskType('general')}
                  className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    taskType === 'general'
                      ? 'border-teal bg-teal-50 text-teal'
                      : 'border-surface-300 bg-white text-charcoal hover:bg-surface-50'
                  }`}
                >
                  General Task
                </button>
                <button
                  type="button"
                  onClick={() => setTaskType('corrective_action')}
                  className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    taskType === 'corrective_action'
                      ? 'border-teal bg-teal-50 text-teal'
                      : 'border-surface-300 bg-white text-charcoal hover:bg-surface-50'
                  }`}
                >
                  Corrective Action
                </button>
              </div>
            </div>
          )}

          {/* Basic Information */}
          <div className="border-b border-surface-200 pb-4">
            <h3 className="text-sm font-semibold text-charcoal mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Module</label>
                <select
                  value={module}
                  onChange={(e) => setModule(e.target.value as ModuleKey)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
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
                <label className="block text-sm font-medium text-charcoal mb-1.5">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Severity)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={taskType === 'corrective_action' ? 'e.g. Corrective action for incident INC-12345' : 'e.g. Monthly safety inspection'}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Due Date</label>
                <input
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
                {dueAt && taskType === 'corrective_action' && (
                  <p className="text-xs text-charcoal-500 mt-1">
                    ⚠️ System will send reminders and flag as overdue if not completed by this date
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="border-b border-surface-200 pb-4">
            <label className="block text-sm font-medium text-charcoal mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What needs to be done and by when…"
              className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>

          {/* Corrective Action Specific Fields */}
          {taskType === 'corrective_action' && (
            <>
              <div className="border-b border-surface-200 pb-4">
                <h3 className="text-sm font-semibold text-charcoal mb-4">Corrective Action Details</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Responsible Person *</label>
                      <input
                        value={responsiblePerson}
                        onChange={(e) => setResponsiblePerson(e.target.value)}
                        placeholder="Name of person responsible"
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Reviewer / Authoriser *</label>
                      <input
                        value={reviewerAuthoriser}
                        onChange={(e) => setReviewerAuthoriser(e.target.value)}
                        placeholder="Name of reviewer/authoriser"
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        required
                      />
                    </div>
                  </div>
                  {props.linkedSource && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-charcoal">Linked Source</p>
                      <p className="text-xs text-charcoal-600 mt-1">
                        {props.linkedSource.type}: {props.linkedSource.id || 'N/A'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Evidence Upload */}
              <div className="border-b border-surface-200 pb-4">
                <h3 className="text-sm font-semibold text-charcoal mb-4">Evidence Upload</h3>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Upload Evidence Files</label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => handleFileUpload(e.target.files)}
                    className="w-full text-sm"
                  />
                  {evidenceFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {evidenceFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-surface-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <FileIcon className="w-4 h-4 text-charcoal-400" />
                            <span className="text-sm text-charcoal-600">{file.name}</span>
                            <span className="text-xs text-charcoal-400">({(file.size / 1024).toFixed(2)} KB)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="text-xs text-critical hover:text-critical-600"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Closure Conditions */}
              <div className="border-b border-surface-200 pb-4">
                <h3 className="text-sm font-semibold text-charcoal mb-4">Closure Conditions</h3>
                <p className="text-xs text-charcoal-500 mb-4">
                  Before closing, system must verify: Task completed, Evidence attached, Effectiveness confirmed, Signed off by authority
                </p>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 border border-surface-200 rounded-lg hover:bg-surface-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={effectivenessConfirmed}
                      onChange={(e) => setEffectivenessConfirmed(e.target.checked)}
                      className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                    />
                    <span className="text-sm text-charcoal">Effectiveness Confirmed</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 border border-surface-200 rounded-lg hover:bg-surface-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={signedOff}
                      onChange={(e) => setSignedOff(e.target.checked)}
                      className="w-4 h-4 text-teal border-surface-300 rounded focus:ring-teal"
                    />
                    <span className="text-sm text-charcoal">Signed Off</span>
                  </label>
                  {signedOff && (
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Signed Off By *</label>
                      <input
                        value={signedOffBy}
                        onChange={(e) => setSignedOffBy(e.target.value)}
                        placeholder="Name and role of signatory"
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        required={signedOff}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* System Automation Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-charcoal mb-2">System Automation</h4>
                <ul className="text-xs text-charcoal-600 space-y-1">
                  <li>• System will automatically send reminders before due date</li>
                  <li>• Tasks will be flagged as overdue if past due date</li>
                  <li>• High-risk delays will be escalated to management</li>
                  <li>• Task can only be closed when all closure conditions are met</li>
                </ul>
              </div>
            </>
          )}

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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              {taskType === 'corrective_action' ? 'Create Corrective Action' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
