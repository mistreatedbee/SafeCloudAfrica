export function buildEscalationChain(
  insforge: unknown,
  companyId: string,
  primaryUserId: string
): Promise<{ primary?: string[]; managers?: string[]; admins?: string[]; [key: string]: string[] | undefined }>;
