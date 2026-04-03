# Harness Marketplace

Plugin, template, and partner marketplace for The Harness OSS ecosystem.

Harness エコシステム向けのプラグイン・テンプレート・パートナーマーケットプレイス。

## Architecture

- **Runtime**: Cloudflare Workers (Hono)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2
- **Payments**: Stripe Connect (15% platform fee)

## Quick Start

```bash
pnpm install
pnpm db:migrate:local
pnpm dev:worker
```

## Monorepo Structure

```
apps/worker/        — CF Worker API (Hono)
packages/db/        — D1 schema
packages/shared/    — Shared types & constants
```

## License

MIT
