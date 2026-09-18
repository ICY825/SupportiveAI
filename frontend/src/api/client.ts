/**
 * Lớp gọi backend.
 *
 * Đi qua proxy `/api/*` của Next (xem `next.config.mjs`) nên trình duyệt
 * chỉ thấy một origin — không CORS, không preflight.
 */

export const TOKEN_KEY = 'supportive.token';
export const EMPLOYEE_KEY = 'supportive.employee';

/** Lỗi backend trả về, theo `handle_app_error` trong `app/main.py`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isAuth(): boolean {
    return this.status === 401;
  }
}

export function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Mã trạm nhúng trong QR dán tại khu để đơn — không phải token đăng nhập. */
  stationToken?: string | null;
  /** Hai endpoint khu để đơn là công khai, không gắn Authorization. */
  anonymous?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, stationToken, anonymous } = options;
  const headers: Record<string, string> = {};

  if (!anonymous) {
    const token = readToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (stationToken) headers['X-Station-Token'] = stationToken;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    // Không đặt Content-Type: trình duyệt phải tự thêm boundary của multipart.
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`/api${path}`, { method, headers, body: payload });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data = text ? safeParse(text) : null;

  if (!response.ok) {
    throw toApiError(response.status, data, text);
  }
  return data as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Backend trả `{code, message, details}` cho `AppError`, nhưng FastAPI tự
 * trả `{detail: ...}` khi body không hợp lệ. Phải đọc được cả hai, nếu
 * không thì lỗi thật sẽ hiện ra thành "[object Object]".
 */
function toApiError(status: number, data: unknown, raw: string): ApiError {
  if (data && typeof data === 'object') {
    const body = data as Record<string, unknown>;
    if (typeof body.message === 'string') {
      return new ApiError(
        status,
        typeof body.code === 'string' ? body.code : 'error',
        body.message,
        (body.details as Record<string, unknown>) ?? {},
      );
    }
    if (body.detail !== undefined) {
      return new ApiError(status, 'validation_error', describeDetail(body.detail));
    }
  }
  return new ApiError(status, 'error', raw || `Lỗi ${status}`);
}

function describeDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as Record<string, unknown> | undefined;
    if (first && typeof first.msg === 'string') {
      const where = Array.isArray(first.loc) ? first.loc.join('.') : '';
      return where ? `${where}: ${first.msg}` : first.msg;
    }
  }
  return 'Dữ liệu gửi lên không hợp lệ';
}

export const api = {
  get: <T,>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T,>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T,>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
