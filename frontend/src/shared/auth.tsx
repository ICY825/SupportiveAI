/**
 * Phiên đăng nhập.
 *
 * Token giữ trong `localStorage`: pilot nội bộ, không có yêu cầu bảo mật
 * nào bắt buộc httpOnly cookie, và cách này để backend giữ nguyên JWT
 * bearer sẵn có. Nếu sau này đưa ra ngoài mạng nội bộ thì đổi sang cookie
 * — chỗ phải sửa chỉ nằm trong file này và `api/client.ts`.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { EMPLOYEE_KEY, TOKEN_KEY } from '@/api/client';
import * as authApi from '@/api/auth';
import type { EmployeeRead } from '@/api/types';

interface Session {
  employee: EmployeeRead | null;
  ready: boolean;
  signIn: (code: string, password: string) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [employee, setEmployee] = useState<EmployeeRead | null>(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setReady(true);
      return;
    }
    // Hiện ngay bản đã lưu để khỏi nháy màn hình, rồi xác minh lại với
    // backend — token có thể đã hết hạn từ phiên trước.
    const cached = window.localStorage.getItem(EMPLOYEE_KEY);
    if (cached) {
      try {
        setEmployee(JSON.parse(cached) as EmployeeRead);
      } catch {
        /* bản lưu hỏng thì bỏ qua, chờ xác minh */
      }
    }
    authApi
      .me()
      .then(setEmployee)
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(EMPLOYEE_KEY);
        setEmployee(null);
      })
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback(async (code: string, password: string) => {
    const result = await authApi.login(code, password);
    window.localStorage.setItem(TOKEN_KEY, result.access_token);
    window.localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(result.employee));
    setEmployee(result.employee);
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(EMPLOYEE_KEY);
    setEmployee(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo<Session>(
    () => ({ employee, ready, signIn, signOut }),
    [employee, ready, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession phải nằm trong <SessionProvider>');
  return context;
}
