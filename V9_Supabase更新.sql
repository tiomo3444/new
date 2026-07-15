-- V9：主管物流工單
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  work_order_date date not null,
  work_order_status text not null default '待補工單'
    check (work_order_status in ('待補工單','已發工單')),
  delivery_id uuid references public.deliveries(id) on delete set null,
  order_number text not null,
  original_amount numeric(12,2) not null default 0 check (original_amount >= 0),
  adjusted_amount numeric(12,2) not null default 0 check (adjusted_amount >= 0),
  supervisor_name text,
  supervisor_confirmed boolean not null default false,
  confirmed_at timestamptz,
  image_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_orders_date_idx on public.work_orders(work_order_date);
create index if not exists work_orders_delivery_idx on public.work_orders(delivery_id);
create unique index if not exists work_orders_order_number_key on public.work_orders(order_number);

drop trigger if exists trg_work_orders_updated_at on public.work_orders;
create trigger trg_work_orders_updated_at
before update on public.work_orders
for each row execute function public.set_updated_at();

alter table public.work_orders enable row level security;

insert into storage.buckets (id, name, public)
values ('work-order-images', 'work-order-images', true)
on conflict (id) do update set public=true;
