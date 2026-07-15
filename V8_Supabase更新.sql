-- V8：商品擴充與任務分類

-- 1. 商品明細支援自行填寫名稱
alter table public.delivery_items
  add column if not exists custom_product_name text;

-- 2. 新增商品；茶几拆成大茶几、小茶几，舊茶几停用
update public.products set is_active=false where name='茶几';

insert into public.products (name, sort_order, is_active) values
('單椅', 3, true),
('大茶几', 5, true),
('小茶几', 6, true),
('床墊', 11, true),
('長凳', 12, true),
('化妝台', 17, true),
('書桌', 18, true),
('其他品項', 99, true)
on conflict (name) do update
set sort_order=excluded.sort_order, is_active=true;

-- 調整既有品項排序
update public.products set sort_order=1 where name='沙發';
update public.products set sort_order=2 where name='單椅';
update public.products set sort_order=3 where name='餐桌';
update public.products set sort_order=4 where name='餐椅';
update public.products set sort_order=7 where name='邊几';
update public.products set sort_order=8 where name='掀床架';
update public.products set sort_order=9 where name='床架';
update public.products set sort_order=10 where name='床底';
update public.products set sort_order=13 where name='圓凳';
update public.products set sort_order=14 where name='抱枕';
update public.products set sort_order=15 where name='床頭櫃';

-- 3. 配送任務
create table if not exists public.delivery_tasks (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  task_order integer not null default 1,
  task_type text not null check (task_type in ('new_delivery','moving','rental_delivery','rental_pickup')),
  task_label text not null,
  destination_address text,
  service_minutes integer not null default 0 check (service_minutes >= 0),
  details text,
  notes text,
  rental_start_date date,
  rental_return_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_tasks_delivery_idx on public.delivery_tasks(delivery_id);

drop trigger if exists trg_delivery_tasks_updated_at on public.delivery_tasks;
create trigger trg_delivery_tasks_updated_at
before update on public.delivery_tasks
for each row execute function public.set_updated_at();

alter table public.delivery_tasks enable row level security;

-- 4. 重建總覽 View，分開聚合商品與任務，避免重複資料
drop view if exists public.delivery_overview;

create view public.delivery_overview as
select
  d.id,
  d.delivery_date,
  d.delivery_order,
  d.requested_period,
  d.constraint_type,
  d.earliest_time,
  d.latest_time,
  d.estimated_arrival,
  d.estimated_departure,
  d.customer_name_snapshot as customer_name,
  d.customer_phone_snapshot as customer_phone,
  d.delivery_address_snapshot as delivery_address,
  d.sales_name_snapshot as sales_name,
  d.service_minutes,
  d.travel_minutes_from_previous,
  d.travel_distance_km,
  d.status,
  d.notes,
  d.cancelled_reason,
  d.created_at,
  d.updated_at,
  coalesce(item_data.items, '[]'::jsonb) as items,
  coalesce(task_data.tasks, '[]'::jsonb) as tasks
from public.deliveries d
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'item_id', di.id,
      'product_id', p.id,
      'product_name', coalesce(nullif(di.custom_product_name,''), p.name),
      'custom_product_name', di.custom_product_name,
      'quantity', di.quantity,
      'pickup_location_id', pl.id,
      'pickup_location_name', pl.name,
      'pickup_location_address', pl.address,
      'custom_pickup_address', di.custom_pickup_address,
      'item_notes', di.item_notes,
      'picked', di.picked
    )
    order by p.sort_order, coalesce(di.custom_product_name,p.name)
  ) as items
  from public.delivery_items di
  join public.products p on p.id=di.product_id
  join public.pickup_locations pl on pl.id=di.pickup_location_id
  where di.delivery_id=d.id
) item_data on true
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'task_id', dt.id,
      'task_order', dt.task_order,
      'task_type', dt.task_type,
      'task_label', dt.task_label,
      'destination_address', dt.destination_address,
      'service_minutes', dt.service_minutes,
      'details', dt.details,
      'notes', dt.notes,
      'rental_start_date', dt.rental_start_date,
      'rental_return_date', dt.rental_return_date
    )
    order by dt.task_order, dt.created_at
  ) as tasks
  from public.delivery_tasks dt
  where dt.delivery_id=d.id
) task_data on true;
