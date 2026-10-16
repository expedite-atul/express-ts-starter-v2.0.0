import type { Department } from '../domain/department.ts';

export interface DepartmentResponse {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toDepartmentResponse(department: Department): DepartmentResponse {
  return {
    id: department.id,
    name: department.name,
    description: department.description,
    createdAt: department.createdAt.toISOString(),
    updatedAt: department.updatedAt.toISOString(),
  };
}
