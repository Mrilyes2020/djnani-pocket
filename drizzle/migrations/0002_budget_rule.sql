CREATE TABLE public.budget_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 needs_pct integer NOT NULL DEFAULT 70,
 wants_pct integer NOT NULL DEFAULT 10,
 savings_pct integer NOT NULL DEFAULT 20
);
GRANT ALL ON public.budget_settings TO service_role;
ALTER TABLE public.budget_settings ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.category_buckets (
 category text PRIMARY KEY,
 bucket text NOT NULL CHECK (bucket IN ('needs','wants','savings'))
);
GRANT ALL ON public.category_buckets TO service_role;
ALTER TABLE public.category_buckets ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.budget_warnings (
 ym text NOT NULL,
 bucket text NOT NULL,
 level integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (ym, bucket, level)
);
GRANT ALL ON public.budget_warnings TO service_role;
ALTER TABLE public.budget_warnings ENABLE ROW LEVEL SECURITY;