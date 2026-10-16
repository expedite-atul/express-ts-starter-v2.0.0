// @ts-check
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Architecture rules (see docs/hld.md, "Layered architecture").
 *
 *   Route → Middleware → Controller → Service → Repository → PostgreSQL (via TypeORM)
 *
 * A layer may depend on the layers below it, never above it. Only repositories (and the
 * DataSource in src/config) use TypeORM. Services, middlewares and controllers never read
 * configuration themselves: they receive it as arguments from the composition root.
 * These rules turn a shortcut such as "the controller queries the table directly" into
 * a lint error.
 */
const forbidden = {
  express: {
    regex: '^express$',
    message: 'HTTP stays in routes, middlewares and controllers. Pass plain values into this layer.',
  },
  database: {
    regex: '^(pg|typeorm)$',
    message: 'Only repositories (and src/config/database.ts) talk to the database.',
  },
  entities: {
    regex: '/entities/',
    message: 'Entities are the persistence model: only repositories use them. Use src/domain types.',
  },
  repositories: {
    regex: '/repositories/',
    message: 'Call a service instead: services own the business rules, repositories only persist.',
  },
  services: {
    regex: '/services/',
    message: 'A lower layer must not call up into the service layer.',
  },
  controllers: {
    regex: '/controllers/',
    message: 'Controllers are the HTTP edge. Nothing below them may import one.',
  },
  routes: {
    regex: '/routes/',
    message: 'Routes are wiring. Nothing else may import them except app.ts.',
  },
  middlewares: {
    regex: '/middlewares/',
    message: 'Middlewares are HTTP-only. Services and below must not depend on them.',
  },
  config: {
    regex: '/config/',
    message: 'Receive configuration as a constructor/function argument (see src/container.ts).',
  },
};

/** @type {Record<string, (keyof typeof forbidden)[]>} */
const layerRules = {
  'src/routes/**': ['database', 'entities', 'repositories', 'config'],
  'src/middlewares/**': ['database', 'entities', 'repositories', 'controllers', 'routes', 'config'],
  'src/controllers/**': ['database', 'entities', 'repositories', 'routes', 'config'],
  'src/services/**': ['express', 'database', 'entities', 'controllers', 'routes', 'middlewares', 'config'],
  'src/repositories/**': ['express', 'services', 'controllers', 'routes', 'middlewares', 'config'],
  'src/dto/**': ['express', 'database', 'entities', 'repositories', 'services', 'controllers', 'routes', 'middlewares', 'config'],
  'src/validators/**': ['express', 'database', 'entities', 'repositories', 'services', 'controllers', 'routes', 'middlewares', 'config'],
  'src/entities/**': ['express', 'repositories', 'services', 'controllers', 'routes', 'middlewares', 'config'],
  'src/domain/**': [
    'express', 'database', 'entities', 'repositories', 'services', 'controllers', 'routes', 'middlewares', 'config',
  ],
};

export default defineConfig(
  { ignores: ['dist/', 'coverage/'] },

  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Unused parameters are allowed when prefixed with _, e.g. Express's 4-argument
      // error handler `(err, req, res, _next)`, which must declare `next` to be recognised.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Configuration is read in exactly one place: src/config/env.ts.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: "Import { env } from 'src/config/env.ts' instead of reading process.env.",
        },
      ],
    },
  },
  {
    // The config module, plus test tooling that must choose a test database before the
    // app's configuration exists.
    files: ['src/config/env.ts', 'tests/**', 'vitest.config.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },

  {
    // Tests read untyped JSON from HTTP responses (`response.body` is `any`). Application
    // code keeps these rules: there, untyped data must be validated first.
    files: ['tests/**'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },

  ...Object.entries(layerRules).map(([files, banned]) => ({
    files: [files],
    rules: {
      'no-restricted-imports': ['error', { patterns: banned.map((name) => forbidden[name]) }],
    },
  })),

  // Plain JavaScript files (like this one) are not part of the TypeScript project.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
