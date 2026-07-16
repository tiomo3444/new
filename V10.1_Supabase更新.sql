-- V10.1 穩定修正版
alter table public.deliveries alter column sales_name_snapshot drop not null, alter column sales_staff_id drop not null;
alter table public.delivery_tasks drop constraint if exists delivery_tasks_task_type_check;
alter table public.delivery_tasks add constraint delivery_tasks_task_type_check check (task_type in ('new_delivery','moving','rental_delivery','rental_pickup','onsite_restock'));
alter table public.deliveries add column if not exists estimated_arrival time;
