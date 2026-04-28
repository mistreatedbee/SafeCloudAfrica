import React, { useEffect, useMemo, useState } from 'react';
import { FolderPlusIcon, XIcon } from 'lucide-react';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { formatAuthError } from '../../auth/authMessages';
import type { ModuleKey, UUID } from '../../api/models/core';
import type { DocumentFolder } from '../../api/models/entities';
import { createDocumentWithInitialVersion } from '../../api/services/documentsService';
import { createDocumentFolder } from '../../api/services/documentFoldersService';
import { uploadDocumentFile } from '../../api/services/documentsStorageService';
import { DOCUMENT_CATEGORIES_BY_MODULE } from '../../constants/documentCategories';

type FolderOption = {
  id: UUID;
  label: string;
  isRestricted: boolean;
};

function folderLabel(folder: DocumentFolder, byId: Map<string, DocumentFolder>): string {
  const parts = [folder.name];
  let cursor = folder.parent_id ? byId.get(String(folder.parent_id)) ?? null : null;
  while (cursor) {
    parts.unshift(cursor.name);
    cursor = cursor.parent_id ? byId.get(String(cursor.parent_id)) ?? null : null;
  }
  return parts.join(' / ');
}

export function DocumentUploadModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  actorUserId: UUID;
  canManageRestricted?: boolean;
  folders?: DocumentFolder[];
  defaultFolderId?: UUID | null;
  onUploaded?: () => void;
  onFoldersChanged?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [module, setModule] = useState<ModuleKey>('safety');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryPreset, setCategoryPreset] = useState('Policies');
  const [categoryCustom, setCategoryCustom] = useState('');
  const [folderId, setFolderId] = useState<UUID | ''>(() => (props.defaultFolderId ? props.defaultFolderId : ''));
  const [effectiveDate, setEffectiveDate] = useState('');
  const [documentOwnerName, setDocumentOwnerName] = useState('');
  const [approvingOfficerName, setApprovingOfficerName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [revisionNumber, setRevisionNumber] = useState('');
  const [revisionDate, setRevisionDate] = useState('');
  const [approvedDate, setApprovedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const [restrictionTouched, setRestrictionTouched] = useState(false);
  const [extraFolders, setExtraFolders] = useState<DocumentFolder[]>([]);
  const [showFolderCreate, setShowFolderCreate] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<UUID | ''>('');
  const [newFolderRestricted, setNewFolderRestricted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggested = useMemo(() => DOCUMENT_CATEGORIES_BY_MODULE[module] ?? ['Other'], [module]);
  const category = useMemo(() => {
    const preset = categoryPreset.trim();
    if (preset && preset.toLowerCase() !== 'other') return preset;
    return categoryCustom.trim();
  }, [categoryCustom, categoryPreset]);

  const allFolders = useMemo(() => {
    const merged = [...(props.folders ?? [])];
    for (const folder of extraFolders) {
      if (!merged.some((existing) => existing.id === folder.id)) merged.push(folder);
    }
    return merged;
  }, [extraFolders, props.folders]);

  const folderOptions = useMemo<FolderOption[]>(() => {
    const relevant = allFolders.filter((folder) => folder.company_id === props.companyId && folder.module === module);
    const byId = new Map(relevant.map((folder) => [String(folder.id), folder]));
    return relevant
      .slice()
      .sort((left, right) => folderLabel(left, byId).localeCompare(folderLabel(right, byId)))
      .map((folder) => ({
        id: folder.id,
        label: folderLabel(folder, byId),
        isRestricted: Boolean(folder.is_restricted)
      }));
  }, [allFolders, module, props.companyId]);

  const selectedFolder = useMemo(
    () => folderOptions.find((folder) => folder.id === folderId) ?? null,
    [folderId, folderOptions]
  );

  useEffect(() => {
    if (!props.open) return;
    setExtraFolders([]);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    if (!restrictionTouched) {
      setIsRestricted(Boolean(selectedFolder?.isRestricted));
    }
  }, [props.open, restrictionTouched, selectedFolder]);

  useEffect(() => {
    if (!props.open) return;
    const first = (DOCUMENT_CATEGORIES_BY_MODULE[module] ?? ['Other'])[0] ?? 'Other';
    setCategoryPreset((current) => current || first);
  }, [module, props.open]);

  const canSubmit = useMemo(
    () => Boolean(file) && title.trim().length > 2 && category.trim().length > 1 && Boolean(folderId),
    [category, file, folderId, title]
  );

  async function createFolderInline() {
    if (!newFolderName.trim()) return;
    try {
      setCreatingFolder(true);
      const created = await createDocumentFolder({
        companyId: props.companyId,
        module,
        name: newFolderName.trim(),
        parentId: newFolderParentId ? (newFolderParentId as UUID) : null,
        isRestricted: newFolderRestricted,
        createdByUserId: props.actorUserId
      });
      setExtraFolders((current) => [...current, created]);
      setFolderId(created.id);
      setIsRestricted(Boolean(created.is_restricted));
      setRestrictionTouched(false);
      setShowFolderCreate(false);
      setNewFolderName('');
      setNewFolderParentId('');
      setNewFolderRestricted(false);
      props.onFoldersChanged?.();
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setCreatingFolder(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !file || !folderId) return;
    setError(null);
    try {
      setLoading(true);
      const uploaded = await uploadDocumentFile({ companyId: props.companyId, file });
      await createDocumentWithInitialVersion({
        companyId: props.companyId,
        module,
        title: title.trim(),
        category: category.trim(),
        description: description.trim() || null,
        folderId: folderId as UUID,
        ownerUserId: props.actorUserId,
        createdByUserId: props.actorUserId,
        storageBucket: uploaded.bucket,
        storageKey: uploaded.key,
        originalFilename: file.name,
        mimeType: file.type || null,
        fileSize: file.size,
        effectiveDate: effectiveDate || null,
        documentOwnerName: documentOwnerName.trim() || null,
        approvingOfficerName: approvingOfficerName.trim() || null,
        documentNumber: documentNumber.trim() || null,
        revisionNumber: revisionNumber.trim() || null,
        revisionDate: revisionDate || null,
        approvedDate: approvedDate || null,
        expiryDate: expiryDate || null,
        isRestricted
      });
      props.onUploaded?.();
      props.onClose();
      setFile(null);
      setTitle('');
      setDescription('');
      setCategoryPreset('Policies');
      setCategoryCustom('');
      setFolderId(props.defaultFolderId ? props.defaultFolderId : '');
      setEffectiveDate('');
      setDocumentOwnerName('');
      setApprovingOfficerName('');
      setDocumentNumber('');
      setRevisionNumber('');
      setRevisionDate('');
      setApprovedDate('');
      setExpiryDate('');
      setIsRestricted(false);
      setRestrictionTouched(false);
    } catch (err: any) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Upload document</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Choose module and folder first, then upload and save optional metadata.</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-surface-100 text-charcoal-500 shrink-0"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-5">
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Upload failed</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div className="rounded-2xl border border-surface-200 p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Module</label>
                    <select
                      value={module}
                      onChange={(event) => {
                        const next = event.target.value as ModuleKey;
                        setModule(next);
                        const first = (DOCUMENT_CATEGORIES_BY_MODULE[next] ?? ['Other'])[0] ?? 'Other';
                        setCategoryPreset(first);
                        setCategoryCustom('');
                        setFolderId('');
                        setRestrictionTouched(false);
                      }}
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm"
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
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Folder</label>
                    <select
                      value={folderId}
                      onChange={(event) => {
                        setFolderId((event.target.value || '') as UUID | '');
                        setRestrictionTouched(false);
                      }}
                      className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm"
                    >
                      <option value="">Select folder</option>
                      {folderOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-50 p-3">
                  <div>
                    <p className="text-sm font-medium text-charcoal">Need a folder first?</p>
                    <p className="text-xs text-charcoal-500">Create a custom folder under this module without leaving upload.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowFolderCreate((current) => !current);
                      setNewFolderParentId(folderId);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-300 bg-white text-sm font-medium text-charcoal"
                  >
                    <FolderPlusIcon className="w-4 h-4" />
                    Create folder
                  </button>
                </div>

                {showFolderCreate && (
                  <div className="rounded-xl border border-surface-200 p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block text-sm">
                        <span className="block text-charcoal-600 mb-1">Folder name</span>
                        <input
                          value={newFolderName}
                          onChange={(event) => setNewFolderName(event.target.value)}
                          className="w-full px-4 py-2.5 border border-surface-300 rounded-lg"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="block text-charcoal-600 mb-1">Parent folder</span>
                        <select
                          value={newFolderParentId}
                          onChange={(event) => setNewFolderParentId((event.target.value || '') as UUID | '')}
                          className="w-full px-4 py-2.5 border border-surface-300 rounded-lg"
                        >
                          <option value="">Root folder</option>
                          {folderOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="flex items-start gap-3 text-sm rounded-xl border border-surface-200 p-3">
                      <input type="checkbox" checked={newFolderRestricted} disabled={!props.canManageRestricted} onChange={(event) => setNewFolderRestricted(event.target.checked)} className="mt-1" />
                      <span>
                        <span className="block font-medium text-charcoal">Restricted folder</span>
                        Only organisation owners and admins will see folders and documents marked as restricted.
                      </span>
                    </label>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setShowFolderCreate(false)} className="px-3 py-2 rounded-lg border border-surface-300 text-sm">
                        Cancel
                      </button>
                      <button type="button" disabled={creatingFolder || !newFolderName.trim()} onClick={() => void createFolderInline()} className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-60">
                        {creatingFolder ? 'Creating…' : 'Save folder'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-surface-200 p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Category</label>
                  <select
                    value={categoryPreset}
                    onChange={(event) => setCategoryPreset(event.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm"
                  >
                    {suggested.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  {categoryPreset === 'Other' && (
                    <input
                      value={categoryCustom}
                      onChange={(event) => setCategoryCustom(event.target.value)}
                      placeholder="Type category..."
                      className="mt-2 w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Document title</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. OHS Policy"
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">File</label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      setFile(nextFile);
                      if (nextFile && !title.trim()) {
                        setTitle(nextFile.name.replace(/\.[^.]+$/, ''));
                      }
                    }}
                    className="w-full text-sm"
                  />
                  {file && <p className="text-xs text-charcoal-500 mt-1">Selected: {file.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Description</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Short summary for audit and search..."
                    className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-surface-200 p-4 space-y-4">
                <p className="text-sm font-semibold text-charcoal">Optional metadata</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block text-sm">
                    <span className="block text-charcoal-600 mb-1">Effective date</span>
                    <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg" />
                  </label>
                  <label className="block text-sm">
                    <span className="block text-charcoal-600 mb-1">Approved date</span>
                    <input type="date" value={approvedDate} onChange={(event) => setApprovedDate(event.target.value)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg" />
                  </label>
                  <label className="block text-sm">
                    <span className="block text-charcoal-600 mb-1">Document owner / compiler</span>
                    <input value={documentOwnerName} onChange={(event) => setDocumentOwnerName(event.target.value)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg" />
                  </label>
                  <label className="block text-sm">
                    <span className="block text-charcoal-600 mb-1">Approving officer</span>
                    <input value={approvingOfficerName} onChange={(event) => setApprovingOfficerName(event.target.value)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg" />
                  </label>
                  <label className="block text-sm">
                    <span className="block text-charcoal-600 mb-1">Document number</span>
                    <input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg" />
                  </label>
                  <label className="block text-sm">
                    <span className="block text-charcoal-600 mb-1">Revision number</span>
                    <input value={revisionNumber} onChange={(event) => setRevisionNumber(event.target.value)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg" />
                  </label>
                  <label className="block text-sm">
                    <span className="block text-charcoal-600 mb-1">Revision date</span>
                    <input type="date" value={revisionDate} onChange={(event) => setRevisionDate(event.target.value)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg" />
                  </label>
                  <label className="block text-sm">
                    <span className="block text-charcoal-600 mb-1">Expiry date</span>
                    <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg" />
                  </label>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-surface-200 p-4">
                <input
                  type="checkbox"
                  checked={isRestricted}
                  disabled={!props.canManageRestricted && !selectedFolder?.isRestricted}
                  onChange={(event) => {
                    setRestrictionTouched(true);
                    setIsRestricted(event.target.checked);
                  }}
                  className="mt-1"
                />
                <span className="text-sm text-charcoal-700">
                  <span className="block font-medium text-charcoal">Restricted company document</span>
                  {selectedFolder?.isRestricted
                    ? 'The selected folder is restricted. This document will only be visible to organisation owners and admins.'
                    : 'Turn this on for company-only documents such as insurance, licences, tax, and executive records.'}
                </span>
              </label>

              <div className="rounded-2xl bg-surface-50 p-4 text-sm text-charcoal-600">
                <p className="font-medium text-charcoal">Upload flow</p>
                <ol className="mt-2 space-y-1 list-decimal list-inside">
                  <li>Create or choose a folder.</li>
                  <li>Select document file and details.</li>
                  <li>Save optional metadata and access settings.</li>
                  <li>Upload to storage and create version `v1`.</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={props.onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit || loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed">
              {loading && <LoadingSpinner size={16} />}
              Upload document
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
