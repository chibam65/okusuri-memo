create table public.medicine_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.medicine_data enable row level security;
create policy "Users can read their own medicine data" on public.medicine_data for select using (auth.uid() = user_id);
create policy "Users can insert their own medicine data" on public.medicine_data for insert with check (auth.uid() = user_id);
create policy "Users can update their own medicine data" on public.medicine_data for update using (auth.uid() = user_id);
