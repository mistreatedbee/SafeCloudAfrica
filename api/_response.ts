const NO_STORE_CACHE_CONTROL = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';

export function applyNoStoreHeaders(res: any): void {
  if (!res?.setHeader) return;
  res.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}
