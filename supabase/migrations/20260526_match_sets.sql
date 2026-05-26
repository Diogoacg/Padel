alter table public.matches
  add column if not exists set_1_a integer not null default 6,
  add column if not exists set_1_b integer not null default 4,
  add column if not exists set_2_a integer not null default 6,
  add column if not exists set_2_b integer not null default 4,
  add column if not exists set_3_a integer not null default 0,
  add column if not exists set_3_b integer not null default 0;

update public.matches
set
  set_1_a = score_a,
  set_1_b = score_b,
  set_2_a = score_a,
  set_2_b = score_b,
  set_3_a = 0,
  set_3_b = 0,
  score_a = case when score_a > score_b then 2 else 0 end,
  score_b = case when score_b > score_a then 2 else 0 end
where not (
  score_a in (0, 1, 2) and
  score_b in (0, 1, 2) and
  ((score_a = 2 and score_b in (0, 1)) or (score_b = 2 and score_a in (0, 1)))
);

alter table public.matches
  drop constraint if exists positive_set_scores;

alter table public.matches
  add constraint positive_set_scores check (
    set_1_a >= 0 and set_1_b >= 0 and
    set_2_a >= 0 and set_2_b >= 0 and
    set_3_a >= 0 and set_3_b >= 0
  );

alter table public.matches
  drop constraint if exists best_of_three_sets;

alter table public.matches
  add constraint best_of_three_sets check (
    score_a in (0, 1, 2) and
    score_b in (0, 1, 2) and
    ((score_a = 2 and score_b in (0, 1)) or (score_b = 2 and score_a in (0, 1)))
  );
