-- ExpenseMonster household sync, per record, ordered by a per-household sequence number.
--
-- Replaces the bundle mailbox (emx_bundles), which stays readable for phones on older versions.
--
-- emx_spaces:  one row per household. head_seq is the family's shared counter: every saved record
--              takes the next number, so "anything new for me?" is one lookup (head_seq > mine?)
--              and "what's new?" is "records with seq > mine". No phone clocks are involved.
-- emx_records: the latest version of each record, sealed on the phone with the household key.
--              record_key is an HMAC of (table, id) under that key, so the server can't tell a
--              loan from a transaction or read the time hidden in UUIDv7 ids.
--
-- Writers name the seq of the version they edited (base). If the record moved on since, the server
-- refuses that record and reports a conflict; the phone pulls the newer version, merges it with
-- the user's conflict policy and pushes again. Edits are never silently overwritten.
--
-- Every function needs the household's write token (derived from the household key, which only
-- paired phones have); the server keeps only its sha256.

create table if not exists public.emx_spaces (
  space_id    text        primary key check (space_id ~ '^[0-9a-f]{64}$'),
  token_hash  text        not null check (token_hash ~ '^[0-9a-f]{64}$'),
  head_seq    bigint      not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.emx_records (
  space_id    text        not null references public.emx_spaces (space_id) on delete cascade,
  record_key  text        not null check (record_key ~ '^[0-9a-f]{64}$'),
  seq         bigint      not null,
  payload     text        not null check (left(payload, 5) = 'EMX1.' and length(payload) <= 65536),
  -- Server time of the last write, for support and clean-up; ordering uses seq.
  server_at   timestamptz not null default now(),
  primary key (space_id, record_key)
);

create index if not exists emx_records_space_seq on public.emx_records (space_id, seq);

alter table public.emx_spaces enable row level security;
alter table public.emx_records enable row level security;
revoke all on public.emx_spaces from anon, authenticated;
revoke all on public.emx_records from anon, authenticated;

-- Raises unless the token matches. Returns the space's head (0 if the space doesn't exist yet).
create or replace function public.emx_space_check(p_space text, p_token text)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row emx_spaces;
begin
  select * into v_row from emx_spaces where space_id = p_space;
  if not found then
    return 0;
  end if;
  if v_row.token_hash <> encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    raise exception 'Not allowed' using errcode = 'P0001';
  end if;
  return v_row.head_seq;
end;
$$;

-- "Anything new?": the family's current sequence number.
create or replace function public.emx_space_head(p_space text, p_token text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select public.emx_space_check(p_space, p_token);
$$;

-- Records written after p_after, oldest first.
create or replace function public.emx_records_pull(p_space text, p_token text, p_after bigint, p_limit int default 200)
returns table (record_key text, seq bigint, payload text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.emx_space_check(p_space, p_token);
  return query
    select r.record_key, r.seq, r.payload
    from emx_records r
    where r.space_id = p_space and r.seq > p_after
    order by r.seq
    limit least(greatest(p_limit, 1), 500);
end;
$$;

-- p_records: [{"k": record_key, "b": base seq (0 = new), "p": payload}, ...], at most 200.
-- Returns {"head": n, "applied": [{"k": .., "s": seq}], "conflicts": [k, ..]}.
create or replace function public.emx_records_push(p_space text, p_token text, p_records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash      text := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  v_space     emx_spaces;
  v_rec       jsonb;
  v_key       text;
  v_base      bigint;
  v_current   bigint;
  v_seq       bigint;
  v_applied   jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
begin
  if length(p_token) < 32 then
    raise exception 'Invalid token' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 200 then
    raise exception 'Send at most 200 records at a time' using errcode = 'P0001';
  end if;

  -- First push from a household creates its space; the row lock serialises numbering.
  insert into emx_spaces (space_id, token_hash) values (p_space, v_hash) on conflict (space_id) do nothing;
  select * into v_space from emx_spaces where space_id = p_space for update;
  if v_space.token_hash <> v_hash then
    raise exception 'Not allowed' using errcode = 'P0001';
  end if;
  v_seq := v_space.head_seq;

  for v_rec in select * from jsonb_array_elements(p_records) loop
    v_key  := v_rec ->> 'k';
    v_base := coalesce((v_rec ->> 'b')::bigint, 0);
    select r.seq into v_current from emx_records r where r.space_id = p_space and r.record_key = v_key for update;
    if found and v_current <> v_base then
      v_conflicts := v_conflicts || to_jsonb(v_key);
      continue;
    end if;
    v_seq := v_seq + 1;
    insert into emx_records (space_id, record_key, seq, payload)
    values (p_space, v_key, v_seq, v_rec ->> 'p')
    on conflict (space_id, record_key) do update set seq = excluded.seq, payload = excluded.payload, server_at = now();
    v_applied := v_applied || jsonb_build_object('k', v_key, 's', v_seq);
  end loop;

  update emx_spaces set head_seq = v_seq, updated_at = now() where space_id = p_space;
  return jsonb_build_object('head', v_seq, 'applied', v_applied, 'conflicts', v_conflicts);
end;
$$;

revoke all on function public.emx_space_check(text, text) from public;
revoke all on function public.emx_space_head(text, text) from public;
revoke all on function public.emx_records_pull(text, text, bigint, int) from public;
revoke all on function public.emx_records_push(text, text, jsonb) from public;
grant execute on function public.emx_space_head(text, text) to anon, authenticated;
grant execute on function public.emx_records_pull(text, text, bigint, int) to anon, authenticated;
grant execute on function public.emx_records_push(text, text, jsonb) to anon, authenticated;
