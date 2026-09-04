import { ApiError } from '@/lib/api/api-error';

export type ApiFetchOption = Omit<RequestInit, 'body'> & {
  body?: Record<string, unknown> | FormData;
  token?: string;
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
};

// ตัด trailing slash ออกจาก API_URL ป้องกันปัญหา double slash เช่น https://example.com//auth/register
const API_URL = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOption = {},
): Promise<T> {
  const { body, headers, token, ...init } = options;

  const newHeaders = new Headers(headers);
  if (token) {
    newHeaders.set('Authorization', `Bearer ${token}`);
  }

  if (body !== undefined && !(body instanceof FormData)) {
    newHeaders.set('content-type', 'application/json; charset=utf-8');
  }

  let newBody: BodyInit | undefined;
  if (!(body instanceof FormData)) {
    newBody = body !== undefined ? JSON.stringify(body) : undefined;
  } else {
    newBody = body;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_URL}${normalizedPath}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      body: newBody,
      headers: newHeaders,
    });
  } catch (fetchError) {
    console.error(`[apiFetch Network Error] Failed to fetch ${url}:`, fetchError);
    throw fetchError;
  }

  // จะสร้าง class ApiError (api-error.ts) เอง เพื่อเวลาเกิดไรขึ้น เราจะให้ server action ดักจับ
  if (!response.ok) {
    const errorText = await response.text();
    let message = response.statusText;
    if (errorText) {
      try {
        const errorJson = JSON.parse(errorText);
        if (Array.isArray(errorJson.message)) {
          message = errorJson.message.join(', ');
        } else if (errorJson.message) {
          message = String(errorJson.message);
        }
      } catch {
        message = errorText;
      }
    }
    console.error(`[apiFetch Error] ${response.status} ${url}:`, message);
    throw new ApiError(response.status, message);
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text as T;
  }

  // backend ห่อทุก response สำเร็จด้วย { success, data, timestamp, path }
  // ผ่าน global TransformInterceptor — unwrap .data ให้ทุกจุดที่เรียก apiFetch อัตโนมัติ
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    'success' in parsed &&
    'data' in parsed
  ) {
    return (parsed as { data: T }).data;
  }

  return parsed as T;
}
