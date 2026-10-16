import type { EntityManager, Repository } from 'typeorm';
import type { UserAccount, UserCredentials } from '../domain/user.ts';
import { UserEntity } from '../entities/user.entity.ts';

export class UserRepository {
  private readonly repo: Repository<UserEntity>;

  constructor(manager: EntityManager) {
    this.repo = manager.getRepository(UserEntity);
  }

  async findById(id: string): Promise<UserAccount | null> {
    const entity = await this.repo.findOne({ where: { id }, relations: { role: true } });
    return entity ? toUserAccount(entity) : null;
  }

  async findByEmployeeId(employeeId: string): Promise<UserAccount | null> {
    const entity = await this.repo.findOne({ where: { employeeId }, relations: { role: true } });
    return entity ? toUserAccount(entity) : null;
  }

  /**
   * The only methods that read `password_hash` (the column is `select: false`, so it must be
   * requested explicitly). Used by the authentication service and nothing else.
   */
  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    return this.findCredentials('user.email = :email', { email });
  }

  async findCredentialsById(id: string): Promise<UserCredentials | null> {
    return this.findCredentials('user.id = :id', { id });
  }

  async create(input: {
    email: string;
    passwordHash: string;
    roleId: string;
    employeeId: string | null;
  }): Promise<string> {
    const entity = await this.repo.save(this.repo.create({ ...input, isActive: true }));
    return entity.id;
  }

  async updateRole(id: string, roleId: string): Promise<void> {
    await this.repo.update({ id }, { roleId });
  }

  async updateEmail(id: string, email: string): Promise<void> {
    await this.repo.update({ id }, { email });
  }

  async updatePassword(id: string, passwordHash: string, changedAt: Date): Promise<void> {
    await this.repo.update({ id }, { passwordHash, passwordChangedAt: changedAt });
  }

  async deactivate(id: string): Promise<void> {
    await this.repo.update({ id }, { isActive: false });
  }

  /** Erasure: removes the login account; sessions and refresh tokens cascade. */
  async deleteByEmployeeId(employeeId: string): Promise<void> {
    await this.repo.delete({ employeeId });
  }

  private async findCredentials(
    condition: string,
    parameters: Record<string, string>,
  ): Promise<UserCredentials | null> {
    const entity = await this.repo
      .createQueryBuilder('user')
      .select(['user.id', 'user.isActive'])
      .addSelect('user.passwordHash')
      .where(condition, parameters)
      .getOne();
    return entity
      ? { id: entity.id, passwordHash: entity.passwordHash, isActive: entity.isActive }
      : null;
  }
}

function toUserAccount(entity: UserEntity): UserAccount {
  if (!entity.role) throw new Error('User loaded without its role');
  return {
    id: entity.id,
    email: entity.email,
    role: entity.role.name,
    employeeId: entity.employeeId,
    isActive: entity.isActive,
    createdAt: entity.createdAt,
  };
}
