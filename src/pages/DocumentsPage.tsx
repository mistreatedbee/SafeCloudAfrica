import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon, ChevronRightIcon, FileTextIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, LockIcon, PencilIcon, PlusIcon, SearchIcon, ShieldAlertIcon, UploadIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import type { Document, DocumentFolder, DocumentVersion, UUID, UserProfile } from '../api/models/entities';
import { listDocuments, updateDocument } from '../api/services/documentsService';
import { createDocumentFolder, listDocumentFolders } from '../api/services/documentFoldersService';
import { createDraftVersionFrom, listDocumentVersionsByIds, requestApprovalForDocumentVersion } from '../api/services/documentVersionsService';
import { downloadDocumentFile, openBlobInNewTab } from '../api/services/documentsStorageService';
import { DocumentUploadModal } from '../components/documents/DocumentUploadModal';
import { DocumentEditModal } from '../components/documents/DocumentEditModal';
import { listUserProfiles } from '../api/services/profilesService';
import { ListEmptyState } from '../components/ui/ListEmptyState';

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function toStatusBadge(status: string | null | undefined): { label: string; cls: string } {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved') return { label: 'Approved', cls: 'bg-success/10 text-success border-success/20' };
  if (normalized === 'in_review') return { label: 'In review', cls: 'bg-teal/10 text-teal border-teal/20' };
  if (normalized === 'rejected') return { label: 'Rejected', cls: 'bg-critical/10 text-critical border-critical/20' };
  if (normalized === 'archived') return { label: 'Archived', cls: 'bg-surface-100 text-charcoal-600 border-surface-200' };
  return { label: 'Draft', cls: 'bg-surface-100 text-charcoal-700 border-surface-200' };
}

function toIsoDate(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : '—';
}

function isOverdue(value: string | null | undefined): boolean {
  if (!value) return false;
  return String(value).slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function buildFolderMaps(folders: DocumentFolder[]) {
  const byId = new Map<string, DocumentFolder>();
  const byParent = new Map<string, DocumentFolder[]>();
  for (const folder of folders) {
    byId.set(String(folder.id), folder);
    const key = folder.parent_id ? String(folder.parent_id) : 'root';
    const list = byParent.get(key) ?? [];
    list.push(folder);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((left, right) => left.name.localeCompare(right.name));
  }
  return { byId, byParent };
}

function folderPath(folder: DocumentFolder | null | undefined, byId: Map<string, DocumentFolder>): string {
  if (!folder) return 'Unfiled';
  const parts = [folder.name];
  let cursor = folder.parent_id ? byId.get(String(folder.parent_id)) ?? null : null;
  while (cursor) {
    parts.unshift(cursor.name);
    cursor = cursor.parent_id ? byId.get(String(cursor.parent_id)) ?? null : null;
  }
  return parts.join(' / ');
}

function collectDescendantFolderIds(folderId: string, byParent: Map<string, DocumentFolder[]>): Set<string> {
  const result = new Set<string>();
  const stack = [folderId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || result.has(current)) continue;
    result.add(current);
    for (const child of byParent.get(current) ?? []) {
      stack.push(String(child.id));
    }
  }
  return result;
}

function isOfficeVersion(version: DocumentVersion | null | undefined): boolean {
  const filename = String(version?.original_filename || '').toLowerCase();
  const mimeType = String(version?.mime_type || '').toLowerCase();
  return (
    filename.endsWith('.doc') ||
    filename.endsWith('.docx') ||
    filename.endsWith('.xls') ||
    filename.endsWith('.xlsx') ||
    mimeType.includes('word') ||
    mimeType.includes('excel') ||
    mimeType.includes('spreadsheet')
  );
}

function getVersionExtension(version: DocumentVersion | null | undefined): string {
  const filename = String(version?.original_filename || '').trim().toLowerCase();
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match?.[1]?.toLowerCase() ?? '';
}

function isPdfVersion(version: DocumentVersion | null | undefined): boolean {
  return getVersionExtension(version) === 'pdf' || String(version?.mime_type || '').toLowerCase().includes('pdf');
}

function isEditableOfficeVersion(version: DocumentVersion | null | undefined): boolean {
  const extension = getVersionExtension(version);
  return extension === 'doc' || extension === 'docx' || extension === 'xls' || extension === 'xlsx' || isOfficeVersion(version);
}

function collectAncestorFolderIds(folderId: string, byId: Map<string, DocumentFolder>): string[] {
  const ancestors: string[] = [];
  let cursor = byId.get(folderId) ?? null;
  while (cursor?.parent_id) {
    const parentId = String(cursor.parent_id);
    ancestors.push(parentId);
    cursor = byId.get(parentId) ?? null;
  }
  return ancestors;
}

function collectMatchingFolderIds(input: {
  folders: DocumentFolder[];
  byId: Map<string, DocumentFolder>;
  query: string;
}): Set<string> {
  const normalizedQuery = input.query.trim().toLowerCase();
  if (!normalizedQuery) return new Set();

  const visible = new Set<string>();
  for (const folder of input.folders) {
    const id = String(folder.id);
    const path = folderPath(folder, input.byId).toLowerCase();
    if (!path.includes(normalizedQuery)) continue;
    visible.add(id);
    for (const ancestorId of collectAncestorFolderIds(id, input.byId)) {
      visible.add(ancestorId);
    }
  }

  return visible;
}

function FolderCreateModal(props: {
  open: boolean;
  companyId: UUID;
  actorUserId: UUID;
  folders: DocumentFolder[];
  canManageRestricted: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [module, setModule] = useState<Document['module']>('safety');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const folderOptions = useMemo(() => {
    const relevant = props.folders.filter((folder) => folder.module === module);
    const maps = buildFolderMaps(relevant);
    return relevant
      .slice()
      .sort((left, right) => folderPath(left, maps.byId).localeCompare(folderPath(right, maps.byId)))
      .map((folder) => ({
        id: folder.id,
        label: folderPath(folder, maps.byId)
      }));
  }, [module, props.folders]);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl border border-surface-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Create folder</p>
            <p className="text-xs text-charcoal-500 mt-0.5">Folders are user-managed and sorted alphabetically.</p>
          </div>
          <button onClick={props.onClose} className="text-sm text-charcoal-500">Close</button>
        </div>
        <form
          className="p-5 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!name.trim()) return;
            setError(null);
            setSuccessMessage(null);
            try {
              setLoading(true);
              await createDocumentFolder({
                companyId: props.companyId,
                module,
                name: name.trim(),
                parentId: parentId ? (parentId as UUID) : null,
                isRestricted,
                createdByUserId: props.actorUserId
              });
              props.onCreated();
              setName('');
              setParentId('');
              setIsRestricted(false);
              setSuccessMessage('Folder created successfully');
              setTimeout(() => props.onClose(), 600);
            } catch (err: any) {
              setError(String(err?.message || err));
            } finally {
              setLoading(false);
            }
          }}
        >
          {successMessage && <p className="text-sm text-success">{successMessage}</p>}
          {error && <p className="text-sm text-critical">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="block mb-1 text-charcoal-500">Module</span>
              <select value={module} onChange={(event) => setModule(event.target.value as Document['module'])} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg">
                <option value="safety">Safety</option>
                <option value="quality">Quality</option>
                <option value="environment">Environment</option>
                <option value="health">Health</option>
                <option value="legal">Legal</option>
                <option value="hr">HR</option>
                <option value="general">General</option>
                <option value="security">Security</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="block mb-1 text-charcoal-500">Select folder</span>
              <select value={parentId} onChange={(event) => setParentId(event.target.value)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg">
                <option value="">Root folder</option>
                {folderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="block mb-1 text-charcoal-500">Folder name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="w-full px-4 py-2.5 border border-surface-300 rounded-lg" />
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-surface-200 p-4 text-sm">
            <input
              type="checkbox"
              checked={isRestricted}
              disabled={!props.canManageRestricted}
              onChange={(event) => setIsRestricted(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-charcoal">Restricted folder</span>
              Only organisation owners and admins can view restricted folders and documents inside them.
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={props.onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={loading || !name.trim()} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-60">
              {loading ? 'Saving…' : 'Create folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ApprovalRequestModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: UUID;
  document: Document;
  version: DocumentVersion;
  profiles: UserProfile[];
  actorUserId: UUID;
  onSubmitted: () => void;
}) {
  const [approverId, setApproverId] = useState('');
  const [nextReview, setNextReview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl border border-surface-200 max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div>
            <p className="text-sm font-semibold text-charcoal">Request approval</p>
            <p className="text-xs text-charcoal-500 mt-0.5">
              {props.document.title} • {props.version.version_label}
            </p>
          </div>
          <button type="button" onClick={props.onClose} className="min-h-[44px] min-w-[44px] rounded-lg hover:bg-surface-100 text-charcoal-500">
            Close
          </button>
        </div>
        <form
          className="p-5 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!approverId) return;
            setError(null);
            try {
              setLoading(true);
              await requestApprovalForDocumentVersion({
                companyId: props.companyId,
                documentId: props.document.id,
                versionId: props.version.id,
                requestedByUserId: props.actorUserId,
                approverUserId: approverId as UUID,
                nextReviewDueAt: nextReview ? new Date(nextReview).toISOString() : null
              });
              props.onSubmitted();
              props.onClose();
            } catch (err: any) {
              setError(String(err?.message || err));
            } finally {
              setLoading(false);
            }
          }}
        >
          {error && (
            <div className="bg-critical/5 border border-critical/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-critical">Could not submit approval request</p>
              <p className="text-sm text-charcoal-600 mt-1">{error}</p>
            </div>
          )}
          <label className="block text-sm">
            <span className="block mb-1 text-charcoal-500">Approver</span>
            <select value={approverId} onChange={(event) => setApproverId(event.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg">
              <option value="">Select approver...</option>
              {props.profiles.map((profile) => (
                <option key={profile.user_id} value={profile.user_id}>
                  {profile.full_name || profile.email || profile.user_id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block mb-1 text-charcoal-500">Next review date (optional)</span>
            <input type="date" value={nextReview} onChange={(event) => setNextReview(event.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
          </label>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={props.onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50">
              Cancel
            </button>
            <button type="submit" disabled={!approverId || loading} className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60">
              {loading ? 'Submitting…' : 'Request approval'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ApprovedEditChoiceModal(props: { open: boolean; onClose: () => void; onDraft: () => void; onUnpublish: () => void }) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-surface-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200">
          <p className="text-sm font-semibold text-charcoal">Edit approved document</p>
          <p className="text-xs text-charcoal-500 mt-1">Choose how you want to handle the next draft.</p>
        </div>
        <div className="p-5 space-y-3">
          <button type="button" onClick={props.onDraft} className="w-full text-left p-4 rounded-xl border border-surface-300 hover:border-teal hover:bg-teal-50">
            <p className="text-sm font-semibold text-charcoal">Start new draft version</p>
            <p className="text-xs text-charcoal-500 mt-1">Keeps the currently approved version published while you edit the draft.</p>
          </button>
          <button type="button" onClick={props.onUnpublish} className="w-full text-left p-4 rounded-xl border border-surface-300 hover:border-critical hover:bg-critical/5">
            <p className="text-sm font-semibold text-charcoal">Revise current and unpublish</p>
            <p className="text-xs text-charcoal-500 mt-1">Moves the document off approved while the revision is in progress.</p>
          </button>
          <div className="flex justify-end pt-2">
            <button type="button" onClick={props.onClose} className="px-4 py-2 rounded-lg border border-surface-300 text-sm font-medium text-charcoal hover:bg-surface-50">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DocumentsPage() {
  const navigate = useNavigate();
  const { activeCompanyId, activeRole } = useTenant();
  const { user } = useUser();
  const canManage = activeRole === 'owner' || activeRole === 'admin' || activeRole === 'manager' || activeRole === 'supervisor' || activeRole === 'consultant';
  const canManageRestricted = activeRole === 'owner' || activeRole === 'admin';

  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderCreateOpen, setFolderCreateOpen] = useState(false);
  const [folderSearch, setFolderSearch] = useState('');
  const [expandedFolderIds, setExpandedFolderIds] = useState<Record<string, boolean>>({});
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [editChoiceOpen, setEditChoiceOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const { data: folders, error: foldersError } = useAsync<DocumentFolder[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listDocumentFolders(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const { data: documents, loading: docsLoading, error: docsError } = useAsync<Document[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listDocuments(activeCompanyId, { search: search.trim() || undefined });
    },
    [activeCompanyId, refreshKey, search]
  );

  const docList = documents ?? [];
  const folderList = folders ?? [];
  const folderMaps = useMemo(() => buildFolderMaps(folderList), [folderList]);
  const matchingFolderIds = useMemo(
    () => collectMatchingFolderIds({ folders: folderList, byId: folderMaps.byId, query: folderSearch }),
    [folderList, folderMaps.byId, folderSearch]
  );
  const selectedDoc = useMemo(() => docList.find((doc) => doc.id === selectedDocId) ?? null, [docList, selectedDocId]);

  const versionIds = useMemo(() => {
    const ids: string[] = [];
    for (const doc of docList) {
      if (doc.current_version_id) ids.push(String(doc.current_version_id));
      if (doc.published_version_id) ids.push(String(doc.published_version_id));
    }
    return ids as UUID[];
  }, [docList]);

  const { data: versions } = useAsync<DocumentVersion[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listDocumentVersionsByIds(activeCompanyId, versionIds);
    },
    [activeCompanyId, versionIds.join('|')]
  );

  const versionById = useMemo(() => {
    const map = new Map<string, DocumentVersion>();
    (versions ?? []).forEach((version) => map.set(String(version.id), version));
    return map;
  }, [versions]);

  const { data: profiles } = useAsync<UserProfile[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listUserProfiles(activeCompanyId);
    },
    [activeCompanyId]
  );

  const selectedFolderDescendants = useMemo(
    () => (selectedFolderId ? collectDescendantFolderIds(selectedFolderId, folderMaps.byParent) : null),
    [folderMaps.byParent, selectedFolderId]
  );

  const filteredDocs = useMemo(() => {
    if (!selectedFolderDescendants) return docList;
    return docList.filter((doc) => doc.folder_id && selectedFolderDescendants.has(String(doc.folder_id)));
  }, [docList, selectedFolderDescendants]);

  const publishedVersion = selectedDoc?.published_version_id ? versionById.get(String(selectedDoc.published_version_id)) ?? null : null;
  const currentVersion = selectedDoc?.current_version_id ? versionById.get(String(selectedDoc.current_version_id)) ?? null : null;
  const displayVersion = publishedVersion ?? currentVersion;
  const selectedFolderAncestors = useMemo(
    () => (selectedFolderId ? collectAncestorFolderIds(selectedFolderId, folderMaps.byId) : []),
    [folderMaps.byId, selectedFolderId]
  );

  React.useEffect(() => {
    if (!selectedFolderId) return;
    setExpandedFolderIds((current) => {
      const next = { ...current };
      for (const folderId of selectedFolderAncestors) next[folderId] = true;
      return next;
    });
  }, [selectedFolderAncestors, selectedFolderId]);

  React.useEffect(() => {
    if (!folderSearch.trim()) return;
    setExpandedFolderIds((current) => {
      const next = { ...current };
      for (const folderId of matchingFolderIds) {
        if ((folderMaps.byParent.get(folderId) ?? []).length > 0) next[folderId] = true;
      }
      return next;
    });
  }, [folderMaps.byParent, folderSearch, matchingFolderIds]);

  async function openPublishedPreview(doc: Document): Promise<void> {
    if (!doc.storage_bucket || !doc.storage_key) return;
    const blob = await downloadDocumentFile({ bucket: doc.storage_bucket, key: doc.storage_key });
    openBlobInNewTab(blob);
  }

  function toggleFolder(folderId: string): void {
    setExpandedFolderIds((current) => ({ ...current, [folderId]: !current[folderId] }));
  }

  function renderFolderNode(folder: DocumentFolder, depth = 0): React.ReactNode {
    const folderId = String(folder.id);
    const selected = selectedFolderId === folderId;
    const children = folderMaps.byParent.get(folderId) ?? [];
    const hasChildren = children.length > 0;
    const matchesSearch = !folderSearch.trim() || matchingFolderIds.has(folderId);
    if (!matchesSearch) return null;
    const forceExpanded = selectedFolderAncestors.includes(folderId) || (!!folderSearch.trim() && matchingFolderIds.has(folderId));
    const expanded = hasChildren ? forceExpanded || Boolean(expandedFolderIds[folderId]) : false;
    return (
      <div key={folder.id} className="space-y-1">
        <div
          className={`group flex items-center gap-1 rounded-xl border px-2 py-1.5 ${
            selected ? 'border-teal/30 bg-teal-50 text-teal shadow-sm' : 'border-transparent text-charcoal hover:bg-surface-50'
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggleFolder(folderId)}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${hasChildren ? 'hover:bg-white/80' : 'opacity-40 cursor-default'}`}
            aria-label={hasChildren ? (expanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`) : `${folder.name} has no subfolders`}
            disabled={!hasChildren}
          >
            {hasChildren ? (
              expanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />
            ) : (
              <span className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setSelectedFolderId(folderId)}
            className="min-w-0 flex-1 text-left"
          >
            <span className="flex items-center gap-2">
              {expanded ? <FolderOpenIcon className="w-4 h-4 shrink-0" /> : <FolderIcon className="w-4 h-4 shrink-0" />}
              <span className="truncate text-sm font-medium">{folder.name}</span>
              {folder.is_restricted ? <LockIcon className="w-3.5 h-3.5 shrink-0" /> : null}
            </span>
          </button>
        </div>
        {hasChildren && expanded ? <div className="space-y-1">{children.map((child) => renderFolderNode(child, depth + 1))}</div> : null}
      </div>
    );
  }

  return (
    <Layout title="Document Management">
      {activeCompanyId && user?.id && (
        <>
          <DocumentUploadModal
            open={uploadOpen}
            onClose={() => setUploadOpen(false)}
            companyId={activeCompanyId}
            actorUserId={user.id as UUID}
            canManageRestricted={canManageRestricted}
            folders={folderList}
            defaultFolderId={selectedFolderId ? (selectedFolderId as UUID) : null}
            onUploaded={() => setRefreshKey((current) => current + 1)}
            onFoldersChanged={() => setRefreshKey((current) => current + 1)}
          />
          <FolderCreateModal
            open={folderCreateOpen}
            companyId={activeCompanyId}
            actorUserId={user.id as UUID}
            folders={folderList}
            canManageRestricted={canManageRestricted}
            onClose={() => setFolderCreateOpen(false)}
            onCreated={() => setRefreshKey((current) => current + 1)}
          />
        </>
      )}

      {activeCompanyId && user?.id && selectedDoc && currentVersion && (
        <ApprovalRequestModal
          open={approvalOpen}
          onClose={() => setApprovalOpen(false)}
          companyId={activeCompanyId}
          document={selectedDoc}
          version={currentVersion}
          profiles={profiles ?? []}
          actorUserId={user.id as UUID}
          onSubmitted={() => setRefreshKey((current) => current + 1)}
        />
      )}

      <ApprovedEditChoiceModal
        open={editChoiceOpen}
        onClose={() => setEditChoiceOpen(false)}
        onDraft={async () => {
          if (!activeCompanyId || !user?.id || !selectedDoc || !publishedVersion) return;
          setEditChoiceOpen(false);
          await createDraftVersionFrom({
            companyId: activeCompanyId,
            documentId: selectedDoc.id,
            supersedesVersionId: publishedVersion.id,
            baseVersionLabel: publishedVersion.version_label,
            storageBucket: publishedVersion.storage_bucket,
            storageKey: publishedVersion.storage_key,
            originalFilename: publishedVersion.original_filename,
            mimeType: publishedVersion.mime_type,
            fileSize: publishedVersion.file_size,
            createdByUserId: user.id as UUID,
            setCurrent: true,
            unpublish: false
          });
          setRefreshKey((current) => current + 1);
        }}
        onUnpublish={async () => {
          if (!activeCompanyId || !user?.id || !selectedDoc || !publishedVersion) return;
          setEditChoiceOpen(false);
          await createDraftVersionFrom({
            companyId: activeCompanyId,
            documentId: selectedDoc.id,
            supersedesVersionId: publishedVersion.id,
            baseVersionLabel: publishedVersion.version_label,
            storageBucket: publishedVersion.storage_bucket,
            storageKey: publishedVersion.storage_key,
            originalFilename: publishedVersion.original_filename,
            mimeType: publishedVersion.mime_type,
            fileSize: publishedVersion.file_size,
            createdByUserId: user.id as UUID,
            setCurrent: true,
            unpublish: true
          });
          setRefreshKey((current) => current + 1);
        }}
      />

      <DocumentEditModal
        open={editOpen}
        document={selectedDoc}
        folders={folderList}
        canManageRestriction={canManageRestricted}
        isLoading={savingEdit}
        onClose={() => setEditOpen(false)}
        onSave={async (updates) => {
          if (!activeCompanyId || !selectedDoc) return;
          try {
            setSavingEdit(true);
            await updateDocument({
              companyId: activeCompanyId,
              documentId: selectedDoc.id,
              patch: {
                title: updates.title ?? selectedDoc.title,
                category: updates.category ?? selectedDoc.category,
                description: updates.description ?? null,
                folder_id: (updates.folder_id ?? null) as UUID | null,
                effective_date: updates.effective_date ?? null,
                document_owner_name: updates.document_owner_name ?? null,
                approving_officer_name: updates.approving_officer_name ?? null,
                document_number: updates.document_number ?? null,
                revision_number: updates.revision_number ?? null,
                revision_date: updates.revision_date ?? null,
                approved_date: updates.approved_date ?? null,
                expiry_date: updates.expiry_date ?? null,
                is_restricted: updates.is_restricted ?? false
              }
            });
            setRefreshKey((current) => current + 1);
          } finally {
            setSavingEdit(false);
          }
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-4 lg:h-[calc(100vh-13rem)] lg:min-h-[32rem] flex flex-col">
          <div className="flex items-center justify-between gap-3 shrink-0">
            <h2 className="font-semibold text-charcoal flex items-center gap-2">
              <FolderIcon className="w-4 h-4 text-teal" />
              Folders
            </h2>
            {canManage && (
              <button type="button" onClick={() => setFolderCreateOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-teal hover:text-teal-700">
                <FolderPlusIcon className="w-3.5 h-3.5" />
                Create
              </button>
            )}
          </div>
          <div className="mt-3 relative shrink-0">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
            <input
              type="search"
              value={folderSearch}
              onChange={(event) => setFolderSearch(event.target.value)}
              placeholder="Filter folders..."
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
            />
          </div>
          <div className="mt-3 flex-1 min-h-0 overflow-hidden">
            {foldersError && <p className="text-xs text-critical mb-3">{foldersError.message}</p>}
            {folderList.length === 0 ? (
              <div className="rounded-xl bg-surface-50 p-4 text-sm text-charcoal-500">
                Create your first folder before uploading documents so every file is saved under the correct module and location.
              </div>
            ) : (
              <div className="h-full overflow-y-auto pr-1 space-y-2">
                <button
                  type="button"
                  onClick={() => setSelectedFolderId('')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium border ${
                    !selectedFolderId ? 'bg-teal-50 text-teal border-teal/30' : 'border-transparent hover:bg-surface-50 text-charcoal'
                  }`}
                >
                  All folders
                </button>
                {(folderMaps.byParent.get('root') ?? []).map((root) => renderFolderNode(root))}
                {folderSearch.trim() && matchingFolderIds.size === 0 ? (
                  <div className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-4 text-sm text-charcoal-500">
                    No folders match your filter.
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-xl">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, document number, or compiler..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              {canManage && (
                <button
                  type="button"
                  onClick={() => setFolderCreateOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-surface-300 text-sm font-semibold text-charcoal hover:bg-surface-50"
                >
                  <FolderPlusIcon className="w-4 h-4" />
                  New folder
                </button>
              )}
              <button
                type="button"
                disabled={!canManage}
                onClick={() => setUploadOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-60"
              >
                <UploadIcon className="w-4 h-4" />
                Upload
              </button>
            </div>
          </div>

          {docsError && (
            <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
              <p className="text-sm font-semibold text-critical">Unable to load documents</p>
              <p className="text-sm text-charcoal-500 mt-1">{docsError.message}</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-charcoal flex items-center gap-2">
                  <FileTextIcon className="w-4 h-4 text-teal" />
                  Documents
                </h3>
                <p className="text-xs text-charcoal-400 mt-1">
                  {selectedFolderId
                    ? `Showing ${filteredDocs.length} document(s) under ${folderPath(folderMaps.byId.get(selectedFolderId) ?? null, folderMaps.byId)}`
                    : 'Showing documents across all folders'}
                </p>
              </div>
              <span className="text-sm text-charcoal-400">{filteredDocs.length} items</span>
            </div>

            {docsLoading ? (
              <div className="p-5 text-sm text-charcoal-500">Loading…</div>
            ) : filteredDocs.length === 0 ? (
              <div className="p-5">
                <ListEmptyState
                  icon={FileTextIcon}
                  title={docList.length === 0 ? 'No documents yet' : 'No documents match your filters'}
                  description="Create folders first, then upload controlled documents with metadata, restriction, and review tracking."
                  primaryAction={canManage ? { kind: 'button', label: 'Upload document', onClick: () => setUploadOpen(true) } : { kind: 'link', to: '/dashboard', label: 'Back to dashboard' }}
                  secondaryAction={search.trim() || selectedFolderId ? { kind: 'button', label: 'Clear filters', onClick: () => { setSearch(''); setSelectedFolderId(''); } } : undefined}
                />
              </div>
            ) : (
              <div className="divide-y divide-surface-100">
                {filteredDocs.map((doc) => {
                  const published = doc.published_version_id ? versionById.get(String(doc.published_version_id)) ?? null : null;
                  const current = doc.current_version_id ? versionById.get(String(doc.current_version_id)) ?? null : null;
                  const badge = toStatusBadge(published ? 'approved' : (current?.status ?? doc.status));
                  const folder = doc.folder_id ? folderMaps.byId.get(String(doc.folder_id)) ?? null : null;
                  const expiryOverdue = isOverdue(doc.expiry_date);
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setSelectedDocId(String(doc.id))}
                      className={`w-full text-left px-5 py-4 hover:bg-surface-50 ${selectedDocId === String(doc.id) ? 'bg-surface-50' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-charcoal truncate">{doc.title}</p>
                            {doc.is_restricted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-semibold">
                                <LockIcon className="w-3 h-3" />
                                Restricted
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-charcoal-500 mt-1">
                            {doc.document_number || `DOC-${shortId(String(doc.id))}`} • {doc.module} • {doc.category}
                          </p>
                          <p className="text-xs text-charcoal-500 mt-1">
                            Folder: {folderPath(folder, folderMaps.byId)} • Compiler: {doc.document_owner_name || '—'}
                          </p>
                          {doc.description ? <p className="text-xs text-charcoal-500 mt-1 line-clamp-2">{doc.description}</p> : null}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {expiryOverdue ? <span className="text-[10px] font-semibold text-critical">EXPIRY OVERDUE</span> : null}
                          <span className={`inline-flex items-center px-2 py-1 rounded border text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-charcoal-500">
                        <span>Published: {published ? published.version_label : '—'}</span>
                        <span>•</span>
                        <span>Draft: {current && current.status !== 'approved' ? current.version_label : '—'}</span>
                        <span>•</span>
                        <span>Review: {toIsoDate(doc.review_due_at)}</span>
                        <span>•</span>
                        <span>Expiry: {toIsoDate(doc.expiry_date)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedDoc && (
            <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-charcoal">{selectedDoc.title}</p>
                    {selectedDoc.is_restricted ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-semibold">
                        <ShieldAlertIcon className="w-3 h-3" />
                        Executive only
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-charcoal-500 mt-1">{selectedDoc.document_number || `DOC-${shortId(String(selectedDoc.id))}`}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {publishedVersion?.id && (
                    <button type="button" onClick={() => void openPublishedPreview(selectedDoc)} className="px-3 py-2 rounded-lg border border-surface-300 text-xs font-semibold text-charcoal hover:bg-surface-50">
                      View published
                    </button>
                  )}
                  {publishedVersion?.id && isEditableOfficeVersion(publishedVersion) && (
                    <button type="button" onClick={() => navigate(`/documents/editor/${publishedVersion.id}?mode=view`)} className="px-3 py-2 rounded-lg bg-surface-900 text-white text-xs font-semibold hover:bg-surface-800">
                      Open editor (view)
                    </button>
                  )}
                  {currentVersion?.id && canManage && isEditableOfficeVersion(currentVersion) && (
                    <button
                      type="button"
                      onClick={() => navigate(`/documents/editor/${currentVersion.id}?mode=edit`)}
                      className="px-3 py-2 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600 disabled:opacity-60"
                      disabled={String(currentVersion.status) === 'approved' || String(currentVersion.status) === 'archived'}
                    >
                      Open editor (edit)
                    </button>
                  )}
                </div>
              </div>
              {displayVersion && isPdfVersion(displayVersion) ? (
                <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-charcoal-600">
                  PDF files cannot be edited. Please download or view the file.
                </div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-surface-200 p-3">
                  <p className="text-xs text-charcoal-500">Folder</p>
                  <p className="text-sm font-semibold text-charcoal mt-1">{folderPath(selectedDoc.folder_id ? folderMaps.byId.get(String(selectedDoc.folder_id)) ?? null : null, folderMaps.byId)}</p>
                </div>
                <div className="rounded-xl border border-surface-200 p-3">
                  <p className="text-xs text-charcoal-500">Published version</p>
                  <p className="text-sm font-semibold text-charcoal mt-1">{publishedVersion ? publishedVersion.version_label : '—'}</p>
                </div>
                <div className="rounded-xl border border-surface-200 p-3">
                  <p className="text-xs text-charcoal-500">Working version</p>
                  <p className="text-sm font-semibold text-charcoal mt-1">{currentVersion ? `${currentVersion.version_label} (${currentVersion.status})` : '—'}</p>
                </div>
                <div className="rounded-xl border border-surface-200 p-3">
                  <p className="text-xs text-charcoal-500">Expiry date</p>
                  <p className={`text-sm font-semibold mt-1 ${isOverdue(selectedDoc.expiry_date) ? 'text-critical' : 'text-charcoal'}`}>
                    {toIsoDate(selectedDoc.expiry_date)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-surface-200 p-4 space-y-2">
                  <p className="text-sm font-semibold text-charcoal">Metadata</p>
                  <div className="grid grid-cols-2 gap-2 text-sm text-charcoal-600">
                    <span>Compiler</span><span>{selectedDoc.document_owner_name || '—'}</span>
                    <span>Approving officer</span><span>{selectedDoc.approving_officer_name || '—'}</span>
                    <span>Effective date</span><span>{toIsoDate(selectedDoc.effective_date)}</span>
                    <span>Approved date</span><span>{toIsoDate(selectedDoc.approved_date)}</span>
                    <span>Revision number</span><span>{selectedDoc.revision_number || '—'}</span>
                    <span>Revision date</span><span>{toIsoDate(selectedDoc.revision_date)}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-surface-200 p-4 space-y-2">
                  <p className="text-sm font-semibold text-charcoal">Tracking</p>
                  <div className="grid grid-cols-2 gap-2 text-sm text-charcoal-600">
                    <span>Category</span><span>{selectedDoc.category}</span>
                    <span>Review due</span><span>{toIsoDate(selectedDoc.review_due_at)}</span>
                    <span>Restricted</span><span>{selectedDoc.is_restricted ? 'Yes' : 'No'}</span>
                    <span>Stored file</span><span>{publishedVersion?.original_filename || currentVersion?.original_filename || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {canManage && (
                  <button type="button" onClick={() => setEditOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-300 bg-white text-xs font-semibold text-charcoal hover:bg-surface-50">
                    <PencilIcon className="w-4 h-4" />
                    Edit details
                  </button>
                )}
                {publishedVersion && canManage && (
                  <button type="button" onClick={() => setEditChoiceOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-300 bg-white text-xs font-semibold text-charcoal hover:bg-surface-50">
                    <PlusIcon className="w-4 h-4" />
                    Edit approved (create draft)
                  </button>
                )}
                {currentVersion && canManage && String(currentVersion.status) !== 'approved' && String(currentVersion.status) !== 'archived' && (
                  <button type="button" onClick={() => setApprovalOpen(true)} className="px-3 py-2 rounded-lg bg-success text-white text-xs font-semibold hover:bg-success-600">
                    Request approval
                  </button>
                )}
                <button type="button" onClick={() => setRefreshKey((current) => current + 1)} className="px-3 py-2 rounded-lg border border-surface-300 text-xs font-semibold text-charcoal hover:bg-surface-50">
                  Refresh
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
