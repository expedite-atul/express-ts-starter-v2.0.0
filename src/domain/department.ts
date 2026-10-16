export interface Department {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewDepartment {
  name: string;
  description?: string | null;
}

export type DepartmentChanges = Partial<NewDepartment>;
