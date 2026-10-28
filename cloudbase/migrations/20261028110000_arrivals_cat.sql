-- 到货物料增加「温度分类」字段（2026-10-28，用户要求常温/冻品到货时间分开筛）
-- normal = 常温（默认），frozen = 冻品
ALTER TABLE public.arrivals ADD COLUMN IF NOT EXISTS cat TEXT NOT NULL DEFAULT 'normal';
