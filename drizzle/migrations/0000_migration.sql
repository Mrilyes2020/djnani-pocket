CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL,
  account text NOT NULL CHECK (account IN ('pocket','bank')),
  category text NOT NULL DEFAULT 'أخرى',
  note text,
  transfer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.transactions(created_at DESC);
CREATE TABLE public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person text NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person text NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.category_keywords (
  keyword text PRIMARY KEY,
  category text NOT NULL
);
CREATE TABLE public.bot_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.transactions, public.loans, public.loan_payments, public.category_keywords, public.bot_logs TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_logs ENABLE ROW LEVEL SECURITY;
INSERT INTO public.category_keywords(keyword, category) VALUES
('أكل','أكل'),('غداء','أكل'),('عشاء','أكل'),('فطور','أكل'),('مطعم','أكل'),('ريزو','أكل'),('قهوة','أكل'),('خبز','أكل'),('حليب','أكل'),('سوق','أكل'),('خضرة','أكل'),('لحم','أكل'),
('بنزين','نقل'),('كراء','نقل'),('طاكسي','نقل'),('ترامواي','نقل'),('ميترو','نقل'),('حافلة','نقل'),('فرود','نقل'),
('كهرباء','فواتير'),('ماء','فواتير'),('انترنت','فواتير'),('فاتورة','فواتير'),('رصيد','فواتير'),('فليكسي','فواتير'),('غاز','فواتير'),
('راتب','دخل'),('جوست','دخل'),('خلصة','دخل'),('منحة','دخل'),
('دواء','صحة'),('طبيب','صحة'),('صيدلية','صحة'),
('ملابس','تسوق'),('حذاء','تسوق'),('هدية','تسوق'),
('قهوة_','أكل');
DELETE FROM public.category_keywords WHERE keyword='قهوة_';