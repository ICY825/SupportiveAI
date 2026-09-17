import { api } from '@/api/client';
import type { EmployeeRead, LoginResponse } from '@/api/types';

export function login(employeeCode: string, password: string) {
  return api.post<LoginResponse>(
    '/auth/login',
    { employee_code: employeeCode, password },
    { anonymous: true },
  );
}

export function me() {
  return api.get<EmployeeRead>('/me');
}
