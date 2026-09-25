-- Keep the database validator aligned with the seven templates accepted by
-- the application. All other shape checks remain unchanged from the original
-- validator, and the empty search path remains pinned explicitly.
create or replace function public.resume_data_is_valid(data jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(data) = 'object'
    and jsonb_typeof(data -> 'version') = 'number' and (data ->> 'version') = '1'
    and public.resume_strings_ok(data, array['name','headline','email','phone','location','website','summary','skills'], 50000)
    and public.resume_strings_ok(data, array['profileHeading','skillsHeading'], 200)
    and (data ->> 'template') in ('modern','classic','minimal','compact','bold','executive','ledger')
    and (data ->> 'paper') in ('A4','Letter')
    and (data ->> 'direction') in ('ltr','rtl')
    and (data ->> 'accent') ~ '^#[0-9a-fA-F]{6}$'
    and (data ->> 'language') ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$'
    and (data -> 'noExperience' is null or jsonb_typeof(data -> 'noExperience') = 'boolean')
    and case when jsonb_typeof(data -> 'sections') = 'array' then
      jsonb_array_length(data -> 'sections') <= 30
      and public.resume_sections_ok(data -> 'sections')
    else false end
$$;
