import React, { type ComponentType } from 'react';
import {
  AlertTriangleIcon,
  UploadIcon,
  PlusCircleIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  UsersIcon,
  ShieldIcon,
  SettingsIcon } from
'lucide-react';
type QuickActionButtonProps = {
  icon: string;
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
};
const iconMap: Record<
  string,
  ComponentType<{
    className?: string;
  }>> =
{
  AlertTriangle: AlertTriangleIcon,
  Upload: UploadIcon,
  PlusCircle: PlusCircleIcon,
  ClipboardCheck: ClipboardCheckIcon,
  FileText: FileTextIcon,
  Users: UsersIcon,
  Shield: ShieldIcon,
  Settings: SettingsIcon
};
export function QuickActionButton({
  icon,
  label,
  onClick,
  variant = 'primary'
}: QuickActionButtonProps) {
  const IconComponent = iconMap[icon] || PlusCircleIcon;
  const baseStyles = `
    flex flex-col items-center justify-center gap-2 p-4 rounded-xl
    font-medium transition-all duration-200
    focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2
  `;
  const variantStyles = {
    primary: `
      bg-gradient-to-br from-teal to-teal-600 text-white
      hover:from-teal-600 hover:to-teal-700
      shadow-card hover:shadow-elevated
      active:scale-[0.98]
    `,
    secondary: `
      bg-white text-charcoal border border-surface-300
      hover:bg-surface-100 hover:border-surface-400
      shadow-card hover:shadow-card-hover
      active:scale-[0.98]
    `
  };
  return (
    <button
      onClick={onClick}
      className={`${baseStyles} ${variantStyles[variant]}`}
      aria-label={label}>

      <IconComponent className="w-6 h-6" />
      <span className="text-sm">{label}</span>
    </button>);

}