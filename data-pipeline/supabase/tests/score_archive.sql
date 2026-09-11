begin;

select plan(30);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'score_records', 'score_records table exists');
select has_column('public', 'songs', 'is_active', 'songs retain an active flag');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'score-one@example.test', 'not-a-password', now(), '{"display_name":" Score One "}'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'score-two@example.test', 'not-a-password', now(), '{}');

select ok((select display_name = 'Score One' from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 'signup trigger normalizes provider name');

insert into public.songs (title, artist, difficulty, constant, level, version)
values ('pgTAP Song', 'Test Artist', 'Future', 9.0, '9', 'test')
on conflict (title, artist, difficulty) do update set is_active = true;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;

insert into public.score_records (user_id, song_id, difficulty, score, clear_status, date_taken)
select '00000000-0000-0000-0000-000000000001', id, 'Future', 9000000, 'EX', current_date
from public.songs where title = 'pgTAP Song' and difficulty = 'Future';

select is((select count(*)::integer from public.score_records), 1, 'owner can append a score');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.score_records), 0, 'another user cannot read the score');
select is((select count(*)::integer from public.profiles), 1, 'another user cannot read the profile');
update public.profiles set display_name = 'Hacked' where id = '00000000-0000-0000-0000-000000000001';
reset role;
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 'Score One',
  'another user cannot update the profile');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

select throws_ok($$insert into public.score_records (user_id, song_id, difficulty, score, clear_status, date_taken)
  select '00000000-0000-0000-0000-000000000002', id, 'Past', 1, 'Clear', current_date
  from public.songs where title = 'pgTAP Song' and difficulty = 'Future'$$,
  'Song chart is not active or difficulty does not match',
  'mismatched difficulty is rejected');

select throws_ok($$update public.score_records set score = 1$$, NULL, 'score records are immutable through the authenticated API');
select throws_ok($$delete from public.score_records$$, NULL, 'score records cannot be deleted through the authenticated API');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok($$update public.profiles set display_name = ' ' where id = '00000000-0000-0000-0000-000000000001'$$,
  NULL, 'profile names cannot be blank');

select lives_ok($$insert into public.score_records (user_id, song_id, difficulty, score, clear_status, date_taken)
  select '00000000-0000-0000-0000-000000000001', id, 'Future', 9000001, 'Clear', current_date + 1
  from public.songs where title = 'pgTAP Song' and difficulty = 'Future'$$,
  'one UTC day ahead is accepted');
set local timezone = 'Etc/GMT+12';
select lives_ok($$insert into public.score_records (user_id, song_id, difficulty, score, clear_status, date_taken)
  select '00000000-0000-0000-0000-000000000001', id, 'Future', 9000002, 'Clear', current_date + 1
  from public.songs where title = 'pgTAP Song' and difficulty = 'Future'$$,
  'UTC-12 date boundary is accepted');
set local timezone = 'Etc/GMT-14';
select lives_ok($$insert into public.score_records (user_id, song_id, difficulty, score, clear_status, date_taken)
  select '00000000-0000-0000-0000-000000000001', id, 'Future', 9000003, 'Clear', current_date + 1
  from public.songs where title = 'pgTAP Song' and difficulty = 'Future'$$,
  'UTC+14 date boundary is accepted');
set local timezone = 'UTC';
select throws_ok($$insert into public.score_records (user_id, song_id, difficulty, score, clear_status, date_taken)
  select '00000000-0000-0000-0000-000000000001', id, 'Future', 9000001, 'Clear', current_date + 2
  from public.songs where title = 'pgTAP Song' and difficulty = 'Future'$$,
  NULL, 'dates more than one UTC day ahead are rejected');
select throws_ok($$insert into public.score_records (user_id, song_id, difficulty, score, clear_status, date_taken)
  select '00000000-0000-0000-0000-000000000001', id, 'Future', 10000001, 'Clear', current_date
  from public.songs where title = 'pgTAP Song' and difficulty = 'Future'$$,
  NULL, 'scores above the maximum are rejected');
select throws_ok($$insert into public.score_records (user_id, song_id, difficulty, score, clear_status, date_taken)
  select '00000000-0000-0000-0000-000000000001', id, 'Future', 9000001, 'Unknown', current_date
  from public.songs where title = 'pgTAP Song' and difficulty = 'Future'$$,
  NULL, 'unknown clear statuses are rejected');

reset role;
update public.songs set is_active = false where title = 'pgTAP Song' and difficulty = 'Future';
select is((select is_active from public.songs where title = 'pgTAP Song' and difficulty = 'Future'), false,
  'retirement marks a chart inactive');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok($$insert into public.score_records (user_id, song_id, difficulty, score, clear_status, date_taken)
  select '00000000-0000-0000-0000-000000000001', id, 'Future', 9000001, 'Clear', current_date
  from public.songs where title = 'pgTAP Song' and difficulty = 'Future'$$,
  'Song chart is not active or difficulty does not match', 'inactive charts cannot receive new scores');
reset role;
update public.songs set is_active = true where title = 'pgTAP Song' and difficulty = 'Future';
select is((select is_active from public.songs where title = 'pgTAP Song' and difficulty = 'Future'), true,
  'reactivation restores a chart');
set local role authenticated;
select lives_ok($$insert into public.score_records (user_id, song_id, difficulty, score, clear_status, date_taken)
  select '00000000-0000-0000-0000-000000000001', id, 'Future', 9000001, 'Clear', current_date
  from public.songs where title = 'pgTAP Song' and difficulty = 'Future'$$,
  'reactivated charts accept new scores');

reset role;
insert into public.song_sync_runs (id, status, source_revision, row_count, dataset_hash)
values ('00000000-0000-0000-0000-000000000011', 'staged', 'test', 1, 'one');
insert into public.song_sync_staging (run_id, title, artist, difficulty, constant, level, version, charter)
values ('00000000-0000-0000-0000-000000000011', 'Sync Song', 'Sync Artist', 'Future', 9.0, '9', 'test', 'Charter');
select lives_ok($$select public.publish_song_sync('00000000-0000-0000-0000-000000000011', true)$$,
  'first complete sync publishes a chart');
select is((select is_active from public.songs where title = 'Sync Song'), true, 'published charts are active');

insert into public.song_sync_runs (id, status, source_revision, row_count, dataset_hash)
values ('00000000-0000-0000-0000-000000000012', 'staged', 'test', 1, 'two');
insert into public.song_sync_staging (run_id, title, artist, difficulty, constant, level, version, charter)
values ('00000000-0000-0000-0000-000000000012', 'pgTAP Song', 'Test Artist', 'Future', 9.0, '9', 'test', NULL);
select lives_ok($$select public.publish_song_sync('00000000-0000-0000-0000-000000000012', true)$$,
  'second complete sync retires absent charts');
select is((select is_active from public.songs where title = 'Sync Song'), false, 'absent charts are retained inactive');
select ok((select count(*) from public.score_records sr join public.songs s on s.id = sr.song_id
  where s.title = 'pgTAP Song') > 0, 'history remains joinable after retirement');

insert into public.song_sync_runs (id, status, source_revision, row_count, dataset_hash)
values ('00000000-0000-0000-0000-000000000013', 'staged', 'test', 1, 'three');
insert into public.song_sync_staging (run_id, title, artist, difficulty, constant, level, version, charter)
values ('00000000-0000-0000-0000-000000000013', 'Sync Song', 'Sync Artist', 'Future', 9.0, '9', 'test', 'Charter');
select lives_ok($$select public.publish_song_sync('00000000-0000-0000-0000-000000000013', true)$$,
  'third complete sync reactivates a chart');
select is((select is_active from public.songs where title = 'Sync Song'), true, 'reappearing charts are active again');

reset role;
delete from auth.users where id = '00000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.score_records where user_id = '00000000-0000-0000-0000-000000000001'), 0, 'account deletion cascades score records');

select * from finish();
rollback;
