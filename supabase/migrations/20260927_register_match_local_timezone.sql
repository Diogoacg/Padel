-- Match dates are civil dates in the app's Portugal locale. Keep the server-side
-- future-date guard aligned with the browser around midnight and DST changes,
-- regardless of the database session's default timezone (usually UTC).
alter function public.register_match(
  date,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
)
set timezone to 'Europe/Lisbon';
