import argon2 from 'argon2';

/**
 * Argon2id parameters: the OWASP Password Storage Cheat Sheet minimum
 * (19 MiB memory, 2 iterations, 1 degree of parallelism). Raise them if your servers
 * can afford it; existing hashes keep working because the parameters are stored in the hash.
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

/** A valid hash of a random password, used to keep login timing constant (see verifyOrDummy). */
let dummyHash: Promise<string> | undefined;

export class PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false; // malformed hash: treat as a failed match, never as a crash
    }
  }

  /**
   * When the account does not exist, still spend the time of a real verification, so
   * response timing does not reveal which emails have accounts (user enumeration).
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    dummyHash ??= argon2.hash(crypto.randomUUID(), OPTIONS);
    await this.verify(await dummyHash, password);
    return false;
  }
}
