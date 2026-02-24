import React, { useMemo, useState } from 'react';
import type { Document, UUID } from '../../api/models/entities';
import { useAsync } from '../../api/hooks/useAsync';
import { listDocuments } from '../../api/services/documentsService';

export type DocumentPickerValue = Array<{ documentId: UUID; documentTitleSnapshot: string }>;

export function DocumentPicker(props: {
  companyId: UUID;
  value: DocumentPickerValue;
  onChange: (next: DocumentPickerValue) => void;
  label?: string;
}) {
  const [search, setSearch] = useState('');
  const { data, loading } = useAsync<Document[]>(
    async () => {
      return await listDocuments(props.companyId);
    },
    [props.companyId]
  );

  const selectedMap = useMemo(() => new Map((props.value ?? []).map((v) => [v.documentId, v.documentTitleSnapshot])), [props.value]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((d) => d.title.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-charcoal">{props.label ?? 'Compliance Evidence'}</label>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search documents by title"
        className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm"
      />
      <div className="border border-surface-300 rounded-lg max-h-48 overflow-auto">
        {loading && <p className="px-3 py-2 text-sm text-charcoal-500">Loading documents...</p>}
        {!loading && filtered.length === 0 && <p className="px-3 py-2 text-sm text-charcoal-500">No documents found.</p>}
        {!loading &&
          filtered.map((doc) => {
            const checked = selectedMap.has(doc.id);
            return (
              <label key={doc.id} className="flex items-center gap-2 px-3 py-2 border-b border-surface-100 last:border-b-0">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) {
                      props.onChange([...(props.value ?? []), { documentId: doc.id, documentTitleSnapshot: doc.title }]);
                    } else {
                      props.onChange((props.value ?? []).filter((v) => v.documentId !== doc.id));
                    }
                  }}
                />
                <span className="text-sm text-charcoal">{doc.title}</span>
              </label>
            );
          })}
      </div>
    </div>
  );
}
