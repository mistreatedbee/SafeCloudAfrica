import { insforge } from './client';

export class ApiError extends Error {
  public readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export async function invokeJson<T>(
  slug: string,
  options?: { method?: 'GET' | 'POST'; body?: any; headers?: Record<string, string> }
): Promise<T> {
  const { data, error } = await insforge.functions.invoke(slug, {
    method: options?.method ?? 'GET',
    body: options?.body,
    headers: options?.headers
  });

  if (error) throw new ApiError(error.message);
  return data as T;
}

