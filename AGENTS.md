# Repository Guidelines

## Project Structure & Module Organization
- `src/index.ts` – Hono app entry; mounts routes and Durable Object `CallState`.
- `src/routes/` – API surfaces: `api.ts`, `webhooks.ts`, `mcp.ts`, `sona.ts` (each default-exports a router).
- `src/lib/` – Service clients and domain logic (e.g., `openphone.ts`, `database.ts`, `ai-orchestrator.ts`).
- `src/types/` – Shared TypeScript types and env bindings.
- `src/mcp/` and `mcp-server.ts` – MCP server implementation for Claude/Desktop.
- `scripts/` – TypeScript maintenance scripts; shell deploy helpers live at repo root.
- `wrangler.toml` – Cloudflare Workers, KV, Durable Objects, and env configs.

## Build, Test, and Development Commands
- `npm run dev` – Start local Worker (Wrangler) with live reload.
- `npm run build` – TypeScript compile for the Worker (`tsc`).
- `npm run build:mcp` – Compile `mcp-server.ts` to `mcp-server.js`.
- `npm test` / `npm run test:unit` / `npm run test:watch` – Run Vitest.
- `npm run typecheck` – TS type-check without emitting.
- `npm run tail` – Stream Cloudflare logs.
- Deploy: `npm run deploy:staging` | `npm run deploy:production`.

## Coding Style & Naming Conventions
- TypeScript, ES2022, NodeNext modules. Indent 2 spaces.
- Files: kebab-case (`ai-orchestrator.ts`), routes default-export their router.
- Classes/Types: PascalCase; functions/vars: camelCase.
- Prefer explicit return types; avoid `any`.
- Validate inputs where applicable (e.g., `zod`). Keep route handlers thin; put logic in `src/lib/`.

## Testing Guidelines
- Framework: Vitest. Place tests alongside code as `*.test.ts` under `src/`.
- Test public behavior of routes and lib functions; mock external calls.
- Run `npm test` locally before PRs; add tests for new features and bug fixes.

## Commit & Pull Request Guidelines
- Commits: imperative present (“fix: …”, “feat: …”), concise subject.
- PRs must include: summary, rationale, test notes, and any `wrangler.toml`/secrets changes. Link issues when relevant.
- Ensure `npm run typecheck` and `npm test` pass; update docs if routes or envs change.

## Security & Configuration Tips
- Do not commit secrets. Use Wrangler secrets: `wrangler secret put NAME --env <env>`.
- Required secrets commonly include: `OPENPHONE_API_KEY`, `NEON_DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `CHITTY_*_SERVICE_TOKEN`.
- KV (`RECEPTION_KV`) and Durable Object (`CallState`) bindings are defined in `wrangler.toml`; keep staging/production sections in sync.
