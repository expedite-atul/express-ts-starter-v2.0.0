// @ts-check
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Architecture rules (see docs/hld.md, "Layered architecture").
 *
 *   Route → Middleware → Controller → Service → Repository → PostgreSQL
 *
 * A layer may depend on the layers below it, never above it, and only the
 * repository layer talks to the database. These rules turn a shortcut such as
 * "the controller queries the table directly" into a lint error.
 */
const forbidden = {
  express: {
    regex: '^express$',
    message: 'HTTP stays in routes, middlewares and controllers. Pass plain values into this layer.',
  },
  pg: {
    regex: '^pg$',
    message: 'Only repositories (and src/config/database.ts) talk to PostgreSQL.',
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
    message: 'Domain objects are pure. Pass configuration in as arguments.',
  },
};

/** @type {Record<string, (keyof typeof forbidden)[]>} */
const layerRules = {
  'src/routes/**': ['pg', 'repositories'],
  'src/middlewares/**': ['pg', 'repositories', 'controllers', 'routes'],
  'src/controllers/**': ['pg', 'repositories', 'routes'],
  'src/services/**': ['express', 'pg', 'controllers', 'routes', 'middlewares'],
  'src/repositories/**': ['express', 'services', 'controllers', 'routes', 'middlewares'],
  'src/domain/**': [
    'express', 'pg', 'repositories', 'services', 'controllers', 'routes', 'middlewares', 'config',
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
    files: ['src/config/env.ts'],
    rules: { 'no-restricted-properties': 'off' },
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
