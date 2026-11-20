// Lớp kết nối Supabase. Mọi truy cập dữ liệu đi qua tệp này.
// Phân quyền thật sự nằm trong cơ sở dữ liệu (01_schema.sql), không nằm ở đây.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { one } from './util.js';

export const configured = !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR-ANON');

const sb = configured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    })
  : null;

const must = ({ data, error }) => { if (error) throw error; return data; };
const siteUrl = () => location.origin + location.pathname;

// ---------- Tài khoản ----------
export async function getSession() {
  if (!sb) return null;
  return must(await sb.auth.getSession()).session;
}
export function onAuth(cb) { if (sb) sb.auth.onAuthStateChange((event, session) => cb(event, session)); }

export async function checkCode(code) {
  return must(await sb.rpc('check_join_code', { p_code: code }));
}
export async function signUp({ email, password, fullName, code }) {
  return must(await sb.auth.signUp({
    email, password,
    options: { data: { full_name: fullName, join_code: code }, emailRedirectTo: siteUrl() },
  }));
}
export async function signIn(email, password) {
  return must(await sb.auth.signInWithPassword({ email, password }));
}
export async function signOut() { await sb.auth.signOut(); }
export async function sendReset(email) {
  return must(await sb.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() }));
}
export async function updatePassword(password) {
  return must(await sb.auth.updateUser({ password }));
}

export async function getMyProfile(userId) {
  return must(await sb.from('profiles').select('*').eq('id', userId).maybeSingle());
}
export async function updateMyName(name) {
  return must(await sb.rpc('update_my_name', { p_name: name }));
}

// ---------- Bài học & đề thi ----------
const LESSON_LIST = 'id, kind, title, summary, part, level, topic, update_batch, status, publish_at, due_at, created_at, updated_at';

export async function listLessons({ kind } = {}) {
  let q = sb.from('lessons').select(LESSON_LIST).order('publish_at', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false });
  if (kind) q = q.eq('kind', kind);
  return must(await q);
}
export async function getLesson(id) {
  return must(await sb.from('lessons').select('*').eq('id', id).maybeSingle());
}
export async function saveLesson(lesson) {
  const row = { ...lesson };
  delete row.created_at; delete row.updated_at; delete row.updated_by;
  if (row.id) {
    const id = row.id; delete row.id;
    return must(await sb.from('lessons').update(row).eq('id', id).select().single());
  }
  delete row.id;
  return must(await sb.from('lessons').insert(row).select().single());
}
export async function deleteLesson(id) {
  must(await sb.from('lessons').delete().eq('id', id));
}
export async function listRevisions(lessonId) {
  return must(await sb.from('lesson_revisions').select('*').eq('lesson_id', lessonId).order('edited_at', { ascending: false }));
}

// ---------- Tệp ----------
export async function signedUrl(bucket, path, secs = 3600) {
  if (!path) return null;
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, secs);
  if (error) return null;
  return data.signedUrl;
}
export async function uploadMedia(lessonId, file) {
  const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = `${lessonId}/${Date.now()}_${safe}`;
  must(await sb.storage.from('lesson-media').upload(path, file, { contentType: file.type || 'application/octet-stream' }));
  return path;
}
export async function removeMedia(path) {
  must(await sb.storage.from('lesson-media').remove([path]));
}

// ---------- Bài nộp ----------
export async function createSubmission({ userId, lessonId, taskKey, taskLabel, blob, mime, duration, selfAssessment, note }) {
  const ext = /mp4|m4a|aac/.test(mime) ? 'm4a' : /mpeg|mp3/.test(mime) ? 'mp3' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : 'webm';
  const path = `${userId}/${lessonId}/${Date.now()}_${taskKey}.${ext}`;
  must(await sb.storage.from('recordings').upload(path, blob, { contentType: mime || 'audio/webm' }));
  const { data, error } = await sb.from('submissions').insert({
    student_id: userId, lesson_id: lessonId, task_key: taskKey, task_label: taskLabel,
    audio_path: path, audio_mime: mime, duration_seconds: duration ? Math.round(duration) : null,
    self_assessment: selfAssessment || {}, student_note: note || '',
  }).select().single();
  if (error) { await sb.storage.from('recordings').remove([path]); throw error; }
  return data;
}

const SUB_SELECT = '*, lessons(id, title, kind, part, topic, level), feedback(*), profiles(full_name, email, cohort)';
const normSub = (s) => ({ ...s, feedback: one(s.feedback), lessons: one(s.lessons), profiles: one(s.profiles) });

export async function listMySubmissions(userId) {
  const data = must(await sb.from('submissions').select(SUB_SELECT).eq('student_id', userId).order('created_at', { ascending: false }));
  return data.map(normSub);
}
export async function listAllSubmissions() {
  const data = must(await sb.from('submissions').select(SUB_SELECT).order('created_at', { ascending: false }).limit(500));
  return data.map(normSub);
}
export async function getSubmission(id) {
  const s = must(await sb.from('submissions').select(SUB_SELECT).eq('id', id).maybeSingle());
  return s ? normSub(s) : null;
}
export async function deleteSubmissionAudio(sub) {
  if (sub.audio_path) must(await sb.storage.from('recordings').remove([sub.audio_path]));
  must(await sb.from('submissions').update({ audio_path: null }).eq('id', sub.id));
}

// ---------- Phản hồi ----------
export async function saveFeedback(submissionId, teacherId, fields, release) {
  const row = { submission_id: submissionId, teacher_id: teacherId, ...fields };
  if (release) row.released = true;
  return must(await sb.from('feedback').upsert(row, { onConflict: 'submission_id' }).select().single());
}
export async function markFeedbackSeen(id) {
  await sb.rpc('mark_feedback_seen', { p_feedback: id });
}

// ---------- Mã tham gia ----------
export async function listCodes() {
  return must(await sb.from('join_codes')
    .select('id, code_hint, role, label, cohort, expires_at, max_uses, used_count, revoked, created_at')
    .eq('role', 'student').order('created_at', { ascending: false }));
}
export async function createCode({ label, cohort, expiresAt, maxUses }) {
  return must(await sb.rpc('create_join_code', {
    p_label: label, p_cohort: cohort, p_expires_at: expiresAt, p_max_uses: maxUses,
  }));
}
export async function setCodeRevoked(id, revoked) {
  must(await sb.from('join_codes').update({ revoked }).eq('id', id));
}
export async function listCodeUses() {
  return must(await sb.from('join_code_uses').select('code_id, user_id, used_at'));
}

// ---------- Học viên ----------
export async function listStudents() {
  return must(await sb.from('profiles').select('*').eq('role', 'student').order('created_at', { ascending: false }));
}
export async function updateStudent(id, patch) {
  must(await sb.from('profiles').update(patch).eq('id', id));
}
export async function setStudentPassword(id, password) {
  must(await sb.rpc('teacher_set_password', { p_user: id, p_password: password }));
}
