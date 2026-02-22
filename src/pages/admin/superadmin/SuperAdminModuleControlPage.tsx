import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ToggleLeftIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { useAsync } from '../../../api/hooks/useAsync';
import { insforge } from '../../../api/insforge/client';
import { logPlatformAdminAction } from '../../../api/services/platformAdminAuditService';
import type { Company } from '../../../api/models/entities';
import type { ModuleKey } from '../../../api/models/core';
import type { UUID } from '../../../api/models/entities';

const MODULE_KEYS: { key: ModuleKey; label: string }[] = [
  { key: 'safety', label: 'Safety' },
  { key: 'quality', label: 'Quality' },
  { key: 'legal', label: 'Legal' },
  { key: 'environment', label: 'Environment' },
  { key: 'health', label: 'Health' },
  { key: 'hr', label: 'HR' },
  { key: 'general', label: 'General' },
  { key: 'security', label: 'Security' }
];

function getModules(c: Company): Record<string, boolean> {
  const mod = c.modules_enabled ?? (c.metadata as Record<string, unknown> | undefined)?.['modules_enabled'];
  if (mod && typeof mod === 'object') return mod as Record<string, boolean>;
  return {};
}

export function SuperAdminModuleControlPage() {
  const { user } = useUser();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const { data: companies, loading, error } = useAsync(
    async () => {
      const { data, error: e } = await insforge.database.from('companies').select('id, name, metadata').order('name').limit(300);
      if (e) throw e;
      return (data ?? []) as Company[];
    },
    [version]
  );

  const list = companies ?? [];

  const handleToggle = async (companyId: string, moduleKey: string, enabled: boolean) => {
    const c = list.find((x) => x.id === companyId);
    if (!c) return;
    setSavingId(companyId);
    setMessage(null);
    const currentMeta = (c.metadata as Record<string, unknown>) ?? {};
    const currentModules = (currentMeta['modules_enabled'] as Record<string, boolean>) ?? {};
    const nextModules = { ...currentModules, [moduleKey]: enabled };
    const nextMeta = { ...currentMeta, modules_enabled: nextModules };

    try {
      const { error: e } = await insforge.database
        .from('companies')
        .update({ metadata: nextMeta })
        .eq('id', companyId);
      if (e) throw e;
      if (user?.id) {
        await logPlatformAdminAction(user.id as UUID, {
          action: 'module_toggled',
          target_company_id: companyId as UUID,
          details: { module_key: moduleKey, enabled }
        });
      }
      setMessage({ type: 'success', text: `Modules updated for ${c.name}.` });
      setVersion((v) => v + 1);
    } catch (err) {
      setMessage({ type: 'error', text: String((err as Error)?.message ?? err) });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
        <p className="text-sm font-semibold text-charcoal flex items-center gap-2">
          <ToggleLeftIcon className="w-4 h-4 text-teal" /> Module Control
        </p>
        <p className="text-sm text-charcoal-500 mt-1">
          Enable or disable modules per organisation (Safety, Quality, Legal, Environment, Health, HR, General, Security).
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-critical/10 text-critical'
          }`}
        >
          {message.text}
        </div>
      )}

      {error && (
        <p className="text-sm text-critical">{String((error as Error)?.message)}</p>
      )}

      {loading && <p className="text-sm text-charcoal-500">Loading organisations…</p>}

      {!loading && list.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-300 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-charcoal-500 uppercase">Organisation</th>
                  {MODULE_KEYS.map((m) => (
                    <th key={m.key} className="px-3 py-3 text-center text-xs font-semibold text-charcoal-500 uppercase">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {list.map((c) => {
                  const modules = getModules(c);
                  const isSaving = savingId === c.id;
                  return (
                    <tr key={c.id} className="hover:bg-surface-50">
                      <td className="px-5 py-3 text-sm font-medium text-charcoal">{c.name}</td>
                      {MODULE_KEYS.map((m) => (
                        <td key={m.key} className="px-3 py-3 text-center">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleToggle(c.id, m.key, !modules[m.key])}
                            className={`inline-flex items-center justify-center w-10 h-6 rounded-full transition-colors ${
                              modules[m.key] ? 'bg-teal text-white' : 'bg-surface-200 text-charcoal-400'
                            } ${isSaving ? 'opacity-50' : ''}`}
                            title={modules[m.key] ? 'Disable' : 'Enable'}
                          >
                            {modules[m.key] ? 'On' : 'Off'}
                          </button>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && list.length === 0 && (
        <p className="text-sm text-charcoal-500">No organisations found.</p>
      )}
    </motion.div>
  );
}
