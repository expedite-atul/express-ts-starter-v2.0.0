# Employee Management API

A secure REST API for managing employees, departments, login sessions and access
permissions, built with **Node.js, Express 5, TypeScript and PostgreSQL**.

> **Status: Phase 0 (project setup).** The server starts, validates its configuration
> and serves `GET /health`. Endpoints, database, authentication and tests arrive in
> later phases; this README grows with them.

## Design documents

Read these before adding code:

- [High-Level Design](docs/hld.md): context, layers, modules, request flow, data model, security architecture, decisions, open questions
- [Low-Level Design](docs/lld.md): conventions, layer contracts, and the design of each built module
- [Design principles](docs/design-principles.md): the principles followed here and where to see them in the code

## Prerequisites

- **Node.js 22 or newer** (24 recommended; with nvm run `nvm use`)
- **npm** (comes with Node.js)
- **PostgreSQL 16+**: needed from the database phase onwards

## Getting started

```bash
npm install
```

```bash
cp .env.example .env
```

Generate a JWT secret and paste it into `JWT_ACCESS_SECRET` in `.env`:

```bash
npm run secret
```

Start the development server. It restarts when a file in `src/` changes; after
editing `.env`, stop it (Ctrl+C) and start it again.

```bash
npm run dev
```

Check it is up:

```bash
curl http://localhost:3000/health
```

Expected: `{"status":"ok"}`.

> `npm install` may print an `allow-scripts` warning about `esbuild`. It is safe to
> ignore: `tsx` works without that install script.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run `src/server.ts` with `tsx`, restarting when `src/` changes |
| `npm run build` | Type-check and compile to `dist/` |
| `npm start` | Run the compiled app from `dist/` (run `npm run build` first) |
| `npm run typecheck` | Type-check without writing files |
| `npm run lint` | ESLint, including the architecture rules |
| `npm run lint:fix` | ESLint with automatic fixes |
| `npm run secret` | Print a random 64-character secret |

## Configuration

All configuration comes from environment variables, listed with comments in
[`.env.example`](.env.example). Locally they are read from `.env`; deployed
environments set them through their secrets manager.

`src/config/env.ts` is the **only** file that reads `process.env` (ESLint enforces
this). It validates every variable at startup, and the app **refuses to start** if
any is missing or invalid. It lists every problem at once, by name, and never prints
values:

```text
Invalid environment configuration:
  - DATABASE_URL is required

Fix the variables above in your .env file (copy .env.example if you have none), then start the app again.
```

Never commit `.env` or any real credential. `.gitignore` already excludes `.env` and `.env.*`.

## Project structure

```text
employee-management-api/
├── src/
│   ├── server.ts           # Entry point: starts and stops the process
│   ├── app.ts              # Builds the Express app (no port), used by server.ts and tests
│   ├── config/
│   │   └── env.ts          # The only reader of process.env: validated, typed configuration
│   ├── routes/             # URL + method → middleware chain → controller
│   ├── middlewares/        # authenticate, authorize, validate, rate limit, errors, …
│   ├── controllers/        # HTTP in/out: read validated input, call a service, send a DTO
│   ├── services/           # Business rules, ownership checks, transactions
│   ├── repositories/       # Parameterised SQL; map rows ↔ domain objects
│   ├── domain/             # Plain entity types (Employee, Department, User)
│   ├── dto/                # Request/response shapes exposed by the API
│   ├── validators/         # zod schemas for params, query and body
│   ├── errors/             # AppError hierarchy
│   └── types/              # Type augmentations (e.g. req.user)
├── migrations/             # Database schema changes, in order
├── seeds/                  # Development data (never real employee data)
├── docs/                   # HLD, LLD, design principles
├── eslint.config.js
├── tsconfig.json
├── .env.example
└── package.json
```

Requests flow one way: **Route → Middleware → Controller → Service → Repository → PostgreSQL**.
A layer may only use the layers below it, and `npm run lint` fails if code skips or
reverses a layer. See [HLD §3](docs/hld.md#3-architecture-style-layered).
