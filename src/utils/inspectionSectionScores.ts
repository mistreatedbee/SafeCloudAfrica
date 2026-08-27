import type { InspectionRunItem } from '../api/models/entities';

export type InspectionSectionScore = {
  section: string;
  score: number;
  maxScore: number;
  itemCount: number;
};

export function computeInspectionSectionScores(items: InspectionRunItem[]): InspectionSectionScore[] {
  const bySection = new Map<string, { score: number; maxScore: number; count: number }>();

  for (const item of items) {
    const section = item.audit_section_or_category || item.section || 'General';
    const curr = bySection.get(section) ?? { score: 0, maxScore: 0, count: 0 };
    curr.score += item.score ?? 0;
    curr.maxScore += item.max_score ?? 0;
    curr.count += 1;
    bySection.set(section, curr);
  }

  return Array.from(bySection.entries())
    .map(([section, agg]) => ({
      section,
      score: agg.score,
      maxScore: agg.maxScore,
      itemCount: agg.count
    }))
    .sort((a, b) => a.section.localeCompare(b.section));
}
