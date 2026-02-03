import React from 'react';
import { motion } from 'framer-motion';
type ComplianceScoreProps = {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showLabel?: boolean;
};
const sizeConfig = {
  sm: {
    width: 80,
    strokeWidth: 6,
    fontSize: 'text-lg'
  },
  md: {
    width: 120,
    strokeWidth: 8,
    fontSize: 'text-2xl'
  },
  lg: {
    width: 180,
    strokeWidth: 10,
    fontSize: 'text-4xl'
  }
};
function getScoreColor(score: number): string {
  if (score >= 90) return '#2ECC71';
  if (score >= 75) return '#0FB9B1';
  if (score >= 60) return '#F5A623';
  return '#E74C3C';
}
export function ComplianceScore({
  score,
  size = 'md',
  label = 'Compliance',
  showLabel = true
}: ComplianceScoreProps) {
  const config = sizeConfig[size];
  const radius = (config.width - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - score / 100 * circumference;
  const color = getScoreColor(score);
  return (
    <div className="flex flex-col items-center">
      <div
        className="relative"
        style={{
          width: config.width,
          height: config.width
        }}>

        {/* Background circle */}
        <svg
          className="transform -rotate-90"
          width={config.width}
          height={config.width}>

          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={radius}
            fill="none"
            stroke="#E8ECF0"
            strokeWidth={config.strokeWidth} />

          <motion.circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{
              strokeDashoffset: circumference
            }}
            animate={{
              strokeDashoffset
            }}
            transition={{
              duration: 1,
              ease: 'easeOut'
            }} />

        </svg>
        {/* Score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className={`font-bold text-charcoal ${config.fontSize}`}
            initial={{
              opacity: 0,
              scale: 0.5
            }}
            animate={{
              opacity: 1,
              scale: 1
            }}
            transition={{
              delay: 0.5,
              duration: 0.3
            }}>

            {score}%
          </motion.span>
        </div>
      </div>
      {showLabel &&
      <p className="mt-2 text-sm font-medium text-charcoal-500">{label}</p>
      }
    </div>);

}