-- =====================================================================
-- IELTS Speaking B1–B2 · Cơ sở dữ liệu Supabase
-- Chạy toàn bộ tệp này MỘT LẦN trong Supabase → SQL Editor → New query → Run.
-- Tạo: bảng, phân quyền (Row Level Security), mã tham gia, kho ghi âm.
-- =====================================================================

-- ---------- 1. BẢNG ----------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text not null default '',
  role        text not null default 'student' check (role in ('teacher','student')),
  cohort      text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.join_codes (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text not null unique,            -- chỉ lưu bản băm, không lưu mã gốc
  code_hint   text,                            -- 3 ký tự cuối để giáo viên nhận ra mã
  role        text not null default 'student' check (role in ('teacher','student')),
  label       text not null default '',
  cohort      text,
  expires_at  timestamptz,
  max_uses    int  not null default 1 check (max_uses > 0),
  used_count  int  not null default 0,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.join_code_uses (
  id       bigint generated always as identity primary key,
  code_id  uuid not null references public.join_codes(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  used_at  timestamptz not null default now()
);

create table if not exists public.lessons (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'lesson' check (kind in ('lesson','mock_test')),
  title         text not null,
  summary       text not null default '',
  part          smallint check (part in (1,2,3)),          -- null = đề thi đủ 3 phần
  level         text not null default 'B1-B2' check (level in ('B1','B2','B1-B2')),
  topic         text not null default '',
  update_batch  text,                                       -- ví dụ "2026-12 · Đợt 1"
  status        text not null default 'draft' check (status in ('draft','published','unpublished')),
  publish_at    timestamptz,                                -- thời điểm hiện cho học viên
  due_at        timestamptz,                                -- hạn nộp (không bắt buộc)
  content       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

create table if not exists public.lesson_revisions (
  id          bigint generated always as identity primary key,
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  action      text not null,
  title       text,
  status      text,
  publish_at  timestamptz,
  snapshot    jsonb not null,
  edited_by   uuid,
  edited_at   timestamptz not null default now()
);

create table if not exists public.submissions (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  lesson_id         uuid not null references public.lessons(id) on delete cascade,
  task_key          text not null default 'main',
  task_label        text,
  audio_path        text,
  audio_mime        text,
  duration_seconds  int,
  self_assessment   jsonb not null default '{}'::jsonb,
  student_note      text not null default '',
  status            text not null default 'submitted' check (status in ('submitted','reviewed')),
  created_at        timestamptz not null default now()
);

create table if not exists public.feedback (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null unique references public.submissions(id) on delete cascade,
  teacher_id     uuid references auth.users(id) on delete set null,
  fc_band   smallint check (fc_band  between 0 and 9),
  lr_band   smallint check (lr_band  between 0 and 9),
  gra_band  smallint check (gra_band between 0 and 9),
  pr_band   smallint check (pr_band  between 0 and 9),
  fc_comment  text not null default '',
  lr_comment  text not null default '',
  gra_comment text not null default '',
  pr_comment  text not null default '',
  strengths     text not null default '',
  improvements  text not null default '',
  next_task     text not null default '',
  released      boolean not null default false,
  released_at   timestamptz,
  seen_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists submissions_student_idx on public.submissions(student_id);
create index if not exists submissions_lesson_idx  on public.submissions(lesson_id);
create index if not exists lessons_status_idx      on public.lessons(status, publish_at);

-- ---------- 2. HÀM HỖ TRỢ ---------------------------------------------

create or replace function public.hash_code(p_code text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(regexp_replace(upper(coalesce(p_code,'')), '\s', '', 'g'), 'UTF8')), 'hex')
$$;

create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'teacher' and active)
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create or replace function public.is_lesson_visible(p_lesson uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lessons
                 where id = p_lesson and status = 'published'
                   and coalesce(publish_at, created_at) <= now())
$$;

-- ---------- 3. ĐĂNG KÝ BẰNG MÃ THAM GIA --------------------------------

-- Kiểm tra mã (dùng trước khi hiện form đăng ký). Chỉ trả về đúng/sai.
create or replace function public.check_join_code(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.join_codes
    where code_hash = public.hash_code(p_code)
      and not revoked
      and (expires_at is null or expires_at > now())
      and used_count < max_uses)
$$;

-- Trước khi tạo tài khoản: kiểm tra mã ở máy chủ, trừ lượt, xoá mã gốc khỏi hồ sơ.
create or replace function public.before_auth_user_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code public.join_codes;
begin
  select * into v_code from public.join_codes
   where code_hash = public.hash_code(new.raw_user_meta_data->>'join_code')
   for update;

  if not found or v_code.revoked
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or v_code.used_count >= v_code.max_uses then
    raise exception 'INVALID_JOIN_CODE';
  end if;

  update public.join_codes set used_count = used_count + 1 where id = v_code.id;

  new.raw_user_meta_data := (coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'join_code')
                            || jsonb_build_object('join_code_id', v_code.id);
  return new;
end $$;

-- Sau khi tạo tài khoản: tạo hồ sơ với vai trò lấy từ mã.
create or replace function public.after_auth_user_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code public.join_codes;
begin
  select * into v_code from public.join_codes
   where id = (new.raw_user_meta_data->>'join_code_id')::uuid;

  insert into public.profiles (id, email, full_name, role, cohort)
  values (new.id, new.email,
          left(coalesce(new.raw_user_meta_data->>'full_name', ''), 120),
          v_code.role, v_code.cohort);

  insert into public.join_code_uses (code_id, user_id) values (v_code.id, new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_before_insert on auth.users;
create trigger on_auth_user_before_insert
  before insert on auth.users
  for each row execute function public.before_auth_user_insert();

drop trigger if exists on_auth_user_after_insert on auth.users;
create trigger on_auth_user_after_insert
  after insert on auth.users
  for each row execute function public.after_auth_user_insert();

-- Giáo viên tạo mã học viên. Mã gốc chỉ trả về MỘT LẦN.
create or replace function public.create_join_code(
  p_label text, p_cohort text, p_expires_at timestamptz, p_max_uses int)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 ký tự, bỏ O/0/I/1
  v_raw   text := '';
  i int;
begin
  if not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  if coalesce(p_max_uses, 0) < 1 or p_max_uses > 500 then raise exception 'BAD_MAX_USES'; end if;
  for i in 1..8 loop
    v_raw := v_raw || substr(v_alpha, 1 + (get_byte(uuid_send(gen_random_uuid()), 0) % 32), 1);
  end loop;
  v_raw := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4);
  insert into public.join_codes (code_hash, code_hint, role, label, cohort, expires_at, max_uses, created_by)
  values (public.hash_code(v_raw), right(v_raw, 3), 'student',
          coalesce(p_label, ''), nullif(trim(p_cohort), ''), p_expires_at, p_max_uses, auth.uid());
  return v_raw;
end $$;

-- Giáo viên đặt lại mật khẩu cho học viên (khi học viên quên mật khẩu).
create or replace function public.teacher_set_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'PASSWORD_TOO_SHORT'; end if;
  if not exists (select 1 from public.profiles where id = p_user and role = 'student') then
    raise exception 'NOT_A_STUDENT';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user;
end $$;

create or replace function public.update_my_name(p_name text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set full_name = left(trim(p_name), 120) where id = auth.uid()
$$;

create or replace function public.mark_feedback_seen(p_feedback uuid)
returns void language sql security definer set search_path = public as $$
  update public.feedback f set seen_at = coalesce(f.seen_at, now())
   where f.id = p_feedback and f.released
     and exists (select 1 from public.submissions s
                 where s.id = f.submission_id and s.student_id = auth.uid())
$$;

-- ---------- 4. TỰ ĐỘNG: lịch sử bài, cập nhật thời gian, trạng thái chấm --

create or replace function public.lessons_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

drop trigger if exists lessons_touch on public.lessons;
create trigger lessons_touch before update on public.lessons
  for each row execute function public.lessons_touch();

create or replace function public.lessons_log_revision()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'Tạo mới';
  elsif new.status = 'published' and old.status <> 'published' then
    v_action := case when coalesce(new.publish_at, now()) > now() then 'Lên lịch xuất bản' else 'Xuất bản' end;
  elsif new.status = 'unpublished' and old.status <> 'unpublished' then
    v_action := 'Gỡ bài';
  elsif new.publish_at is distinct from old.publish_at and new.status = 'published' then
    v_action := 'Đổi lịch xuất bản';
  else
    v_action := 'Chỉnh sửa';
  end if;
  insert into public.lesson_revisions (lesson_id, action, title, status, publish_at, snapshot, edited_by)
  values (new.id, v_action, new.title, new.status, new.publish_at,
          jsonb_build_object('title', new.title, 'summary', new.summary, 'part', new.part,
                             'level', new.level, 'topic', new.topic, 'update_batch', new.update_batch,
                             'due_at', new.due_at, 'content', new.content),
          auth.uid());
  return new;
end $$;

drop trigger if exists lessons_log_revision on public.lessons;
create trigger lessons_log_revision after insert or update on public.lessons
  for each row execute function public.lessons_log_revision();

create or replace function public.feedback_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.released and (tg_op = 'INSERT' or not old.released) then
    new.released_at := now();
    update public.submissions set status = 'reviewed' where id = new.submission_id;
  end if;
  return new;
end $$;

drop trigger if exists feedback_touch on public.feedback;
create trigger feedback_touch before insert or update on public.feedback
  for each row execute function public.feedback_touch();

-- ---------- 5. PHÂN QUYỀN (ROW LEVEL SECURITY) -------------------------

alter table public.profiles         enable row level security;
alter table public.join_codes       enable row level security;
alter table public.join_code_uses   enable row level security;
alter table public.lessons          enable row level security;
alter table public.lesson_revisions enable row level security;
alter table public.submissions      enable row level security;
alter table public.feedback         enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_teacher());
drop policy if exists profiles_teacher_update on public.profiles;
create policy profiles_teacher_update on public.profiles for update to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- join codes: chỉ giáo viên
drop policy if exists codes_teacher on public.join_codes;
create policy codes_teacher on public.join_codes for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists code_uses_teacher on public.join_code_uses;
create policy code_uses_teacher on public.join_code_uses for select to authenticated
  using (public.is_teacher());

-- lessons: học viên chỉ thấy bài đã xuất bản và đã đến giờ
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons for select to authenticated
  using (public.is_teacher()
         or (public.is_active_user() and status = 'published'
             and coalesce(publish_at, created_at) <= now()));
drop policy if exists lessons_teacher_write on public.lessons;
create policy lessons_teacher_write on public.lessons for insert to authenticated
  with check (public.is_teacher());
drop policy if exists lessons_teacher_update on public.lessons;
create policy lessons_teacher_update on public.lessons for update to authenticated
  using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists lessons_teacher_delete on public.lessons;
create policy lessons_teacher_delete on public.lessons for delete to authenticated
  using (public.is_teacher());

drop policy if exists revisions_teacher on public.lesson_revisions;
create policy revisions_teacher on public.lesson_revisions for select to authenticated
  using (public.is_teacher());

-- submissions: học viên chỉ thấy bài của chính mình
drop policy if exists subs_select on public.submissions;
create policy subs_select on public.submissions for select to authenticated
  using (student_id = auth.uid() or public.is_teacher());
drop policy if exists subs_insert on public.submissions;
create policy subs_insert on public.submissions for insert to authenticated
  with check (student_id = auth.uid()
              and public.is_active_user()
              and public.is_lesson_visible(lesson_id)
              and audio_path like auth.uid()::text || '/%'
              and status = 'submitted');
drop policy if exists subs_teacher_update on public.submissions;
create policy subs_teacher_update on public.submissions for update to authenticated
  using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists subs_teacher_delete on public.submissions;
create policy subs_teacher_delete on public.submissions for delete to authenticated
  using (public.is_teacher());

-- feedback: học viên chỉ thấy phản hồi đã gửi cho bài của mình
drop policy if exists fb_select on public.feedback;
create policy fb_select on public.feedback for select to authenticated
  using (public.is_teacher()
         or (released and exists (select 1 from public.submissions s
                                  where s.id = submission_id and s.student_id = auth.uid())));
drop policy if exists fb_teacher_insert on public.feedback;
create policy fb_teacher_insert on public.feedback for insert to authenticated
  with check (public.is_teacher());
drop policy if exists fb_teacher_update on public.feedback;
create policy fb_teacher_update on public.feedback for update to authenticated
  using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists fb_teacher_delete on public.feedback;
create policy fb_teacher_delete on public.feedback for delete to authenticated
  using (public.is_teacher());

-- Quyền truy cập bảng (RLS ở trên vẫn quyết định từng dòng)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant execute on function public.check_join_code(text) to anon, authenticated;
revoke execute on function public.create_join_code(text, text, timestamptz, int) from anon;
revoke execute on function public.teacher_set_password(uuid, text) from anon;

-- ---------- 6. KHO TỆP (ghi âm và tài liệu bài học) ---------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('recordings', 'recordings', false, 26214400),     -- tối đa 25 MB/tệp
       ('lesson-media', 'lesson-media', false, 52428800)  -- tối đa 50 MB/tệp
on conflict (id) do nothing;

-- Ghi âm: lưu trong thư mục mang mã của học viên: recordings/<user id>/...
drop policy if exists rec_insert_own on storage.objects;
create policy rec_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings'
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.is_active_user());
drop policy if exists rec_select on storage.objects;
create policy rec_select on storage.objects for select to authenticated
  using (bucket_id = 'recordings'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_teacher()));
drop policy if exists rec_delete on storage.objects;
create policy rec_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recordings'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_teacher()));

-- Tài liệu bài học: lesson-media/<lesson id>/...
drop policy if exists media_select on storage.objects;
create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'lesson-media'
         and (public.is_teacher()
              or (public.is_active_user()
                  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
                  and public.is_lesson_visible(((storage.foldername(name))[1])::uuid))));
drop policy if exists media_teacher_insert on storage.objects;
create policy media_teacher_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'lesson-media' and public.is_teacher());
drop policy if exists media_teacher_update on storage.objects;
create policy media_teacher_update on storage.objects for update to authenticated
  using (bucket_id = 'lesson-media' and public.is_teacher());
drop policy if exists media_teacher_delete on storage.objects;
create policy media_teacher_delete on storage.objects for delete to authenticated
  using (bucket_id = 'lesson-media' and public.is_teacher());
