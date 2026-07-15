-- V6：單車路線中途返回疊貨站點
create table if not exists public.route_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  after_order integer not null check (after_order between 0 and 6),
  event_type text not null default 'reload' check (event_type in ('reload')),
  location_name text not null,
  location_address text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists route_events_date_order_idx
on public.route_events(event_date, after_order);

drop trigger if exists trg_route_events_updated_at on public.route_events;
create trigger trg_route_events_updated_at
before update on public.route_events
for each row execute function public.set_updated_at();

alter table public.route_events enable row level security;
