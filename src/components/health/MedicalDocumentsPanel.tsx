import React from 'react';
import type { HealthMedical, UUID } from '../../api/models/entities';
import { EvidenceModal } from '../evidence/EvidenceModal';
import { useAsync } from '../../api/hooks/useAsync';
import { listEvidence } from '../../api/services/evidenceService';

export function MedicalDocumentsPanel(props: {
  medical: HealthMedical;
  companyId: UUID;
  actorUserId: UUID;
}) {
  const [open, setOpen] = React.useState(false);
  const { data: documents, loading } = useAsync(async () => {
    return await listEvidence(props.companyId, { entityType: 'health_medical', entityId: props.medical.id, limit: 100 });
  }, [props.companyId, props.medical.id, open]);

  const rows = documents ?? [];

  return (
    <div className="bg-white border border-surface-300 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-charcoal">Medical documents</p>
          <p className="text-xs text-charcoal-500 mt-0.5">Upload fitness certificates and medical reports for this record.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-semibold hover:bg-teal-600"
        >
          Manage documents
        </button>
      </div>
      <div className="border border-dashed border-surface-300 rounded-lg px-3 py-2 max-h-40 overflow-y-auto">
        {loading && <p className="text-xs text-charcoal-400">Loading documents...</p>}
        {!loading && rows.length === 0 && <p className="text-xs text-charcoal-400">No documents uploaded yet.</p>}
        {!loading && rows.length > 0 && (
          <ul className="space-y-1 text-xs">
            {rows.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-charcoal-700">{doc.display_title ?? doc.original_filename ?? 'Document'}</p>
                  <p className="text-[11px] text-charcoal-400">
                    {new Date(doc.created_at).toLocaleString('en-ZA')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <EvidenceModal
        open={open}
        onClose={() => setOpen(false)}
        companyId={props.companyId}
        actorUserId={props.actorUserId}
        entityType="health_medical"
        entityId={props.medical.id}
        title="Medical documents"
      />
    </div>
  );
}

