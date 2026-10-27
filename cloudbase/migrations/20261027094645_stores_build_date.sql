-- 门店增加「建店时间」字段（2026-10-27，用户要求）
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS build_date TEXT;
