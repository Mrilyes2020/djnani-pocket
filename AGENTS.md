<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Telegram bot webhook lives at src/routes/api/public/telegram/webhook.ts (not a Supabase Edge Function) — TanStack server routes are the platform's HTTP endpoint mechanism.
- Bot message parsing is pure, regex-based code in src/lib/bot/parse.ts — keeps replies instant and testable; no AI calls.
- Bot tables are service-role only (RLS on, no policies); web pages read via password-checked server functions — keeps personal finance data private.
- Balances are always computed from SUM(transactions); never stored.
- All displayed money uses formatAmount in parse.ts via the currency-isolating fmt wrapper; CSV uses formatAmount directly to preserve numeric cells.
- Daily reminders use pg_cron calling a TanStack public route with a private Vault token verified by a service-role-only function, never a publishable key.
