---
name: Backoffice / Super-admin panel
description: Multi-tenant backoffice built for Punchlister - tracks companies, users, projects
type: project
---

Backoffice panel added to Punchlister. Platform owner manages all companies (tenants).

**Key files added/changed:**
- `supabase/add_companies.sql` — migration: companies, platform_admins, company_users tables; `alter projects add company_id`
- `server.js` — 10 new `/api/backoffice/*` routes (requireAdmin middleware)
- `src/views/BackofficeShell.jsx` — dark sidebar layout wrapper (visually distinct from main app)
- `src/views/Backoffice.jsx` — dashboard: stats bar + searchable/filterable company table + create modal
- `src/views/BackofficeCompany.jsx` — company detail: contact info, users, projects
- `src/App.jsx` — `isPlatformAdmin` state (from `platform_admins` table), `viewParams` state, `navigate()` helper, backoffice render gate before project gate
- `src/components/Sidebar.jsx` — "Backoffice" nav item in "Platform" section, visible only when `isPlatformAdmin` prop is true

**Auth flow:**
- Frontend queries `platform_admins` table (anon client, RLS: can read own row)
- Backend uses existing `requireAdmin` (Bearer ADMIN_SECRET)
- `platformAdminChecked` flag prevents flash-redirect during initial load

**How to apply:** When extending the backoffice or adding new tenant features, follow the established patterns above.

**Why:** User requested a completely separate super-admin section for managing multi-tenant companies, isolated from the per-project admin panel.
