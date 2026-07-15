-- V5.2：配送禁排時段
create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  block_date date not null,
  block_type text not null check (block_type in ('morning','afternoon','all_day','custom')),
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_blocks_custom_time_check check (
    (block_type <> 'custom')
    or (start_time is not null and end_time is not null and start_time < end_time)
  )
);

create index if not exists schedule_blocks_date_idx
on public.schedule_blocks(block_date);

drop trigger if exists trg_schedule_blocks_updated_at on public.schedule_blocks;
create trigger trg_schedule_blocks_updated_at
before update on public.schedule_blocks
for each row execute function public.set_updated_at();

alter table public.schedule_blocks enable row level security;
