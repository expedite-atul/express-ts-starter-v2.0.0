import type { Page } from '../domain/pagination.ts';

export interface PageResponse<T> {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export function toPageResponse<S, T>(page: Page<S>, toItem: (item: S) => T): PageResponse<T> {
  return {
    items: page.items.map(toItem),
    pagination: {
      page: page.page,
      pageSize: page.pageSize,
      totalItems: page.totalItems,
      totalPages: page.totalPages,
    },
  };
}
