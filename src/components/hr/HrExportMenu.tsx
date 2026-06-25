import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, DownloadIcon } from 'lucide-react';
import { useIdentity } from '../../hooks/useIdentity';
import { exportHrReport, type HrReportColumn } from '../../api/services/hrReportExportService';

export function HrExportMenu({
  moduleName,
  columns,
  rows
}: {
  moduleName: string;
  columns: HrReportColumn[];
  rows: Record<string, unknown>[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { fullName, organisationName } = useIdentity();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function onExport(format: 'excel' | 'pdf') {
    setIsOpen(false);
    exportHrReport({
      moduleName,
      companyName: organisationName,
      generatedByName: fullName,
      columns,
      rows,
      format
    });
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-300 text-sm hover:bg-surface-50"
        aria-expanded={isOpen}
      >
        <DownloadIcon className="w-4 h-4" />
        Export
        <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-elevated border border-surface-200 overflow-hidden z-50">
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-sm hover:bg-surface-50"
            onClick={() => onExport('excel')}
          >
            Export Excel
          </button>
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-sm hover:bg-surface-50"
            onClick={() => onExport('pdf')}
          >
            Export PDF
          </button>
        </div>
      )}
    </div>
  );
}
