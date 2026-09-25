# Free-tier sign-in launch mode

Adds a **local, cloud-storage-optional launch mode**: free users can create an
account and sign in without that automatically turning on cloud resume
storage. This is governed by one default-OFF flag — see `.env.example`.

## The gate

| Flag | Default | Effect when `true` |
|---|---|---|
| `VITE_CLOUD_STORAGE_ENABLED` | `false` | `useCloudResume` (`src/hooks/useCloudResume.ts`) is allowed to load/create/save the resume against Supabase (`resumes` table) once someone signs in, and to offer the "save to your account" consent prompt. |

`useCloudResume` enforces this internally (not just by callers remembering
to pass the flag): the hook rebinds its own `user` reference to `null`
whenever `VITE_CLOUD_STORAGE_ENABLED` is off, *regardless of the real
session*, so every existing load/save/create/consent effect's own `!user`
guard short-circuits. Signing in alone can never trigger a resumes-table
request or a cloud-save consent prompt while the flag is off.

## Retired: sign-in-to-download gate (`VITE_REQUIRE_DOWNLOAD_SIGNIN`)

An earlier version of this mode could also require sign-in before an
in-app **Print / PDF** button would run `window.print()`. As part of
closing the browser-print bypass of the server PDF quota (see
`docs/PAID_BACKEND_RELEASE.md` / HANDOFF.md, "remove first-party Print/PDF
action"), that button — and the flag that gated it — were removed
entirely. The only supported PDF download is now the authenticated,
server-generated one (`GeneratedPdfControls` -> `POST /api/export-pdf`,
guarded by `pdf_begin`), which already requires a signed-in account with no
extra flag needed.

## What is explicitly NOT gated or changed

- **JSON backup / recovery** (`downloadBackup`, `downloadRescue`,
  `downloadConflict` in `src/main.tsx`) — never requires sign-in, at any
  flag setting. Losing access to your own local recovery backup because of
  an account gate would be a real harm; these stay reachable unconditionally.
- **Marketing email consent** — `AuthPanel` never presents a marketing
  opt-in, and its copy says so explicitly ("no marketing email"). The only
  emails sent are the account-confirmation email and, when someone chooses
  the email-link fallback, the one-time sign-in link.
- **The deployed public free release** — the flag above is absent from the
  production build's environment today, so this is unchanged by default;
  see HANDOFF.md for the exact accounts-disabled deployment record.
