/** Upper bound for any list endpoint: stops one request from reading the whole table. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function toPage<T>(items: T[], totalItems: number, request: PageRequest): Page<T> {
  return {
    items,
    page: request.page,
    pageSize: request.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / request.pageSize),
  };
}
