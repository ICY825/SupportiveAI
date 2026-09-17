import { api } from '@/api/client';
import type { EmployeeBrief } from '@/api/types';

/** Gợi ý cho ô tìm nhân sự ở màn hình soát (mail-tracking.md §5.2). */
export function searchEmployees(term: string, limit = 8) {
  const query = new URLSearchParams({ q: term, limit: String(limit) });
  return api.get<EmployeeBrief[]>(`/employees/search?${query}`);
}
