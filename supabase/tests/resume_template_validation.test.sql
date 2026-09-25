begin;
select plan(8);

create function pg_temp.resume_with_template(template_id text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'version', 1,
    'name', 'Template Test',
    'headline', '',
    'email', '',
    'phone', '',
    'location', '',
    'website', '',
    'summary', '',
    'skills', '',
    'profileHeading', 'Profile',
    'skillsHeading', 'Skills',
    'sections', '[]'::jsonb,
    'template', template_id,
    'paper', 'A4',
    'accent', '#20594a',
    'direction', 'ltr',
    'language', 'en',
    'noExperience', false
  )
$$;

select is(public.resume_data_is_valid(pg_temp.resume_with_template('modern')), true, 'modern template is valid');
select is(public.resume_data_is_valid(pg_temp.resume_with_template('classic')), true, 'classic template is valid');
select is(public.resume_data_is_valid(pg_temp.resume_with_template('minimal')), true, 'minimal template is valid');
select is(public.resume_data_is_valid(pg_temp.resume_with_template('compact')), true, 'compact template is valid');
select is(public.resume_data_is_valid(pg_temp.resume_with_template('bold')), true, 'bold template is valid');
select is(public.resume_data_is_valid(pg_temp.resume_with_template('executive')), true, 'executive template is valid');
select is(public.resume_data_is_valid(pg_temp.resume_with_template('ledger')), true, 'ledger template is valid');
select is(public.resume_data_is_valid(pg_temp.resume_with_template('unknown')), false, 'unknown template is invalid');

select * from finish();
rollback;
