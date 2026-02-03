export type ApiMode = 'mock' | 'insforge';

function readEnv(key: string): string | undefined {
  // Vite injects import.meta.env.* at build time
  return (import.meta as any)?.env?.[key] as string | undefined;
}

const insforgeBaseUrl = readEnv('VITE_INSFORGE_BASE_URL') ?? '';
const insforgeAnonKey = readEnv('VITE_INSFORGE_ANON_KEY') ?? '';
const inferredMode: ApiMode = insforgeBaseUrl && insforgeAnonKey ? 'insforge' : 'mock';

export const apiConfig = {
  mode: (readEnv('VITE_API_MODE') as ApiMode | undefined) ?? inferredMode,
  insforge: {
    baseUrl: insforgeBaseUrl,
    anonKey: insforgeAnonKey
  }
};

