import React from 'react';
type ProgressBarProps = {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'critical';
};
const sizeStyles = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4'
};
const variantStyles = {
  default: 'bg-teal',
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-critical'
};
function getAutoVariant(
percentage: number)
: 'success' | 'warning' | 'critical' | 'default' {
  if (percentage >= 80) return 'success';
  if (percentage >= 60) return 'default';
  if (percentage >= 40) return 'warning';
  return 'critical';
}
export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = true,
  size = 'md',
  variant
}: ProgressBarProps) {
  const percentage = Math.min(Math.max(value / max * 100, 0), 100);
  const autoVariant = variant || getAutoVariant(percentage);
  return (
    <div className="w-full">
      {(label || showValue) &&
      <div className="flex justify-between items-center mb-1.5">
          {label &&
        <span className="text-sm font-medium text-charcoal-600">
              {label}
            </span>
        }
          {showValue &&
        <span className="text-sm font-medium text-charcoal-500">
              {Math.round(percentage)}%
            </span>
        }
        </div>
      }
      <div
        className={`w-full bg-surface-200 rounded-full overflow-hidden ${sizeStyles[size]}`}>

        <div
          className={`${sizeStyles[size]} ${variantStyles[autoVariant]} rounded-full transition-all duration-500 ease-out`}
          style={{
            width: `${percentage}%`
          }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max} />

      </div>
    </div>);

}