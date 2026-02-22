import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { HeadphonesIcon } from 'lucide-react';
import { useUser } from '@insforge/react';
import { useAsync } from '../../../api/hooks/useAsync';
import { insforge } from '../../../api/insforge/client';
import { logPlatformAdminAction } from '../../../api/services/platformAdminAuditService';
import type { Company } from '../../../api/models/entities';
import type { UUID } from '../../../api/models/entities';

const SUPPORT_MODE_KEY = 'sca_super_admin_support_mode_company';

function getStoredSupportModeCompany(): { id: string; name: string } | null {
  try {
    const raw = sessionStorage.getItem(SUPPORT_MODE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && typeof p.id === 'string' && typeof p.name === 'string' ? p : null;
  } catch {
    return null;
  }
}

function setStoredSupportModeCompany(value: { id: string; name: string } | null): void {
  try {
    if (!value) sessionStorage.removeItem(SUPPORT_MODE_KEY);
    else sessionStorage.setItem(SUPPORT_MODE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function SuperAdminSupportModePage() {
  const { user } = useUser();
  const [supportMode, setSupportMode] = useState<{ id: string; name: string } | null>(getStoredSupportModeCompany);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: companies } = useAsync(
    async () => {
      const { data, error } = await insforge.database.from('companies').select('id, name').order('name').limit(300);
      if (error) throw error;
      return (data ?? []) as Company[];
    },
    []
  );

  const companyList = companies ?? [];
  const [selectedId, setSelectedId] = useState('');

  const handleEnter = async () => {
    if (!selectedId || !user?.id) return;
    const company = companyList.find((c) => c.id === selectedId);
    if (!company) return;
    setMessage(null);
    try {
      await logPlatformAdminAction(user.id as UUID, {
        action: 'support_mode_entered',
        target_company_id: company.id as UUID,
        details: { company_name: company.name }
      });
      setSupportMode({ id: company.id, name: company.name });
      setStoredSupportModeCompany({ id: company.id, name: company.name });
      setMessage({ type: 'success', text: `Support mode: viewing as ${company.name}. All access is logged.` });
    } catch (err) {
      setMessage({ type: 'error', text: String((err as Error)?.message ?? err) });
    }
  };

  const handleExit = async () => {
    if (!supportMode || !user?.id) return;
    setMessage(null);
    try {
      await logPlatformAdminAction(user.id as UUID, {
        action: 'support_mode_exited',
        target_company_id: supportMode.id as UUID,
        details: { company_name: supportMode.name }
      });
      setSupportMode(null);
      setStoredSupportModeCompany(null);
      setMessage({ type: 'success', text: 'Support mode ended.' });
    } catch (err) {
      setMessage({ type: 'error', text: String((err as Error)?.message ?? err) });
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
        <p className="text-sm font-semibold text-charcoal flex items-center gap-2">
          <HeadphonesIcon className="w-4 h-4 text-teal" /> Support Mode
        </p>
        <p className="text-sm text-charcoal-500 mt-1">
          View as a tenant for support. All access is logged. Do not use for casual viewing of company data.
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

      {supportMode ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-sm font-medium text-amber-900">Currently viewing as: {supportMode.name}</p>
          <p className="text-xs text-amber-700 mt-1">All actions in this session are audited.</p>
          <button
            type="button"
            onClick={handleExit}
            className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
          >
            Exit support mode
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
          <label className="block text-sm font-medium text-charcoal mb-2">Select organisation</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full max-w-md px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-teal focus:border-transparent"
          >
            <option value="">Select organisation</option>
            {companyList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleEnter}
            disabled={!selectedId}
            className="mt-4 px-4 py-2 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-50"
          >
            Enter support mode
          </button>
        </div>
      )}
    </motion.div>
  );
}
