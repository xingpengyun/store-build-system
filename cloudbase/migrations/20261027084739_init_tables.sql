-- 门店筹建管理系统 · CloudBase PG 初始建表（2026-10-27）
-- 团队共享数据，不做按用户隔离：匿名(publishable key)与登录用户都可读写全部行。

CREATE TABLE public.stores (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  province   TEXT NOT NULL DEFAULT '',
  stage      TEXT NOT NULL DEFAULT '',
  risk       TEXT NOT NULL DEFAULT 'normal',
  progress   DOUBLE PRECISION NOT NULL DEFAULT 0,
  manager_id TEXT NOT NULL DEFAULT '',
  open_date  TEXT,
  address    TEXT NOT NULL DEFAULT '',
  remark     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tasks (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL DEFAULT '',
  title       TEXT NOT NULL DEFAULT '',
  stage       TEXT NOT NULL DEFAULT '',
  assignee_id TEXT NOT NULL DEFAULT '',
  due_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  priority    TEXT NOT NULL DEFAULT 'normal',
  remark      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.members (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL DEFAULT '',
  role  TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#3f6bf5'
);

CREATE TABLE public.arrivals (
  id       TEXT PRIMARY KEY,
  store_id TEXT NOT NULL DEFAULT '',
  item     TEXT NOT NULL DEFAULT '',
  qty      DOUBLE PRECISION NOT NULL DEFAULT 0,
  eta_date TEXT,
  status   TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE public.app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores       TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members      TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arrivals     TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO anon, authenticated;

ALTER TABLE public.stores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrivals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY stores_all       ON public.stores       FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY tasks_all        ON public.tasks        FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY members_all      ON public.members      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY arrivals_all     ON public.arrivals     FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY app_settings_all ON public.app_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
