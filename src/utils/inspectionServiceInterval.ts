/** Vehicle/machine service due calculation: closing reading + fixed interval. */
export function computeNextServiceHoursKm(
  closingHoursKm: number | null | undefined,
  serviceIntervalHoursKm: number | null | undefined
): number | null {
  if (closingHoursKm == null || serviceIntervalHoursKm == null) return null;
  if (Number.isNaN(closingHoursKm) || Number.isNaN(serviceIntervalHoursKm)) return null;
  return closingHoursKm + serviceIntervalHoursKm;
}
