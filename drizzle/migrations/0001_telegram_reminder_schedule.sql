CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE TABLE public.bot_reminder_credentials (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex')
);
GRANT ALL ON public.bot_reminder_credentials TO service_role;
ALTER TABLE public.bot_reminder_credentials ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.verify_telegram_reminder_token(token text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.bot_reminder_credentials c WHERE extensions.digest(c.token, 'sha256') = extensions.digest($1, 'sha256'));
$$;
REVOKE ALL ON FUNCTION public.verify_telegram_reminder_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_telegram_reminder_token(text) TO service_role;