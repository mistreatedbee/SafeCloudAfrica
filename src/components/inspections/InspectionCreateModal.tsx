import React, { useMemo, useState } from 'react';
import { XIcon, PlusIcon, TrashIcon, FileIcon, UploadIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ModuleKey, UUID } from '../../api/models/core';
import { createInspection } from '../../api/services/inspectionsService';

type ChecklistQuestion = {
  id: string;
  description: string;
  dateCompleted: string;
  riskRating: 'Low' | 'Medium' | 'High';
  evidenceFiles: File[];
  complianceStatus: 'C' | 'NC';
};

export function InspectionCreateModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  createdByUserId: UUID;
  onCreated?: () => void;
}) {
  const [module, setModule] = useState<ModuleKey>('safety');
  const [checklistName, setChecklistName] = useState('');
  const [frequency, setFrequency] = useState<'Daily' | 'Monthly' | 'Quarterly' | 'Other'>('Monthly');
  const [scheduledAt, setScheduledAt] = useState('');
  const [location, setLocation] = useState('');
  const [questions, setQuestions] = useState<ChecklistQuestion[]>([
    {
      id: '1',
      description: '',
      dateCompleted: '',
      riskRating: 'Low',
      evidenceFiles: [],
      complianceStatus: 'C'
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return checklistName.trim().length > 2 &&
           questions.length > 0 &&
           questions.every(q => q.description.trim().length > 0);
  }, [checklistName, questions]);

  const addQuestion = () => {
    setQuestions(prev => [...prev, {
      id: Date.now().toString(),
      description: '',
      dateCompleted: '',
      riskRating: 'Low',
      evidenceFiles: [],
      complianceStatus: 'C'
    }]);
  };

  const removeQuestion = (id: string) => {
    if (questions.length > 1) {
      setQuestions(prev => prev.filter(q => q.id !== id));
    }
  };

  const updateQuestion = (id: string, field: keyof ChecklistQuestion, value: any) => {
    setQuestions(prev => prev.map(q => 
      q.id === id ? { ...q, [field]: value } : q
    ));
  };

  const handleFileUpload = (questionId: string, files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    setQuestions(prev => prev.map(q => 
      q.id === questionId 
        ? { ...q, evidenceFiles: [...q.evidenceFiles, ...fileArray] }
        : q
    ));
  };

  const removeFile = (questionId: string, fileIndex: number) => {
    setQuestions(prev => prev.map(q => 
      q.id === questionId 
        ? { ...q, evidenceFiles: q.evidenceFiles.filter((_, i) => i !== fileIndex) }
        : q
    ));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      setLoading(true);
      
      // Build description with checklist details
      const descriptionParts: string[] = [];
      descriptionParts.push(`Checklist Name: ${checklistName}`);
      descriptionParts.push(`Frequency: ${frequency}`);
      descriptionParts.push(`\n--- CHECKLIST QUESTIONS ---`);
      
      questions.forEach((q, index) => {
        descriptionParts.push(`\nQuestion ${index + 1}: ${q.description}`);
        descriptionParts.push(`Date Completed: ${q.dateCompleted || 'Not completed'}`);
        descriptionParts.push(`Risk Rating: ${q.riskRating}`);
        descriptionParts.push(`Compliance Status: ${q.complianceStatus} ${q.complianceStatus === 'NC' ? '(Non-Compliant - will escalate to NCR)' : ''}`);
        if (q.evidenceFiles.length > 0) {
          descriptionParts.push(`Evidence Files: ${q.evidenceFiles.length} file(s)`);
          q.evidenceFiles.forEach((f, i) => {
            descriptionParts.push(`  - File ${i + 1}: ${f.name} (${(f.size / 1024).toFixed(2)} KB)`);
          });
        }
      });
      
      const fullDescription = descriptionParts.join('\n');
      const title = `[INSPECTION] ${checklistName}${frequency ? ` (${frequency})` : ''}`;
      
      await createInspection({
        companyId: props.companyId,
        module,
        title,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        location: location.trim() || undefined,
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
    setChecklistName('');
    setFrequency('Monthly');
    setScheduledAt('');
    setLocation('');
    setQuestions([{
      id: '1',
      description: '',
      dateCompleted: '',
      riskRating: 'Low',
      evidenceFiles: [],
      complianceStatus: 'C'
    }]);
    setModule('safety');
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-5xl mx-4 my-8 bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-surface-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-sm font-semibold text-charcoal">Create Inspection Checklist</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Google Forms-style checklist builder. NCs will auto-escalate to NCR.</p>
          </div>
          <button type="button" onClick={props.onClose} className="p-2 rounded-lg hover:bg-surface-100 text-charcoal-500">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-6">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not create inspection</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
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
                <label className="block text-sm font-medium text-charcoal mb-1.5">Checklist Name *</label>
                <input
                  value={checklistName}
                  onChange={(e) => setChecklistName(e.target.value)}
                  placeholder="e.g. Daily Safety Inspection, Monthly Fire Equipment Check"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Frequency *</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as typeof frequency)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                  required
                >
                  <option value="Daily">Daily</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">Scheduled Date</label>
                <input
                  type="date"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-charcoal mb-1.5">Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Site A, Warehouse B"
                  className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Checklist Questions */}
          <div className="border-b border-surface-200 pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-charcoal">Checklist Questions</h3>
              <button
                type="button"
                onClick={addQuestion}
                className="flex items-center gap-2 px-3 py-1.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Add Question
              </button>
            </div>
            <div className="space-y-4">
              {questions.map((question, index) => (
                <div key={question.id} className="border border-surface-200 rounded-lg p-4 bg-surface-50">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-medium text-charcoal">Question {index + 1}</span>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeQuestion(question.id)}
                        className="text-critical hover:text-critical-600"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Description *</label>
                      <textarea
                        value={question.description}
                        onChange={(e) => updateQuestion(question.id, 'description', e.target.value)}
                        rows={2}
                        placeholder="Question description..."
                        className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Date Completed</label>
                        <input
                          type="date"
                          value={question.dateCompleted}
                          onChange={(e) => updateQuestion(question.id, 'dateCompleted', e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Risk Rating</label>
                        <select
                          value={question.riskRating}
                          onChange={(e) => updateQuestion(question.id, 'riskRating', e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">Compliance Status</label>
                        <select
                          value={question.complianceStatus}
                          onChange={(e) => updateQuestion(question.id, 'complianceStatus', e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
                        >
                          <option value="C">C (Compliant)</option>
                          <option value="NC">NC (Non-Compliant)</option>
                        </select>
                        {question.complianceStatus === 'NC' && (
                          <p className="text-xs text-critical mt-1">⚠️ Will auto-escalate to NCR</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">Evidence Upload</label>
                      <input
                        type="file"
                        multiple
                        onChange={(e) => handleFileUpload(question.id, e.target.files)}
                        className="w-full text-sm"
                      />
                      {question.evidenceFiles.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {question.evidenceFiles.map((file, fileIndex) => (
                            <div key={fileIndex} className="flex items-center justify-between p-2 bg-white rounded-lg border border-surface-200">
                              <div className="flex items-center gap-2">
                                <FileIcon className="w-4 h-4 text-charcoal-400" />
                                <span className="text-sm text-charcoal-600">{file.name}</span>
                                <span className="text-xs text-charcoal-400">({(file.size / 1024).toFixed(2)} KB)</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFile(question.id, fileIndex)}
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
                </div>
              ))}
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <LoadingSpinner size={16} />}
              Create Inspection
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

