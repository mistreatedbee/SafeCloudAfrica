import type { KPIItem, KpiImportance, UUID } from '../models/entities';

export type KpiTemplateFormRow = {
  kpiItemId: UUID | null;
  kpiQuestionnaire: string;
  importanceRating: KpiImportance;
};

export function mapKpiTemplateItemToFormRow(item: KPIItem): KpiTemplateFormRow {
  return {
    kpiItemId: item.kpi_item_id,
    kpiQuestionnaire: item.title,
    importanceRating: item.default_importance
  };
}

