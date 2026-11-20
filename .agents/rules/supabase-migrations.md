---
trigger: always_on
---

# Supabase Migrations Policy

- **Always apply Supabase migrations directly** using the `supabase_mcp` MCP server (`apply_migration` tool) or the Supabase CLI (`/home/jack/.npm-global/bin/supabase`) rather than asking the user to run SQL manually in the Supabase Dashboard.
- This workspace (`gatewaygas`) targets Supabase project **`stziykrxtijojtnmhcoy`** (verify against `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` if unsure; note that the separate `supabase` MCP server may point to a different project).
- Keep a matching `.sql` file in `supabase/migrations/` in sync with every migration applied via `supabase_mcp` or CLI.
- Prefer non-destructive DDL (avoid `DROP` / `TRUNCATE` where `CREATE OR REPLACE` or CTEs work) so migrations apply smoothly via MCP without triggering destructive-operation cancellations; if a migration requires destructive DDL, use `/home/jack/.npm-global/bin/supabase`.
