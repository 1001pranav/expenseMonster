-- Delete a whole space (its records go with it, on delete cascade). Used when a person turns off
-- their cloud backup with "delete from cloud". Needs the space's write token, like every write.

create or replace function public.emx_space_delete(p_space text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from emx_spaces
   where space_id = p_space and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  return found;
end;
$$;

revoke all on function public.emx_space_delete(text, text) from public;
grant execute on function public.emx_space_delete(text, text) to anon, authenticated;
