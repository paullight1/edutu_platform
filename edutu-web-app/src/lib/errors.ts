import { captureException } from './sentry';

export class EdutuError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 500,
  ) {
    super(message);
    this.name = 'EdutuError';
  }
}

export async function safeQuery<T>(
  query: Promise<{ data: T | null; error: unknown }>,
  fallback: T,
): Promise<T> {
  const { data, error } = await query;
  if (error) {
    console.error('Query failed:', error);
    captureException(error, { source: 'safeQuery' });
    return fallback;
  }
  return data ?? fallback;
}
