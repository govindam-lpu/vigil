// Shared fetch helper for TanStack Query queryFns. Throws on any non-2xx response so
// React Query treats it as an error (views surface LoadError with a retry).
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new ApiError(response.status, `Request to ${url} failed with ${response.status}`);
  }
  return (await response.json()) as T;
}
