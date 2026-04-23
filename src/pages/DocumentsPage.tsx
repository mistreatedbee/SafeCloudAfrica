import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileTextIcon, FolderIcon, PlusIcon, SearchIcon, UploadIcon } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useTenant } from '../tenant/TenantContext';
import { useAsync } from '../api/hooks/useAsync';
import type { Document, DocumentFolder, DocumentVersion, UUID, UserProfile } from '../api/models/entities';
import { listDocuments } from '../api/services/documentsService';
import { listDocumentFolders, seedDefaultDocumentFolders } from '../api/services/documentFoldersService';
import { createDraftVersionFrom, listDocumentVersionsByIds, requestApprovalForDocumentVersion } from '../api/services/documentVersionsService';
import { downloadDocumentFile, openBlobInNewTab } from '../api/services/documentsStorageService';
import { DocumentUploadModal } from '../components/documents/DocumentUploadModal';
import { useUser } from '@insforge/react';
import { listUserProfiles } from '../api/services/profilesService';
import { ListEmptyState } from '../components/ui/ListEmptyState';

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function toStatusBadge(status: string | null | undefined): { label: string; cls: string } {
  const s = String(status || '').toLowerCase();
  if (s === 'approved') return { label: 'Approved', cls: 'bg-success/10 text-success border-success/20' };
  if (s === 'in_review') return { label: 'In review', cls: 'bg-teal/10 text-teal border-teal/20' };
  if (s === 'rejected') return { label: 'Rejected', cls: 'bg-critical/10 text-critical border-critical/20' };
  if (s === 'archived') return { label: 'Archived', cls: 'bg-surface-100 text-charcoal-600 border-surface-200' };
  return { label: 'Draft', cls: 'bg-surface-100 text-charcoal-700 border-surface-200' };
}

function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const today = new Date().toISOString().slice(0, 10);
  return String(iso).slice(0, 10) < today;
}

function buildFolderTree(folders: DocumentFolder[]) {
  const byParent = new Map<string, DocumentFolder[]>();
  for (const folder of folders) {
    const key = folder.parent_id ? String(folder.parent_id) : 'root';
    const list = byParent.get(key) ?? [];
    list.push(folder);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
  }
  return { byParent };
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
          onSubmit={async (e) => {
            e.preventDefault();
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
            <select value={approverId} onChange={(e) => setApproverId(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg">
              <option value="">Select approver…</option>
              {props.profiles.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.full_name || p.email || p.user_id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block mb-1 text-charcoal-500">Next review date (optional)</span>
            <input type="date" value={nextReview} onChange={(e) => setNextReview(e.target.value)} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
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
            <p className="text-sm font-semibold text-charcoal">Start new draft version (recommended)</p>
            <p className="text-xs text-charcoal-500 mt-1">Keeps the currently approved version published while you edit the draft.</p>
          </button>
          <button type="button" onClick={props.onUnpublish} className="w-full text-left p-4 rounded-xl border border-surface-300 hover:border-critical hover:bg-critical/5">
            <p className="text-sm font-semibold text-charcoal">Revise current (unpublish until re-approved)</p>
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

  const [refreshKey, setRefreshKey] = useState(0);
  const [q, setQ] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [editChoiceOpen, setEditChoiceOpen] = useState(false);

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
      return await listDocuments(activeCompanyId);
    },
    [activeCompanyId, refreshKey]
  );

  const docList = documents ?? [];
  const folderList = folders ?? [];

  const selectedDoc = useMemo(() => docList.find((d) => d.id === selectedDocId) ?? null, [docList, selectedDocId]);

  const versionIds = useMemo(() => {
    const ids: string[] = [];
    for (const d of docList) {
      if (d.current_version_id) ids.push(String(d.current_version_id));
      if (d.published_version_id) ids.push(String(d.published_version_id));
    }
    return ids as any as UUID[];
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
    (versions ?? []).forEach((v) => map.set(String(v.id), v));
    return map;
  }, [versions]);

  const { data: profiles } = useAsync<UserProfile[]>(
    async () => {
      if (!activeCompanyId) return [];
      return await listUserProfiles(activeCompanyId);
    },
    [activeCompanyId]
  );

  const publishedVersion = selectedDoc?.published_version_id ? versionById.get(String(selectedDoc.published_version_id)) ?? null : null;
  const currentVersion = selectedDoc?.current_version_id ? versionById.get(String(selectedDoc.current_version_id)) ?? null : null;

  const filteredDocs = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return docList.filter((d) => {
      const matchesFolder = !selectedFolderId || String(d.folder_id || '') === selectedFolderId;
      const matchesQuery = !qq || d.title.toLowerCase().includes(qq) || String(d.category || '').toLowerCase().includes(qq);
      return matchesFolder && matchesQuery;
    });
  }, [docList, q, selectedFolderId]);

  const folderTree = useMemo(() => buildFolderTree(folderList), [folderList]);

  async function openPublishedPreview(doc: Document): Promise<void> {
    if (!doc.storage_bucket || !doc.storage_key) return;
    const blob = await downloadDocumentFile({ bucket: doc.storage_bucket, key: doc.storage_key });
    openBlobInNewTab(blob);
  }

  return (
    <Layout title="Document Management (Controlled)">
      {activeCompanyId && user?.id && (
        <DocumentUploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          companyId={activeCompanyId}
          actorUserId={user.id as UUID}
          folders={folderList}
          defaultFolderId={(selectedFolderId ? (selectedFolderId as UUID) : null) as any}
          onUploaded={() => setRefreshKey((k) => k + 1)}
        />
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
          onSubmitted={() => setRefreshKey((k) => k + 1)}
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
          setRefreshKey((k) => k + 1);
        }}
        onUnpublish={async () => {
          if (!activeCompanyId || !user?.id || !selectedDoc || !publishedVersion) return;
          setEditChoiceOpen(false);
          // v1 behavior: create a new draft as current working version and clear published snapshot.
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
          setRefreshKey((k) => k + 1);
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-charcoal flex items-center gap-2">
              <FolderIcon className="w-4 h-4 text-teal" />
              Folders
            </h2>
            {canManage && (
              <button
                type="button"
                onClick={async () => {
                  if (!activeCompanyId || !user?.id) return;
                  await seedDefaultDocumentFolders({ companyId: activeCompanyId, actorUserId: user.id as UUID });
                  setRefreshKey((k) => k + 1);
                }}
                className="text-xs font-semibold text-teal hover:text-teal-700"
              >
                Seed defaults
              </button>
            )}
          </div>
          {foldersError && <p className="text-xs text-critical">{foldersError.message}</p>}
          {folderList.length === 0 ? (
            <p className="text-sm text-charcoal-500">No folders yet. Seed defaults to get started.</p>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSelectedFolderId('')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${!selectedFolderId ? 'bg-teal-50 text-teal' : 'hover:bg-surface-50 text-charcoal'}`}
              >
                All documents
              </button>
              {(folderTree.byParent.get('root') ?? []).map((root) => (
                <div key={root.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedFolderId(String(root.id))}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold ${selectedFolderId === String(root.id) ? 'bg-teal-50 text-teal' : 'hover:bg-surface-50 text-charcoal'}`}
                  >
                    {root.name}
                  </button>
                  <div className="pl-3">
                    {(folderTree.byParent.get(String(root.id)) ?? []).map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => setSelectedFolderId(String(child.id))}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedFolderId === String(child.id) ? 'bg-teal-50 text-teal' : 'hover:bg-surface-50 text-charcoal'}`}
                      >
                        {child.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-surface-300 shadow-card p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-xl">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search documents…"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
              />
            </div>
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

          {docsError && (
            <div className="bg-white rounded-xl border border-critical/30 p-4 shadow-card">
              <p className="text-sm font-semibold text-critical">Unable to load documents</p>
              <p className="text-sm text-charcoal-500 mt-1">{docsError.message}</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
              <h3 className="font-semibold text-charcoal flex items-center gap-2">
                <FileTextIcon className="w-4 h-4 text-teal" />
                Documents
              </h3>
              <span className="text-sm text-charcoal-400">{filteredDocs.length} items</span>
            </div>

            {docsLoading ? (
              <div className="p-5 text-sm text-charcoal-500">Loading…</div>
            ) : filteredDocs.length === 0 ? (
              <div className="p-5">
                <ListEmptyState
                  icon={FileTextIcon}
                  title={docList.length === 0 ? 'No documents yet' : 'No documents match your search'}
                  description="Upload controlled documents, request approvals, and track review dates."
                  primaryAction={canManage ? { kind: 'button', label: 'Upload document', onClick: () => setUploadOpen(true) } : { kind: 'link', to: '/dashboard', label: 'Back to dashboard' }}
                  secondaryAction={docList.length > 0 && q.trim() ? { kind: 'button', label: 'Clear search', onClick: () => setQ('') } : undefined}
                />
              </div>
            ) : (
              <div className="divide-y divide-surface-100">
                {filteredDocs.map((d) => {
                  const pubId = d.published_version_id ? String(d.published_version_id) : '';
                  const curId = d.current_version_id ? String(d.current_version_id) : '';
                  const pub = pubId ? versionById.get(pubId) ?? null : null;
                  const cur = curId ? versionById.get(curId) ?? null : null;
                  const showStatus = pub ? 'approved' : (cur?.status ?? d.status);
                  const badge = toStatusBadge(showStatus);
                  const overdue = isOverdue(d.review_due_at) && !!pub;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedDocId(String(d.id))}
                      className={`w-full text-left px-5 py-4 hover:bg-surface-50 ${selectedDocId === String(d.id) ? 'bg-surface-50' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-charcoal">{d.title}</p>
                          <p className="text-xs text-charcoal-500 mt-1">
                            DOC-{shortId(String(d.id))} • {d.module} • {d.category}
                          </p>
                          {d.description && <p className="text-xs text-charcoal-500 mt-1 line-clamp-2">{d.description}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          {overdue && <span className="text-[10px] font-semibold text-critical">REVIEW OVERDUE</span>}
                          <span className={`inline-flex items-center px-2 py-1 rounded border text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-charcoal-500">
                        <span>Published: {pub ? pub.version_label : '—'}</span>
                        <span>•</span>
                        <span>Draft: {cur && cur.status !== 'approved' ? cur.version_label : '—'}</span>
                        <span>•</span>
                        <span>Next review: {d.review_due_at ? String(d.review_due_at).slice(0, 10) : '—'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedDoc && (
            <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-charcoal">{selectedDoc.title}</p>
                  <p className="text-xs text-charcoal-500 mt-1">DOC-{shortId(String(selectedDoc.id))}</p>
                </div>
                <div className="flex items-center gap-2">
                  {publishedVersion?.id && (
                    <button
                      type="button"
                      onClick={() => void openPublishedPreview(selectedDoc)}
                      className="px-3 py-2 rounded-lg border border-surface-300 text-xs font-semibold text-charcoal hover:bg-surface-50"
                    >
                      View published
                    </button>
                  )}
                  {publishedVersion?.id && (
                    <button
                      type="button"
                      onClick={() => navigate(`/documents/editor/${publishedVersion.id}?mode=view`)}
                      className="px-3 py-2 rounded-lg bg-surface-900 text-white text-xs font-semibold hover:bg-surface-800"
                    >
                      Open editor (view)
                    </button>
                  )}
                  {currentVersion?.id && canManage && (
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-surface-200 p-3">
                  <p className="text-xs text-charcoal-500">Published version</p>
                  <p className="text-sm font-semibold text-charcoal mt-1">{publishedVersion ? publishedVersion.version_label : '—'}</p>
                </div>
                <div className="rounded-xl border border-surface-200 p-3">
                  <p className="text-xs text-charcoal-500">Current working version</p>
                  <p className="text-sm font-semibold text-charcoal mt-1">{currentVersion ? `${currentVersion.version_label} (${currentVersion.status})` : '—'}</p>
                </div>
                <div className="rounded-xl border border-surface-200 p-3">
                  <p className="text-xs text-charcoal-500">Next review date</p>
                  <p className={`text-sm font-semibold mt-1 ${isOverdue(selectedDoc.review_due_at) ? 'text-critical' : 'text-charcoal'}`}>
                    {selectedDoc.review_due_at ? String(selectedDoc.review_due_at).slice(0, 10) : '—'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {publishedVersion && canManage && (
                  <button
                    type="button"
                    onClick={() => setEditChoiceOpen(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-300 bg-white text-xs font-semibold text-charcoal hover:bg-surface-50"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Edit approved (create draft)
                  </button>
                )}
                {currentVersion && canManage && String(currentVersion.status) !== 'approved' && String(currentVersion.status) !== 'archived' && (
                  <button
                    type="button"
                    onClick={() => setApprovalOpen(true)}
                    className="px-3 py-2 rounded-lg bg-success text-white text-xs font-semibold hover:bg-success-600"
                  >
                    Request approval
                  </button>
                )}
                <button type="button" onClick={() => setRefreshKey((k) => k + 1)} className="px-3 py-2 rounded-lg border border-surface-300 text-xs font-semibold text-charcoal hover:bg-surface-50">
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
