-- ExpenseMonster personal cloud backup ("vault"): one encrypted snapshot per user.
--
-- The payload is sealed on the phone ("EMX1." + AES-256-GCM) with a key derived from a password
-- that never leaves the phone. The server keeps only:
--   vault_id    random 120-bit id (the user's recovery code); not derived from the password
--   salt, iterations  PBKDF2 parameters, needed to re-derive the key on a new phone
--   token_hash  sha256 of a random write token (kept inside the encrypted payload), so only phones
--               that opened the vault can overwrite or delete it. Not derived from the password.
--   version     bumped on every write; writers must name the version they read (compare-and-swap)
--
-- Separate from emx_bundles (household mailbox): applying this migration changes nothing there.

create table if not exists public.emx_vaults (
  vault_id    text        primary key check (vault_id ~ '^[0-9a-f]{30}$'),
  salt        text        not null check (length(salt) between 16 and 64),
  iterations  int         not null check (iterations between 100000 and 10000000),
  payload     text        not null check (left(payload, 5) = 'EMX1.' and length(payload) <= 10000000),
  token_hash  text        not null check (token_hash ~ '^[0-9a-f]{64}$'),
  version     bigint      not null default 1,
  updated_at  timestamptz not null default now()
);

-- RLS on with no policies, and no grants: the functions below are the only way in.
alter table public.emx_vaults enable row level security;
revoke all on public.emx_vaults from anon, authenticated;

-- Create (p_expected = 0) or replace (p_expected = current version). Returns the new version,
-- or 0 when someone else wrote first: the phone then pulls, merges and tries again.
create or replace function public.emx_vault_put(
  p_vault text, p_token text, p_salt text, p_iterations int, p_payload text, p_expected bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  v_row  emx_vaults;
begin
  if length(p_token) < 32 then
    raise exception 'Invalid token' using errcode = 'P0001';
  end if;

  select * into v_row from emx_vaults where vault_id = p_vault for update;

  if not found then
    if p_expected <> 0 then
      raise exception 'Backup not found' using errcode = 'P0001';
    end if;
    insert into emx_vaults (vault_id, salt, iterations, payload, token_hash)
    values (p_vault, p_salt, p_iterations, p_payload, v_hash);
    return 1;
  end if;

  if v_row.token_hash <> v_hash then
    raise exception 'Not allowed' using errcode = 'P0001';
  end if;
  if v_row.version <> p_expected then
    return 0;
  end if;
  update emx_vaults
     set salt = p_salt, iterations = p_iterations, payload = p_payload,
         version = v_row.version + 1, updated_at = now()
   where vault_id = p_vault;
  return v_row.version + 1;
end;
$$;

-- Cheap check before downloading the whole payload.
create or replace function public.emx_vault_head(p_vault text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select version from emx_vaults where vault_id = p_vault), 0);
$$;

-- Anyone with the recovery code can download the ciphertext; it is useless without the password.
create or replace function public.emx_vault_get(p_vault text)
returns table (salt text, iterations int, payload text, version bigint, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select v.salt, v.iterations, v.payload, v.version, v.updated_at from emx_vaults v where v.vault_id = p_vault;
$$;

create or replace function public.emx_vault_delete(p_vault text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from emx_vaults
   where vault_id = p_vault and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  return found;
end;
$$;

revoke all on function public.emx_vault_put(text, text, text, int, text, bigint) from public;
revoke all on function public.emx_vault_head(text) from public;
revoke all on function public.emx_vault_get(text) from public;
revoke all on function public.emx_vault_delete(text, text) from public;
grant execute on function public.emx_vault_put(text, text, text, int, text, bigint) to anon, authenticated;
grant execute on function public.emx_vault_head(text) to anon, authenticated;
grant execute on function public.emx_vault_get(text) to anon, authenticated;
grant execute on function public.emx_vault_delete(text, text) to anon, authenticated;
