import React from 'react';
import { Link } from 'react-router-dom';
import { CloudIcon, MailIcon, ShieldCheckIcon } from 'lucide-react';

export function MarketingFooter() {
  return (
    <footer className="border-t border-surface-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-navy to-navy-700">
                <CloudIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-bold text-navy leading-tight">Safe Cloud</p>
                <p className="text-sm text-teal font-medium">Africa</p>
              </div>
            </div>
            <p className="text-sm text-charcoal-500 mt-4 max-w-md">
              Integrated Digital Safety Management Programme (IDSMP) for documents, incidents, training, and compliance
              workflows—built to align with international ISO standards.
            </p>
            <div className="mt-3">
              <Link
                to="/#iso-alignment"
                className="text-sm font-medium text-teal hover:underline underline-offset-2"
              >
                Learn more about ISO alignment
              </Link>
            </div>
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-charcoal-500">
              <ShieldCheckIcon className="w-4 h-4 text-success shrink-0" />
              Built for auditability, evidence, and long-term scale.
            </div>
            <div className="mt-4">
              <Link
                to="/register"
                className="text-sm font-medium text-charcoal-500 hover:text-teal transition-colors"
              >
                Get started
              </Link>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-charcoal">Platform</p>
            <ul className="mt-3 space-y-2 text-sm text-charcoal-500">
              <li>
                <Link to="/security" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">
                  <ShieldCheckIcon className="w-3.5 h-3.5" />
                  Security &amp; trust
                </Link>
              </li>
              <li>Documents (DMS)</li>
              <li>Tasks & Time</li>
              <li>Incidents & CAPA</li>
              <li>Training & Competency</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-charcoal">Contact</p>
            <div className="mt-3 text-sm text-charcoal-500 space-y-2">
              <div className="inline-flex items-center gap-2">
                <MailIcon className="w-4 h-4" />
                <span>support@safecloud.africa</span>
              </div>
              <p className="text-xs text-charcoal-400">
                Replace this email with your preferred support inbox.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-charcoal-400">
          <p>© {new Date().getFullYear()} Safe Cloud Africa. All rights reserved.</p>
          <p>“One system. Total safety control.”</p>
        </div>
      </div>
    </footer>
  );
}
