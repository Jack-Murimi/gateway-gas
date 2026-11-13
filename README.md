# Gateway Gas — Nairobi Station Portal

Internal multi-branch web portal for **Gateway Gas (Nairobi)** operations, covering LPG cylinder brand exchange, POS cashiering, inventory reconciliation, dispatch/rider logistics, staff management, and reporting.

Built with [Next.js](https://nextjs.org/) (App Router), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), and [Supabase](https://supabase.com/).

## Overview

Gateway Gas Portal supports day-to-day station workflows across Nairobi branches (e.g. Nextgen, Lavington, Jamhuri, Kileleshwa), with role-aware views for:

- **Admin / Director / Operator:** executive overview, branch KPIs, low-stock alerts, dispatch desk, staff approvals, inventory and operations management
- **Sales Rep (Cashier):** quick POS sales flow, today’s tickets/sales summary, branch stock visibility
- **Rider:** active delivery job, customer contact/navigation actions, run-sheet access

## Key features

- **Role-based dashboards** (admin/director/operator, sales rep, rider)
- **POS & sales tracking** (walk-in/counter tickets, receipts, payment status)
- **Inventory management** for full/empty LPG cylinders across branches
- **Dispatch & delivery operations** (pending assignments, in-transit tracking, rider workflows)
- **Staff management** with approval/status workflows
- **Reports** and station-level operational visibility
- **Multi-branch context** (Nairobi hubs/depots)
- **Supabase-backed data/auth integration** (schema and seed included in repo)
- **Demo/testing mode support** (configurable via environment variables)

## Tech stack

- **Framework:** Next.js 15 (App Router)
- **UI:** React 19, Tailwind CSS, Lucide icons
- **Language:** TypeScript
- **Backend services:** Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- **Database assets:** SQL schema and seed files under `supabase/`

## Project structure (high level)

```text
.
├── src/
│   ├── app/            # App Router pages/routes (dashboard, sales, inventory, operations, rider, staff, reports, etc.)
│   ├── components/     # Shared UI components (e.g. navbar)
│   ├── context/        # App/store context providers
│   └── lib/            # Utilities, formatters, Supabase clients/helpers
├── supabase/
│   ├── schema.sql      # Database schema
│   └── seed.sql        # Seed/demo data
├── docs/               # Project documentation
├── public/             # Static assets
└── .env.example        # Environment variable template
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- npm (comes with Node.js)
- A [Supabase](https://supabase.com/) project (production/staging/local as needed)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in values for your environment:

```bash
cp .env.example .env.local
```

Key variables (see `.env.example` for full matrix/comments):

- `NEXT_PUBLIC_DEMO_MODE` — enable demo/testing helpers in non-production environments
- `NEXT_PUBLIC_APP_ENV` — `development` | `preview` | `production`
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (server-side use only; keep secret)
- `MPESA_*` — M-Pesa Daraja credentials/callback settings (if using STK push integration)

> **Security:** Never commit `.env.local` or real secrets to source control.

### 3. Set up Supabase (schema/seed)

Apply the SQL files in `supabase/` to your Supabase project as appropriate for your environment:

- `supabase/schema.sql` — database schema
- `supabase/seed.sql` — seed/test data (useful for preview/staging/demo)

You can run these via the Supabase SQL Editor or your preferred migration workflow.

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available scripts

- `npm run dev` — start Next.js development server
- `npm run build` — create production build
- `npm run start` — run production server (after build)
- `npm run lint` — run Next.js linting

## Deployment notes

- Configure environment variables per environment (preview/staging vs production), especially:
  - demo mode flags
  - Supabase project credentials
  - M-Pesa credentials/callback URL
- Use separate Supabase projects for production and testing/preview where possible.
- Disable demo/testing mode in production (`NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_APP_ENV=production`).

## Documentation

Additional project notes/specs may be available in the [`docs/`](./docs) directory.

## License

Internal/private project (no license specified).
