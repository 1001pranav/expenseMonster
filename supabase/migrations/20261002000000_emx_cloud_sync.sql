-- ExpenseMonster optional cloud sync: an encrypted mailbox per household.
--
-- The server never sees plaintext. Each row is a sealed bundle ("EMX1." + AES-256-GCM) made with
-- the household key, which never leaves the phones. `mailbox` is HKDF(household key), so only
-- paired phones can address it. The table is closed to clients; the two functions below are the
-- only way in, so nobody can list or scan other households' mailboxes.

create table if not exists public.emx_bundles (
  id          bigint generated always as identity primary key,
  mailbox     text        not null check (mailbox ~ '^[0-9a-f]{64}$'),
  from_device text        not null check (length(from_device) between 1 and 64),
  payload     text        not null check (left(payload, 5) = 'EMX1.' and length(payload) <= 5000000),
  created_at  timestamptz not null default now()
);

create index if not exists emx_bundles_mailbox_id on public.emx_bundles (mailbox, id);
create index if not exists emx_bundles_created_at on public.emx_bundles (created_at);

-- RLS on with no policies, and no grants: anon/authenticated cannot read or write the table directly.
alter table public.emx_bundles enable row level security;
revoke all on public.emx_bundles from anon, authenticated;

create or replace function public.emx_push(p_mailbox text, p_device text, p_payload text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
begin
  -- The API key ships inside the app, so cap how fast one mailbox can grow.
  if (select count(*) from emx_bundles where mailbox = p_mailbox and created_at > now() - interval '1 hour') >= 120 then
    raise exception 'Too many uploads, try again later' using errcode = 'P0001';
  end if;

  insert into emx_bundles (mailbox, from_device, payload)
  values (p_mailbox, p_device, p_payload)
  returning id into new_id;

  -- Retention: phones re-upload a full snapshot every 30 days, so 90 days always covers one.
  delete from emx_bundles where mailbox = p_mailbox and created_at < now() - interval '90 days';

  return new_id;
end;
$$;

create or replace function public.emx_pull(p_mailbox text, p_after bigint, p_device text, p_limit int default 20)
returns table (id bigint, from_device text, payload text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.from_device, b.payload, b.created_at
  from emx_bundles b
  where b.mailbox = p_mailbox and b.id > p_after and b.from_device <> p_device
  order by b.id
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.emx_push(text, text, text) from public;
revoke all on function public.emx_pull(text, bigint, text, int) from public;
grant execute on function public.emx_push(text, text, text) to anon, authenticated;
grant execute on function public.emx_pull(text, bigint, text, int) to anon, authenticated;
