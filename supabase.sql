begin;

create schema if not exists aula_en_pausa_private;
revoke all on schema aula_en_pausa_private from public, anon, authenticated;

create table if not exists aula_en_pausa_private.scenarios (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  config jsonb not null,
  created_at timestamptz not null default now()
);

alter table aula_en_pausa_private.scenarios enable row level security;
revoke all on table aula_en_pausa_private.scenarios from public, anon, authenticated;

create or replace function aula_en_pausa_private.save_scenario(scenario jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  field_name text;
  minimum numeric;
  maximum numeric;
  value numeric;
begin
  if pg_catalog.jsonb_typeof(scenario) is distinct from 'object'
    or pg_catalog.octet_length(scenario::text) > 2048 then
    raise exception 'Configuración inválida' using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(scenario -> 'pause') is distinct from 'boolean'
    or (select count(*) from pg_catalog.jsonb_object_keys(scenario)) <> 17 then
    raise exception 'Campos inválidos' using errcode = '22023';
  end if;

  for field_name, minimum, maximum in
    select * from (values
      ('length', 1, 100), ('width', 1, 100), ('height', 1, 20),
      ('students', 0, 500), ('teachers', 0, 50), ('duration', 15, 240),
      ('pauseAt', 0, 240), ('pauseLength', 1, 60), ('rate', 0, 20),
      ('pauseRate', 0, 20), ('initial', 0, 10000), ('outside', 0, 10000),
      ('target', 100, 10000), ('emission', 0.0001, 0.03),
      ('step', 0.5, 30), ('seats', 0, 500)
    ) as fields(name, min_value, max_value)
  loop
    if pg_catalog.jsonb_typeof(scenario -> field_name) is distinct from 'number' then
      raise exception 'Valor numérico inválido' using errcode = '22023';
    end if;
    value := (scenario ->> field_name)::numeric;
    if value not between minimum and maximum
      or (field_name in ('students', 'teachers', 'seats') and value <> pg_catalog.trunc(value)) then
      raise exception 'Valor fuera de rango' using errcode = '22023';
    end if;
  end loop;

  if (scenario ->> 'pause')::boolean and
    (scenario ->> 'pauseAt')::numeric + (scenario ->> 'pauseLength')::numeric > (scenario ->> 'duration')::numeric then
    raise exception 'La pausa excede la duración de la clase' using errcode = '22023';
  end if;

  if (scenario ->> 'step')::numeric * greatest(
    (scenario ->> 'rate')::numeric,
    case when (scenario ->> 'pause')::boolean then (scenario ->> 'pauseRate')::numeric else 0 end
  ) > 120 then
    raise exception 'El paso excede el rango de estabilidad de Heun' using errcode = '22023';
  end if;

  insert into aula_en_pausa_private.scenarios (config) values (scenario)
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function aula_en_pausa_private.get_scenario(scenario_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select config from aula_en_pausa_private.scenarios where id = scenario_id;
$$;

-- Store the qualified calls at definition time so the API role needs no
-- permission to resolve names in the private schema.
create or replace function public.aula_en_pausa_save(scenario jsonb)
returns uuid
language sql
security invoker
set search_path = ''
return aula_en_pausa_private.save_scenario(scenario);

create or replace function public.aula_en_pausa_get(scenario_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
return aula_en_pausa_private.get_scenario(scenario_id);

revoke execute on function aula_en_pausa_private.save_scenario(jsonb), aula_en_pausa_private.get_scenario(uuid) from public, anon, authenticated;
grant execute on function aula_en_pausa_private.save_scenario(jsonb), aula_en_pausa_private.get_scenario(uuid) to anon;
revoke execute on function public.aula_en_pausa_save(jsonb) from public, anon, authenticated;
revoke execute on function public.aula_en_pausa_get(uuid) from public, anon, authenticated;
grant execute on function public.aula_en_pausa_save(jsonb), public.aula_en_pausa_get(uuid) to anon;

notify pgrst, 'reload schema';
commit;
