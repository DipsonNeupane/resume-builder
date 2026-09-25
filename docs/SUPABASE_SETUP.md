# Supabase authentication setup

> September 25, Task #60: this setup log contains historical implementation/status
> notes. For the next release use the [complete migration/environment audit](PRODUCTION_READINESS_AUDIT.md)
> and [cloud acceptance plan](PRODUCTION_CLOUD_ACCEPTANCE.md). Hosted state must be
> reconciled; do not apply this older checklist as an exhaustive migration plan.

Status: email/password signup and sign-in are the primary in-app flows; a one-time email-link sign-in remains as a fallback for accounts created before password auth existed. Supabase client is implemented. Not production-auth ready: live delivery/callbacks, server authorization, owned storage and account-gated exports still need implementation/verification. Existing local beta remains usable until those flows are complete. Authentication alone does not grant Pro or cloud save.

1. Create/select the owner's Supabase project. Enable email auth and configure production SMTP/sending domain. No project was created by this task.
2. Copy `.env.example` to ignored `.env.local`. Set the project URL and public publishable key. Do NOT provide service-role keys or database credentials to Vite or commit secrets. Restart Vite after configuration.
3. Supabase Auth URL configuration: use the actual production Site URL when deploying; explicitly allow `http://127.0.0.1:5173/?account=1` for local tests and `https://resumestride.com/?account=1` for production. Avoid wildcard production redirects. This app builds its callback from its current origin and does not accept a user-provided return URL.
4. Keep the provider's confirmation-email and magic-link templates using their supported confirmation URL. Brand the sender/templates ResumeStride. The client uses PKCE: complete any email link in the same browser that requested it. Verify signup (email/password), password sign-in, and the email-link fallback (`shouldCreateUser: false`, for accounts predating password auth) against a real test mailbox. Password auth requires the provider's leaked-password protection setting to be reviewed and enabled before public release (see HANDOFF.md).
5. Test expired/used links, session restore, email throttling and logout before release. Verify provider CAPTCHA/rate limits for public use. No live auth tests have been run yet.
6. Supabase cloud schema/RLS and backend token validation are next. Never use the client session or a local boolean as the authority for quota or Pro entitlements. Do not upload the local draft without user consent.

Configured builds expose Sign in / Sign up in navigation; `/?account=1` opens the account screen. Unconfigured builds show a clear unavailable message there and retain the local builder. This is an incremental integration, not final signup enforcement.

Product decisions: 3 app-generated PDF downloads per fixed 30-day window from signup. Browser print and JSON backups do not consume quota. $19.99 Pro grants 30 days, with prepaid extensions and optional recurring consent; these features are not implemented here.

Reference: https://supabase.com/docs/guides/auth/passwords and https://supabase.com/docs/guides/auth/auth-email-passwordless (fallback flow)
