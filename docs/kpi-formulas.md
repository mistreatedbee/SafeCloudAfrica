# KPI Formulas (SafeCloud Africa / IDSMP)

This document describes how each KPI is calculated and where its data comes from. All rate formulas use a **multiplier** set per organisation in **KPI Settings**: **SMALL_BUSINESS** = 200,000, **CORPORATE** = 1,000,000.

---

## 12-month rolling rule

- Default period for incident- and hours-based rates is the **last 12 full calendar months**.
- Only incidents with `occurred_at` within the period are counted.
- **Total hours worked** = sum of `work_hours_monthly.total_hours_worked_final` for every month in the period.
- If a month in the period has no hours entry, the UI shows a “Missing Inputs” warning; KPIs are computed using available months only (or you can enforce “complete all 12 months” in configuration).

---

## LTI-free hours (accumulative, with reset)

- **LTI-free hours** = sum of `total_hours_worked_final` from the **month after** the most recent LTI or Fatality (configurable in KPI Settings: `lti_reset_triggers`, e.g. `['LTI','FATALITY']`).
- If there has been no LTI or Fatality, the sum runs from the first available Work Hours Monthly entry to the latest.
- When an LTI or Fatality occurs, the counter resets; only hours from months **after** that incident’s date are counted.

---

## Safety KPIs (incident & injury rates)

All denominators: **Total hours worked** (rolling 12 months) from `work_hours_monthly`.  
All numerators: counts from `incidents` in the same period, using classification fields: `is_recordable_injury`, `is_lost_time_injury`, `is_fatality`, `is_near_miss`, `is_accident`, `is_environmental_incident`, `is_spill`, and `lost_days`.

| KPI | Formula | Data source |
|-----|--------|-------------|
| **TRIR / TRIFR** | (Total recordable injuries × multiplier) ÷ Total hours worked | `incidents.is_recordable_injury = true` |
| **LTIFR** | (Lost time injuries × multiplier) ÷ Total hours worked | `incidents.is_lost_time_injury = true` |
| **Severity Rate** | (Total lost days × multiplier) ÷ Total hours worked | Sum of `incidents.lost_days` |
| **Incident Frequency Rate** | (Total incidents × multiplier) ÷ Total hours worked | All incidents in period |
| **Fatality Rate** | (Fatalities × multiplier) ÷ Total hours worked | `incidents.is_fatality = true` |
| **Near Miss Frequency Rate** | (Near misses × multiplier) ÷ Total hours worked | `incidents.is_near_miss = true` |
| **Accident Frequency Rate** | (Accidents × multiplier) ÷ Total hours worked | `incidents.is_accident = true` |

---

## Compliance & performance KPIs

| KPI | Formula | Data source |
|-----|--------|-------------|
| **PPE Compliance %** | (Employees wearing PPE ÷ Employees observed) × 100 | `operational_inputs_monthly.ppe_employees_wearing` and `ppe_employees_observed` (monthly totals in period) |
| **Training Completion Rate %** | (Employees trained ÷ Total employees) × 100 | Distinct `user_id` in `training_records` in period; total employees from average `work_hours_monthly.total_employees` or fallback |
| **Inspection Compliance Rate %** | (Inspections completed ÷ Planned inspections) × 100 | `inspection_runs` in period: planned = all runs, completed = runs with `status = 'completed'` |
| **Corrective Action Closure Rate %** | (Closed actions ÷ Total actions raised) × 100 | `corrective_actions` created in period: raised = count, closed = status in `completed`, `verified`, `closed` |
| **Audit Score %** | (Points scored ÷ Total possible points) × 100 | Sum of `audit_responses.achieved_score` and `audit_questions.allocated_score` for completed audits in period |

---

## Quality KPIs

| KPI | Formula | Data source |
|-----|--------|-------------|
| **Customer Complaint Rate %** | (Number of complaints ÷ Total deliveries) × 100 | Complaints: `quality_ncrs` with `source = 'complaint'` in period; Total deliveries: sum of `operational_inputs_monthly.total_deliveries` in period |
| **Non-Conformance Rate %** | (Non-conforming items ÷ Total items inspected) × 100 | Non-conforming: count of NCRs in period (or from operational inputs); Total items inspected: sum of `operational_inputs_monthly.total_items_inspected` in period |

---

## Environmental KPIs

| KPI | Formula | Data source |
|-----|--------|-------------|
| **Waste Recycling Rate %** | (Recycled waste ÷ Total waste generated) × 100 | `operational_inputs_monthly.recycled_waste` and `total_waste_generated` in period |
| **Spill Frequency Rate** | (Total spills × multiplier) ÷ Total hours worked | `incidents.is_spill = true` in period; hours from `work_hours_monthly` |
| **Environmental Incident Rate** | (Environmental incidents × multiplier) ÷ Total hours worked | `incidents.is_environmental_incident = true` in period |
| **Energy Consumption Rate** | Total energy used ÷ Production output | `operational_inputs_monthly.total_energy_used` and `production_output` in period |

---

## Data entry requirements

- **Hours Worked** (Management → Hours Worked): one row per organisation per month; required for all safety and environmental rate denominators and for LTI-free hours.
- **Operational Inputs** (Management → Operational Inputs): optional per month; used for PPE compliance (observed/wearing), quality (deliveries, items inspected), and environment (waste, energy, production). If not entered, the corresponding KPI shows “—” or 0 where the denominator is missing.
- **Incident classification**: when creating/editing incidents, set (or rely on derived) `lost_days`, `is_recordable_injury`, `is_lost_time_injury`, `is_fatality`, `is_near_miss`, `is_accident`, `is_environmental_incident`, `is_spill` so safety and environmental rates are correct.

---

## Tenant isolation

All KPI calculations are scoped by `company_id`. Exports and reports only include data for the active organisation.
