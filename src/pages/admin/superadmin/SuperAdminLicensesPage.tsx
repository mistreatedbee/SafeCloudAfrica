import React from 'react';
import { motion } from 'framer-motion';
import { CreditCardIcon } from 'lucide-react';
import { SuperAdminLicensesContent } from '../SuperAdminLicensesContent';

export function SuperAdminLicensesPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="bg-white rounded-xl border border-surface-300 shadow-card p-5">
        <p className="text-sm font-semibold text-charcoal flex items-center gap-2">
          <CreditCardIcon className="w-4 h-4 text-teal" /> Licenses & Billing
        </p>
        <p className="text-sm text-charcoal-500 mt-1">
          Create and manage subscription licenses per organisation. View remaining days and seats.
        </p>
      </div>
      <SuperAdminLicensesContent />
    </motion.div>
  );
}
