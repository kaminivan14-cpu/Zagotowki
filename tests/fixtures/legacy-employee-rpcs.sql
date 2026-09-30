-- Schema-only legacy definitions; no production rows or credential values. Test fixture only.
CREATE OR REPLACE FUNCTION "public"."login_employee"("p_pin" "text") RETURNS TABLE("id" bigint, "name" "text", "role" "text", "location_id" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select
    e.id,
    e.name,
    e.role,
    e.location_id
  from public."Employees" e
  where e.active = true
    and e.pin_hash = crypt(p_pin, e.pin_hash)
  limit 1;
$$;

CREATE OR REPLACE FUNCTION "public"."create_employee"("p_requester_id" bigint, "p_name" "text", "p_role" "text", "p_location_id" bigint, "p_pin" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $_$

DECLARE
  v_id bigint;
  v_requester_role text;
  v_requester_location_id bigint;
  v_target_location_id bigint;

BEGIN

  -- =========================
  -- KTO WYKONUJE OPERACJĘ
  -- =========================

  SELECT
    e.role,
    e.location_id
  INTO
    v_requester_role,
    v_requester_location_id
  FROM public."Employees" e
  WHERE e.id = p_requester_id
    AND e.active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brak dostępu';
  END IF;


  -- Tylko administrator i manager
  IF v_requester_role NOT IN ('administrator', 'manager') THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;


  -- =========================
  -- WALIDACJA IMIENIA
  -- =========================

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Imię jest wymagane';
  END IF;


  -- =========================
  -- WALIDACJA ROLI
  -- =========================

  IF p_role NOT IN (
    'employee',
    'su-chef',
    'manager',
    'administrator'
  ) THEN
    RAISE EXCEPTION 'Nieprawidłowa rola';
  END IF;


  -- =========================
  -- UPRAWNIENIA MANAGERA
  -- =========================

  -- Manager może tworzyć WYŁĄCZNIE employee i su-chef
  IF v_requester_role = 'manager'
     AND p_role NOT IN ('employee', 'su-chef') THEN

    RAISE EXCEPTION
      'Manager może tworzyć tylko employee i su-chef';

  END IF;


  -- =========================
  -- WALIDACJA PIN
  -- =========================

  -- Manager i administrator: dokładnie 6 cyfr
  IF p_role IN ('manager', 'administrator') THEN

    IF p_pin !~ '^[0-9]{6}$' THEN
      RAISE EXCEPTION
        'PIN managera i administratora musi mieć dokładnie 6 cyfr';
    END IF;

  -- Employee i su-chef: 4-8 cyfr
  ELSE

    IF p_pin !~ '^[0-9]{4,8}$' THEN
      RAISE EXCEPTION
        'PIN musi mieć od 4 do 8 cyfr';
    END IF;

  END IF;


  -- =========================
  -- UNIKALNOŚĆ PIN
  -- =========================

  IF EXISTS (
    SELECT 1
    FROM public."Employees" e
    WHERE e.pin_hash IS NOT NULL
      AND e.pin_hash = crypt(p_pin, e.pin_hash)
  ) THEN

    RAISE EXCEPTION
      'Ten PIN jest już używany przez innego pracownika';

  END IF;


  -- =========================
  -- WYBÓR LOKALU
  -- =========================

  -- Administrator wybiera lokal
  IF v_requester_role = 'administrator' THEN

    v_target_location_id := p_location_id;

  -- Manager ZAWSZE tworzy w swoim lokalu
  ELSE

    IF v_requester_location_id IS NULL THEN
      RAISE EXCEPTION 'Manager nie ma przypisanego lokalu';
    END IF;

    v_target_location_id := v_requester_location_id;

  END IF;


  -- Lokal wymagany dla wszystkich poza administratorem
  IF p_role <> 'administrator'
     AND v_target_location_id IS NULL THEN

    RAISE EXCEPTION 'Lokal jest wymagany';

  END IF;


  -- =========================
  -- TWORZENIE PRACOWNIKA
  -- =========================

  INSERT INTO public."Employees" (
    name,
    role,
    location_id,
    pin_hash,
    active
  )
  VALUES (
    trim(p_name),
    p_role,

    CASE
      WHEN p_role = 'administrator'
        THEN NULL
      ELSE v_target_location_id
    END,

    crypt(
      p_pin,
      gen_salt('bf')
    ),

    true
  )

  RETURNING id INTO v_id;


  RETURN v_id;

END;

$_$;

CREATE OR REPLACE FUNCTION "public"."change_employee_pin"("p_requester_id" bigint, "p_employee_id" bigint, "p_new_pin" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $_$
DECLARE
  v_requester_role text;
  v_requester_location_id bigint;

  v_employee_role text;
  v_employee_location_id bigint;
BEGIN

  -- Kto wykonuje operację?
  SELECT
    e.role,
    e.location_id
  INTO
    v_requester_role,
    v_requester_location_id
  FROM public."Employees" e
  WHERE e.id = p_requester_id
    AND e.active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brak dostępu';
  END IF;

  -- Pobieramy osobę, której zmieniamy PIN
  SELECT
    e.role,
    e.location_id
  INTO
    v_employee_role,
    v_employee_location_id
  FROM public."Employees" e
  WHERE e.id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pracownik nie istnieje';
  END IF;

  -- ADMINISTRATOR może zmieniać PIN wszystkim
  IF v_requester_role = 'administrator' THEN
    NULL;

  -- MANAGER tylko employee ze swojego lokalu
  ELSIF v_requester_role = 'manager' THEN

    IF v_employee_role <> 'employee' THEN
      RAISE EXCEPTION
        'Manager może zmieniać PIN tylko pracownikom';
    END IF;

    IF v_requester_location_id IS NULL
       OR v_employee_location_id IS NULL
       OR v_requester_location_id <> v_employee_location_id THEN

      RAISE EXCEPTION
        'Manager może zmieniać PIN tylko pracownikom swojego lokalu';

    END IF;

  ELSE
    RAISE EXCEPTION 'Brak uprawnień do zmiany PIN';
  END IF;

  -- Manager i administrator: dokładnie 6 cyfr
  IF v_employee_role IN ('manager', 'administrator') THEN

    IF p_new_pin !~ '^[0-9]{6}$' THEN
      RAISE EXCEPTION
        'PIN managera i administratora musi mieć dokładnie 6 cyfr';
    END IF;

  -- Employee i su-chef: 4-8 cyfr
  ELSE

    IF p_new_pin !~ '^[0-9]{4,8}$' THEN
      RAISE EXCEPTION
        'PIN musi mieć od 4 do 8 cyfr';
    END IF;

  END IF;

  -- PIN nie może należeć do innego konta
  IF EXISTS (
    SELECT 1
    FROM public."Employees" e
    WHERE e.id <> p_employee_id
      AND e.pin_hash IS NOT NULL
      AND e.pin_hash = crypt(p_new_pin, e.pin_hash)
  ) THEN
    RAISE EXCEPTION
      'Ten PIN jest już używany przez innego pracownika';
  END IF;

  -- Zapisujemy hash PIN-u
  UPDATE public."Employees"
  SET pin_hash = crypt(
    p_new_pin,
    gen_salt('bf')
  )
  WHERE id = p_employee_id;

END;
$_$;

CREATE OR REPLACE FUNCTION "public"."get_employees"("p_requester_id" bigint) RETURNS TABLE("id" bigint, "name" "text", "role" "text", "location_id" bigint, "active" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_location_id bigint;
begin
  select e.role, e.location_id
  into v_role, v_location_id
  from public."Employees" e
  where e.id = p_requester_id
    and e.active = true;

  if not found then
    raise exception 'Brak dostępu';
  end if;

  if v_role = 'administrator' then
    return query
    select
      e.id,
      e.name,
      e.role,
      e.location_id,
      e.active
    from public."Employees" e
    order by e.name;

  elsif v_role = 'manager' then
    return query
    select
      e.id,
      e.name,
      e.role,
      e.location_id,
      e.active
    from public."Employees" e
    where e.location_id = v_location_id
    order by e.name;

  else
    raise exception 'Brak uprawnień do listy pracowników';
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."update_employee"("p_requester_id" bigint, "p_employee_id" bigint, "p_name" "text", "p_role" "text", "p_location_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_requester_role text;
  v_requester_location_id bigint;

  v_employee_role text;
  v_employee_location_id bigint;
begin

  -- Kto wykonuje operację?
  select e.role, e.location_id
  into v_requester_role, v_requester_location_id
  from public."Employees" e
  where e.id = p_requester_id
    and e.active = true;

  if not found then
    raise exception 'Brak dostępu';
  end if;


  -- Kogo edytujemy?
  select e.role, e.location_id
  into v_employee_role, v_employee_location_id
  from public."Employees" e
  where e.id = p_employee_id;

  if not found then
    raise exception 'Pracownik nie istnieje';
  end if;


  -- Imię
  if p_name is null or trim(p_name) = '' then
    raise exception 'Imię nie może być puste';
  end if;


  -- Dozwolone role
  if p_role not in (
    'employee',
    'su-chef',
    'manager',
    'administrator'
  ) then
    raise exception 'Nieprawidłowa rola';
  end if;


  -- =========================
  -- ADMINISTRATOR
  -- =========================
  if v_requester_role = 'administrator' then

    if p_role <> 'administrator'
       and p_location_id is null then
      raise exception 'Wybierz lokal';
    end if;

    update public."Employees"
    set
      name = trim(p_name),
      role = p_role,
      location_id = case
        when p_role = 'administrator' then null
        else p_location_id
      end
    where id = p_employee_id;

    return;
  end if;


  -- =========================
  -- MANAGER
  -- =========================
  if v_requester_role = 'manager' then

    -- Manager może edytować tylko employee i su-chef
    if v_employee_role not in ('employee', 'su-chef') then
      raise exception
        'Manager może edytować tylko employee i su-chef';
    end if;

    -- Tylko swój lokal
    if v_employee_location_id is distinct from v_requester_location_id then
      raise exception
        'Nie możesz edytować pracownika innego lokalu';
    end if;

    -- Manager może nadać tylko employee lub su-chef
    if p_role not in ('employee', 'su-chef') then
      raise exception
        'Manager może nadawać tylko role employee i su-chef';
    end if;

    update public."Employees"
    set
      name = trim(p_name),
      role = p_role,
      location_id = v_requester_location_id
    where id = p_employee_id;

    return;
  end if;


  raise exception 'Brak uprawnień';

end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_employee_active"("p_requester_id" bigint, "p_employee_id" bigint, "p_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_requester_role text;
  v_requester_location_id bigint;
  v_employee_role text;
  v_employee_location_id bigint;
BEGIN

  -- Nie można zmieniać statusu własnego konta
  IF p_requester_id = p_employee_id THEN
    RAISE EXCEPTION
      'Nie możesz zmienić statusu własnego konta';
  END IF;


  -- Kto wykonuje operację?
  SELECT
    e.role,
    e.location_id
  INTO
    v_requester_role,
    v_requester_location_id
  FROM public."Employees" e
  WHERE e.id = p_requester_id
    AND e.active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brak dostępu';
  END IF;


  -- Kogo aktywujemy/dezaktywujemy?
  SELECT
    e.role,
    e.location_id
  INTO
    v_employee_role,
    v_employee_location_id
  FROM public."Employees" e
  WHERE e.id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pracownik nie istnieje';
  END IF;


  -- =========================
  -- ADMINISTRATOR
  -- =========================

  -- Administrator może zarządzać wszystkimi
  -- poza własnym kontem (sprawdzone wyżej)
  IF v_requester_role = 'administrator' THEN

    UPDATE public."Employees"
    SET active = p_active
    WHERE id = p_employee_id;

    RETURN;

  END IF;


  -- =========================
  -- MANAGER
  -- =========================

  IF v_requester_role = 'manager' THEN

    -- Tylko pracownik swojego lokalu
    IF v_employee_location_id IS DISTINCT FROM v_requester_location_id THEN
      RAISE EXCEPTION
        'Nie możesz zarządzać pracownikiem innego lokalu';
    END IF;

    -- Tylko employee i su-chef
    IF v_employee_role NOT IN ('employee', 'su-chef') THEN
      RAISE EXCEPTION
        'Manager może zarządzać tylko employee i su-chef';
    END IF;

    UPDATE public."Employees"
    SET active = p_active
    WHERE id = p_employee_id;

    RETURN;

  END IF;


  -- Pozostałe role bez dostępu
  RAISE EXCEPTION 'Brak uprawnień';

END;
$$;