-- Basic Package: enforce a hard 500-word maximum for text values saved in module_records.data.
-- Run once in Supabase SQL Editor after the existing module_records table has been created.
create or replace function public.enforce_module_record_500_word_limit()
returns trigger
language plpgsql
as $$
declare
  item record;
  word_count integer;
begin
  if new.data is null then
    return new;
  end if;

  for item in
    select key, value
    from jsonb_each_text(new.data)
    where jsonb_typeof(new.data) = 'object'
  loop
    if item.value is not null and btrim(item.value) <> '' then
      word_count := cardinality(regexp_split_to_array(btrim(item.value), '[[:space:]]+'));
      if word_count > 500 then
        raise exception 'এই মডিউলের কোনো তথ্য ৫০০ শব্দের বেশি হতে পারবে না (ক্ষেত্র: %; শব্দ: %)।', item.key, word_count
          using errcode = '22023';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists module_records_500_word_limit on public.module_records;
create trigger module_records_500_word_limit
before insert or update of data on public.module_records
for each row execute function public.enforce_module_record_500_word_limit();

-- The body word-count constraint helper is immutable and has a fixed search path.
create or replace function public.basic_mosque_body_within_500(v jsonb)
returns boolean language sql immutable set search_path=public,pg_temp
as $$
 select case
  when btrim(coalesce(v->>'body','')) = '' then true
  else cardinality(regexp_split_to_array(btrim(v->>'body'), '\\s+')) <= 500
 end
$$;
