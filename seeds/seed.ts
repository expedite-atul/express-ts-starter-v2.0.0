/**
 * `npm run db:seed` — loads reference data and fictional development accounts.
 * Run `npm run db:migrate` first. Refuses to run when NODE_ENV=production.
 */
import { createDataSource } from '../src/config/database.ts';
import { env } from '../src/config/env.ts';
import { PasswordHasher } from '../src/services/password-hasher.ts';
import { DEV_PASSWORD, PEOPLE, seedDevelopmentData } from './development-data.ts';
import { seedReferenceData } from './reference-data.ts';

if (env.NODE_ENV === 'production') {
  console.error('Refusing to seed development accounts into a production database.');
  process.exit(1);
}

const dataSource = createDataSource(env);
await dataSource.initialize();
try {
  const passwordHash = await new PasswordHasher().hash(DEV_PASSWORD);
  await dataSource.transaction(async (manager) => {
    await seedReferenceData(manager);
    await seedDevelopmentData(manager, passwordHash);
  });

  console.log('Seeded roles, permissions, departments and these development accounts:\n');
  console.table(PEOPLE.map(({ email, role }) => ({ email, role })));
  console.log(`\nPassword for every account (development only): ${DEV_PASSWORD}`);
} finally {
  await dataSource.destroy();
}
