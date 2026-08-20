import React, { type ComponentType } from 'react';
import {
  ShieldIcon,
  AwardIcon,
  LeafIcon,
  HeartIcon,
  ScaleIcon,
  UsersIcon,
  LockIcon,
  FolderIcon } from
'lucide-react';
import { ProgressBar } from './ProgressBar';
type ModuleCardProps = {
  name: string;
  isoStandard?: string;
  score: number;
  icon: string;
  color: string;
  onClick?: () => void;
};
const iconMap: Record<string, ComponentType<any>> =
{
  Shield: ShieldIcon,
  Award: AwardIcon,
  Leaf: LeafIcon,
  Heart: HeartIcon,
  Scale: ScaleIcon,
  Users: UsersIcon,
  Lock: LockIcon,
  Folder: FolderIcon
};
export function ModuleCard({
  name,
  isoStandard,
  score,
  icon,
  color,
  onClick
}: ModuleCardProps) {
  const IconComponent = iconMap[icon] || FolderIcon;
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-xl border border-surface-300 p-5 shadow-card hover:shadow-card-hover transition-all duration-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 active:scale-[0.99]">

      <div className="flex items-start gap-4">
        <div
          className="flex-shrink-0 p-3 rounded-lg"
          style={{
            backgroundColor: `${color}15`
          }}>

          <IconComponent
            className="w-6 h-6"
            style={{
              color
            }} />

        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-charcoal">{name}</h3>
          {isoStandard &&
          <p className="text-sm text-charcoal-400 mt-0.5">{isoStandard}</p>
          }
          <div className="mt-3">
            <ProgressBar value={score} size="sm" showValue={true} />
          </div>
        </div>
      </div>
    </button>);

}