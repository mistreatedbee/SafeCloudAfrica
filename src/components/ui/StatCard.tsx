import React, { type ComponentType } from 'react';
import {
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
  ShieldIcon,
  AwardIcon,
  LeafIcon,
  HeartIcon,
  ScaleIcon,
  UsersIcon,
  AlertTriangleIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  CalendarIcon } from
'lucide-react';
type StatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  trendLabel?: string;
  icon?: string;
  iconColor?: string;
  variant?: 'default' | 'success' | 'warning' | 'critical' | 'info';
};
const iconMap: Record<string, ComponentType<any>> =
{
  Shield: ShieldIcon,
  Award: AwardIcon,
  Leaf: LeafIcon,
  Heart: HeartIcon,
  Scale: ScaleIcon,
  Users: UsersIcon,
  AlertTriangle: AlertTriangleIcon,
  ClipboardCheck: ClipboardCheckIcon,
  FileText: FileTextIcon,
  Calendar: CalendarIcon
};
const variantStyles = {
  default: 'bg-white',
  success: 'bg-success-50 border-success/20',
  warning: 'bg-warning-50 border-warning/20',
  critical: 'bg-critical-50 border-critical/20',
  info: 'bg-teal-50 border-teal/20'
};
const iconBgStyles = {
  default: 'bg-navy-50',
  success: 'bg-success/10',
  warning: 'bg-warning/10',
  critical: 'bg-critical/10',
  info: 'bg-teal/10'
};
export function StatCard({
  title,
  value,
  subtitle,
  trend,
  trendValue,
  trendLabel,
  icon,
  iconColor = '#0A2540',
  variant = 'default'
}: StatCardProps) {
  const IconComponent = icon ? iconMap[icon] : null;
  return (
    <div
      className={`rounded-xl border border-surface-300 p-5 shadow-card ${variantStyles[variant]}`}>

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-charcoal-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-charcoal">{value}</p>
          {subtitle &&
          <p className="text-sm text-charcoal-400 mt-1">{subtitle}</p>
          }
          {trend && trendValue !== undefined &&
          <div className="flex items-center gap-1.5 mt-2">
              {trend === 'up' &&
            <span className="flex items-center text-success text-sm font-medium">
                  <TrendingUpIcon className="w-4 h-4 mr-0.5" />+{trendValue}%
                </span>
            }
              {trend === 'down' &&
            <span className="flex items-center text-critical text-sm font-medium">
                  <TrendingDownIcon className="w-4 h-4 mr-0.5" />-{trendValue}%
                </span>
            }
              {trend === 'stable' &&
            <span className="flex items-center text-charcoal-400 text-sm font-medium">
                  <MinusIcon className="w-4 h-4 mr-0.5" />
                  0%
                </span>
            }
              {trendLabel &&
            <span className="text-xs text-charcoal-400">{trendLabel}</span>
            }
            </div>
          }
        </div>
        {IconComponent &&
        <div className={`p-3 rounded-lg ${iconBgStyles[variant]}`}>
            <IconComponent
            className="w-6 h-6"
            style={{
              color: iconColor
            }} />

          </div>
        }
      </div>
    </div>);

}