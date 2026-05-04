import React, { useEffect, useState } from 'react';
import { AlertCircle, Clock, Zap } from 'lucide-react';
import { useTenant } from '../../tenant/TenantContext';
import { getLicenseInfo, isInTrial, getTrialDaysRemaining } from '../../api/services/licensingService';
import type { LicenseInfo } from '../../api/services/licensingService';

interface LicenseBannerProps {
  compact?: boolean;
}

/**
 * Display license status and trial warnings
 */
export function LicenseBanner({ compact = false }: LicenseBannerProps) {
  const { activeCompanyId, isTenantLoaded } = useTenant();
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [inTrial, setInTrial] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadLicenseInfo();
  }, [activeCompanyId, isTenantLoaded]);

  async function loadLicenseInfo() {
    if (!isTenantLoaded || !activeCompanyId) {
      setLoading(false);
      setLicenseInfo(null);
      return;
    }
    try {
      setLoading(true);
      const [license, trial, trialDays] = await Promise.all([
        getLicenseInfo(activeCompanyId),
        isInTrial(activeCompanyId),
        getTrialDaysRemaining(activeCompanyId),
      ]);
      setLicenseInfo(license);
      setInTrial(trial);
      setTrialDaysLeft(trialDays);
    } catch (err) {
      console.error('Failed to load license info:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !licenseInfo) {
    return null;
  }

  // Trial expiring soon (< 7 days)
  if (inTrial && trialDaysLeft < 7 && trialDaysLeft > 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-800">Trial Expiring Soon</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Your {licenseInfo.type === 'starter_6m' ? 'Starter' : 'Trial'} license expires in{' '}
              <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}</strong>
            </p>
            <button className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded text-sm font-medium hover:bg-yellow-700 transition">
              Upgrade Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // License expired
  if (licenseInfo.isExpired) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-800">License Expired</h3>
            <p className="text-sm text-red-700 mt-1">
              Your {licenseInfo.type} license expired on {new Date(licenseInfo.expiresAt).toLocaleDateString()}
            </p>
            <button className="mt-3 px-4 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 transition">
              Renew License
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Employee limit warning
  const percentUsed = (licenseInfo.currentEmployees / licenseInfo.employeeLimit) * 100;
  if (percentUsed >= 80) {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-3">
          <Zap className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-orange-800">Employee Limit Warning</h3>
            <p className="text-sm text-orange-700 mt-1">
              You're using {licenseInfo.currentEmployees} of {licenseInfo.employeeLimit} employee slots
            </p>
            <div className="mt-2 w-full bg-orange-200 rounded-full h-2">
              <div className="bg-orange-600 h-2 rounded-full" style={{ width: `${Math.min(percentUsed, 100)}%` }} />
            </div>
            {percentUsed >= 95 && (
              <button className="mt-3 px-4 py-2 bg-orange-600 text-white rounded text-sm font-medium hover:bg-orange-700 transition">
                Upgrade License
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // No issues - show compact info if requested
  if (compact) {
    return (
      <div className="text-xs text-gray-500">
        License: {licenseInfo.type} • {licenseInfo.currentEmployees}/{licenseInfo.employeeLimit} employees •{' '}
        {licenseInfo.daysRemaining} days remaining
      </div>
    );
  }

  return null;
}

/**
 * Overlay to restrict access to features not available in license
 */
interface FeatureLockedProps {
  featureName: string;
  currentLicense: string;
  requiredLicense: string;
}

export function FeatureLocked({ featureName, currentLicense, requiredLicense }: FeatureLockedProps) {
  return (
    <div className="flex items-center justify-center min-h-96 bg-gray-50 rounded-lg border border-gray-200">
      <div className="text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-800">Feature Locked</h3>
        <p className="text-sm text-gray-600 mt-2">
          <strong>{featureName}</strong> is only available on {requiredLicense} license
        </p>
        <p className="text-xs text-gray-500 mt-1">You are currently on {currentLicense} license</p>
        <button className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">
          Upgrade to {requiredLicense}
        </button>
      </div>
    </div>
  );
}
