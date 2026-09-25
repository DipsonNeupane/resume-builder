-- Pin resolution for invoker validation helpers. Application helper calls are
-- already public-qualified; builtins resolve through implicit pg_catalog.
alter function public.resume_strings_ok(jsonb, text[], integer) set search_path = '';
alter function public.resume_entry_ok(jsonb) set search_path = '';
alter function public.resume_section_ok(jsonb) set search_path = '';
alter function public.resume_sections_ok(jsonb) set search_path = '';
alter function public.resume_data_is_valid(jsonb) set search_path = '';
