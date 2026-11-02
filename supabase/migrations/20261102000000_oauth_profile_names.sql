-- Google and GitHub sign-ins put the person's name in different metadata fields
-- (GitHub may only send a username), so try each before falling back to the email.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  palette text[] := array['#2B4BDB', '#C2256E', '#0F7B6C', '#B4540A', '#6B3FD4', '#0B6FA8', '#A0233C', '#4F7A12'];
begin
  insert into public.profiles (id, full_name, color)
  values (
    new.id,
    coalesce(nullif(btrim(left(new.raw_user_meta_data ->> 'full_name', 80)), ''),
             nullif(btrim(left(new.raw_user_meta_data ->> 'name', 80)), ''),
             nullif(btrim(left(new.raw_user_meta_data ->> 'user_name', 80)), ''),
             left(split_part(new.email, '@', 1), 80), 'Member'),
    palette[1 + floor(random() * array_length(palette, 1))::int]
  );
  return new;
end;
$$;
