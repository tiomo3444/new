-- V7：每日第一站時間設定
create table if not exists public.route_plans (
  id uuid primary key default gen_random_uuid(),
  route_date date not null unique,
  origin_name text not null default '高雄倉庫',
  origin_address text not null default '高雄市仁武區成功路152號',
  first_arrival_time time not null default '11:00',
  status text not null default '草稿'
    check (status in ('草稿','已確認','已完成')),
  total_travel_minutes integer,
  total_distance_km numeric(8,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists route_plans_route_date_key
on public.route_plans(route_date);

drop trigger if exists trg_route_plans_updated_at on public.route_plans;
create trigger trg_route_plans_updated_at
before update on public.route_plans
for each row execute function public.set_updated_at();

alter table public.route_plans enable row level security;
