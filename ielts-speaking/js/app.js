// Ứng dụng chính: định tuyến, tài khoản, trang học viên.
import * as api from './api.js';
import { SITE_NAME, TEACHER_NAME } from './config.js';
import { $, $$, esc, fmtDate, toast, errMsg, isThisMonth, partLabel } from './util.js';
import { renderLesson, badges } from './render.js';
import * as T from './teacher.js';

const initialHash = location.hash;
export const S = { session: null, profile: null, recovery: /type=recovery/.test(initialHash), dirty: false };

const view = () => $('#view');
// Mỗi trang dùng một khung mới để các trình xử lý sự kiện của trang trước không còn hoạt động.
export function setView(html) {
  const old = view();
  const fresh = old.cloneNode(false);
  fresh.innerHTML = html;
  old.replaceWith(fresh);
  window.scrollTo(0, 0);
  return fresh;
}
export function go(path) { location.hash = '#' + path; }
const loading = () => setView('<div class="loading"><span class="spinner"></span> Đang tải…</div>');

// ---------- Định tuyến ----------
const routes = [
  ['/', landing, 'public'],
  ['/register', register, 'public'],
  ['/login', login, 'public'],
  ['/forgot', forgot, 'public'],
  ['/reset', resetPassword, 'any'],
  ['/home', studentHome, 'student'],
  ['/library', library, 'student'],
  ['/tests', tests, 'student'],
  ['/lesson/:id', lessonPage, 'student'],
  ['/progress', progress, 'student'],
  ['/submission/:id', submissionPage, 'student'],
  ['/account', account, 'auth'],
  ['/t', T.home, 'teacher'],
  ['/t/codes', T.codes, 'teacher'],
  ['/t/students', T.students, 'teacher'],
  ['/t/content', T.content, 'teacher'],
  ['/t/new/:kind', T.edit, 'teacher'],
  ['/t/edit/:id', T.edit, 'teacher'],
  ['/t/preview/:id', T.preview, 'teacher'],
  ['/t/history/:id', T.revisions, 'teacher'],
  ['/t/submissions', T.submissions, 'teacher'],
  ['/t/review/:id', T.review, 'teacher'],
];

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function match(path) {
  for (const [pattern, fn, guard] of routes) {
    const pp = pattern.split('/'), hp = path.split('/');
    if (pp.length !== hp.length) continue;
    const params = {};
    if (pp.every((seg, i) => (seg.startsWith(':') ? ((params[seg.slice(1)] = decodeURIComponent(hp[i])), true) : seg === hp[i]))) {
      return { fn, guard, params };
    }
  }
  return null;
}

const homeFor = () => (S.profile?.role === 'teacher' ? '/t' : '/home');
let lastHash = location.hash;

async function router() {
  // Liên kết từ email (xác nhận / đặt lại mật khẩu) mang token trong #...
  if (/access_token=|error_description=/.test(location.hash)) {
    if (/error_description=/.test(location.hash)) {
      const p = new URLSearchParams(location.hash.slice(1));
      toast('Liên kết không hợp lệ hoặc đã hết hạn: ' + (p.get('error_description') || ''), 'err');
    }
    history.replaceState(null, '', location.pathname + (S.recovery ? '#/reset' : '#/'));
  }
  if (S.dirty && location.hash !== lastHash) {
    if (!confirm('Bạn có thay đổi chưa lưu. Rời trang này?')) { history.replaceState(null, '', lastHash); return; }
    S.dirty = false;
  }
  lastHash = location.hash;

  const { path, query } = parseHash();
  const m = match(path);
  renderNav(path);
  if (!m) return setView('<div class="card center"><h1>Không tìm thấy trang</h1><a class="btn" href="#/">Về trang chủ</a></div>');

  const logged = !!(S.session && S.profile);
  if (m.guard === 'public' && logged) return go(homeFor());
  if (['student', 'teacher', 'auth'].includes(m.guard) && !logged) {
    sessionStorage.setItem('afterLogin', path);
    return go('/login');
  }
  if (m.guard === 'student' && S.profile?.role === 'teacher') {
    if (path.startsWith('/lesson/')) return go('/t/preview/' + m.params.id);
    if (path.startsWith('/submission/')) return go('/t/review/' + m.params.id);
    return go('/t');
  }
  if (m.guard === 'teacher' && S.profile?.role !== 'teacher') return go('/home');

  loading();
  try {
    await m.fn({ params: m.params, query });
  } catch (e) {
    console.error(e);
    setView(`<div class="card"><h2>Có lỗi xảy ra</h2><p>${esc(errMsg(e))}</p><button class="btn" onclick="location.reload()">Tải lại trang</button></div>`);
  }
}

function renderNav(path) {
  const nav = $('#nav');
  const role = S.profile?.role;
  let links = [];
  if (role === 'student') links = [['/home', 'Trang của tôi'], ['/library', 'Thư viện bài học'], ['/tests', 'Đề thi thử'], ['/progress', 'Bài nộp & phản hồi']];
  else if (role === 'teacher') links = [['/t', 'Tổng quan'], ['/t/content', 'Bài học & đề thi'], ['/t/submissions', 'Bài nộp'], ['/t/students', 'Học viên'], ['/t/codes', 'Mã tham gia']];
  const active = (p) => (path === p || (p !== '/t' && path.startsWith(p + '/')) ? 'active' : '');
  nav.innerHTML = links.map(([p, t]) => `<a href="#${p}" class="${active(p)}">${t}</a>`).join('');
  $('#userbox').innerHTML = role
    ? `<a href="#/account" class="user-link" title="Tài khoản">${esc(S.profile.full_name || S.profile.email)}</a><button class="btn small ghost" id="logout">Đăng xuất</button>`
    : (path === '/login' ? '' : '<a class="btn small" href="#/login">Đăng nhập</a>');
  $('#logout')?.addEventListener('click', async () => { await api.signOut(); S.session = null; S.profile = null; go('/'); });
  $('#brand').setAttribute('href', role ? '#' + homeFor() : '#/');
}

async function loadProfile() {
  S.profile = null;
  if (!S.session) return;
  S.profile = await api.getMyProfile(S.session.user.id);
}

function guardActive() {
  if (S.profile && !S.profile.active) {
    setView(`<div class="card center narrow"><h1>Tài khoản đang tạm khoá</h1><p>Vui lòng liên hệ giáo viên để được mở lại.</p></div>`);
    return false;
  }
  return true;
}

// ---------- Trang công khai ----------
async function landing({ query }) {
  const code = query.code || '';
  const v = setView(`
    <section class="hero">
      <div class="hero-text">
        <p class="eyebrow">Khoá học trực tuyến · Trình độ B1–B2</p>
        <h1>${esc(SITE_NAME)}</h1>
        <p class="lead">Luyện IELTS Speaking Part 1, 2, 3 với bài học có hướng dẫn tiếng Việt, ghi âm ngay trên điện thoại và nhận phản hồi từ giảng viên ${esc(TEACHER_NAME)}.</p>
      </div>
      <form class="card join-card" id="joinForm" autocomplete="off">
        <h2>Tham gia khoá học</h2>
        <p class="small muted">Khoá học chỉ dành cho học viên được giáo viên cấp mã tham gia.</p>
        <label class="field"><span>Mã tham gia</span>
          <input name="code" required placeholder="VD: ABCD-EFGH" value="${esc(code)}" autocapitalize="characters" spellcheck="false"></label>
        <button class="btn primary block">Kiểm tra mã</button>
        <p class="small center">Đã có tài khoản? <a href="#/login">Đăng nhập</a></p>
      </form>
    </section>
    <section class="grid3">
      <div class="card feature"><div class="ico">📚</div><h3>Bài học theo Part 1–3</h3><p>Mục tiêu, từ vựng, cách phát triển ý, câu trả lời mẫu B1 và bản nâng cấp B2, lỗi người Việt hay mắc.</p></div>
      <div class="card feature"><div class="ico">🎙️</div><h3>Ghi âm có đồng hồ</h3><p>Đồng hồ chuẩn bị và đồng hồ nói theo đúng thời lượng từng phần thi. Nghe lại, ghi lại rồi mới nộp.</p></div>
      <div class="card feature"><div class="ico">📝</div><h3>Phản hồi của giáo viên</h3><p>Nhận xét theo 4 tiêu chí: Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, Pronunciation.</p></div>
    </section>
    <section class="card steps">
      <h2>Cách bắt đầu</h2>
      <ol><li>Nhập mã tham gia giáo viên gửi cho bạn.</li><li>Tạo tài khoản bằng email và mật khẩu của bạn.</li><li>Đăng nhập, học bài, ghi âm và nộp bài.</li></ol>
    </section>`);
  $('#joinForm', v).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || $('button', e.target);
    const c = e.target.code.value.trim().toUpperCase();
    btn.disabled = true;
    try {
      if (await api.checkCode(c)) { sessionStorage.setItem('joinCode', c); go('/register'); }
      else toast('Mã tham gia không hợp lệ, đã hết hạn hoặc đã hết lượt dùng.', 'err');
    } catch (err) { toast(errMsg(err), 'err'); } finally { btn.disabled = false; }
  });
}

async function register() {
  const code = sessionStorage.getItem('joinCode') || '';
  const v = setView(`
    <form class="card narrow" id="regForm">
      <h1>Tạo tài khoản học viên</h1>
      <label class="field"><span>Mã tham gia</span><input name="code" required value="${esc(code)}" autocapitalize="characters"></label>
      <label class="field"><span>Họ và tên</span><input name="name" required maxlength="120" autocomplete="name"></label>
      <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>Mật khẩu (ít nhất 8 ký tự)</span><input name="pw" type="password" minlength="8" required autocomplete="new-password"></label>
      <label class="field"><span>Nhập lại mật khẩu</span><input name="pw2" type="password" minlength="8" required autocomplete="new-password"></label>
      <button class="btn primary block">Tạo tài khoản</button>
      <p class="small center">Đã có tài khoản? <a href="#/login">Đăng nhập</a></p>
    </form>`);
  $('#regForm', v).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, btn = $('button', f);
    if (f.pw.value !== f.pw2.value) return toast('Hai mật khẩu không khớp.', 'err');
    btn.disabled = true; btn.textContent = 'Đang tạo…';
    try {
      const c = f.code.value.trim().toUpperCase();
      if (!(await api.checkCode(c))) throw new Error('INVALID_JOIN_CODE');
      const data = await api.signUp({ email: f.email.value.trim(), password: f.pw.value, fullName: f.name.value.trim(), code: c });
      sessionStorage.removeItem('joinCode');
      if (data.session) {
        S.session = data.session; await loadProfile();
        toast('Tạo tài khoản thành công. Chào mừng bạn!');
        go('/home');
      } else {
        setView(`<div class="card narrow center"><h1>Kiểm tra email của bạn</h1><p>Tài khoản đã được tạo. Hãy mở email từ hệ thống và bấm liên kết xác nhận, sau đó <a href="#/login">đăng nhập</a>.</p></div>`);
      }
    } catch (err) {
      toast(errMsg(err), 'err');
      btn.disabled = false; btn.textContent = 'Tạo tài khoản';
    }
  });
}

async function login() {
  const v = setView(`
    <form class="card narrow" id="loginForm">
      <h1>Đăng nhập</h1>
      <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>Mật khẩu</span><input name="pw" type="password" required autocomplete="current-password"></label>
      <button class="btn primary block">Đăng nhập</button>
      <p class="small center"><a href="#/forgot">Quên mật khẩu?</a> · <a href="#/">Tôi có mã tham gia</a></p>
    </form>`);
  $('#loginForm', v).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, btn = $('button', f);
    btn.disabled = true;
    try {
      const data = await api.signIn(f.email.value.trim(), f.pw.value);
      S.session = data.session; await loadProfile();
      if (!S.profile) throw new Error('Không tìm thấy hồ sơ tài khoản. Hãy liên hệ giáo viên.');
      const next = sessionStorage.getItem('afterLogin'); sessionStorage.removeItem('afterLogin');
      go(next && next !== '/login' && (S.profile.role === 'teacher') === next.startsWith('/t') ? next : homeFor());
    } catch (err) { toast(errMsg(err), 'err'); btn.disabled = false; }
  });
}

async function forgot() {
  const v = setView(`
    <form class="card narrow" id="fForm">
      <h1>Khôi phục mật khẩu</h1>
      <p>Nhập email đã đăng ký. Hệ thống sẽ gửi liên kết đặt lại mật khẩu.</p>
      <label class="field"><span>Email</span><input name="email" type="email" required></label>
      <button class="btn primary block">Gửi liên kết</button>
      <p class="small muted">Không nhận được email sau 10 phút (kiểm tra cả thư mục Spam)? Hãy nhắn giáo viên để được đặt lại mật khẩu trực tiếp.</p>
      <p class="small center"><a href="#/login">Quay lại đăng nhập</a></p>
    </form>`);
  $('#fForm', v).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button', e.target); btn.disabled = true;
    try { await api.sendReset(e.target.email.value.trim()); toast('Nếu email có trong hệ thống, liên kết đã được gửi.'); }
    catch (err) { toast(errMsg(err), 'err'); } finally { btn.disabled = false; }
  });
}

async function resetPassword() {
  if (!S.session) {
    return setView(`<div class="card narrow center"><h1>Liên kết đã hết hạn</h1><p>Hãy <a href="#/forgot">gửi lại liên kết</a> hoặc nhờ giáo viên đặt lại mật khẩu.</p></div>`);
  }
  const v = setView(`
    <form class="card narrow" id="rForm">
      <h1>Đặt mật khẩu mới</h1>
      <label class="field"><span>Mật khẩu mới (ít nhất 8 ký tự)</span><input name="pw" type="password" minlength="8" required autocomplete="new-password"></label>
      <label class="field"><span>Nhập lại</span><input name="pw2" type="password" minlength="8" required autocomplete="new-password"></label>
      <button class="btn primary block">Lưu mật khẩu</button>
    </form>`);
  $('#rForm', v).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.pw.value !== f.pw2.value) return toast('Hai mật khẩu không khớp.', 'err');
    try { await api.updatePassword(f.pw.value); S.recovery = false; toast('Đã đổi mật khẩu.'); go(homeFor()); }
    catch (err) { toast(errMsg(err), 'err'); }
  });
}

async function account() {
  const p = S.profile;
  const v = setView(`
    <div class="narrow">
      <h1>Tài khoản</h1>
      <form class="card" id="nameForm">
        <p class="muted small">${esc(p.email)} · ${p.role === 'teacher' ? 'Giáo viên' : 'Học viên'}${p.cohort ? ' · Lớp/đợt: ' + esc(p.cohort) : ''}</p>
        <label class="field"><span>Họ và tên</span><input name="name" value="${esc(p.full_name)}" required maxlength="120"></label>
        <button class="btn">Lưu tên</button>
      </form>
      <form class="card" id="pwForm">
        <h2>Đổi mật khẩu</h2>
        <label class="field"><span>Mật khẩu mới</span><input name="pw" type="password" minlength="8" required autocomplete="new-password"></label>
        <button class="btn">Đổi mật khẩu</button>
      </form>
    </div>`);
  $('#nameForm', v).addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api.updateMyName(e.target.name.value); S.profile.full_name = e.target.name.value.trim(); renderNav(''); toast('Đã lưu.'); }
    catch (err) { toast(errMsg(err), 'err'); }
  });
  $('#pwForm', v).addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api.updatePassword(e.target.pw.value); e.target.reset(); toast('Đã đổi mật khẩu.'); }
    catch (err) { toast(errMsg(err), 'err'); }
  });
}

// ---------- Trang học viên ----------
function lessonCard(l, done) {
  const href = '#/lesson/' + l.id;
  const overdue = l.due_at && !done && new Date(l.due_at) < new Date();
  return `<a class="card lesson-card ${done ? 'done' : ''}" href="${href}">
    <div class="badges">${badges(l)}</div>
    <h3>${esc(l.title)}</h3>
    ${l.summary ? `<p class="small">${esc(l.summary)}</p>` : ''}
    <div class="meta small">
      ${done ? '<span class="pill ok">✓ Đã nộp</span>' : '<span class="pill">Chưa nộp</span>'}
      ${l.due_at ? `<span class="pill ${overdue ? 'warn' : ''}">Hạn ${fmtDate(l.due_at, false)}</span>` : ''}
      ${l.publish_at ? `<span>Đăng ${fmtDate(l.publish_at, false)}</span>` : ''}
    </div></a>`;
}

const AVG = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : null);
const CRIT = [['fc', 'Fluency & Coherence'], ['lr', 'Lexical Resource'], ['gra', 'Grammatical Range & Accuracy'], ['pr', 'Pronunciation']];

async function studentHome() {
  if (!guardActive()) return;
  const [lessons, subs] = await Promise.all([api.listLessons(), api.listMySubmissions(S.session.user.id)]);
  const doneIds = new Set(subs.map((s) => s.lesson_id));
  const newThisMonth = lessons.filter((l) => isThisMonth(l.publish_at || l.created_at));
  const todo = lessons.filter((l) => !doneIds.has(l.id))
    .sort((a, b) => (a.due_at ? new Date(a.due_at) : Infinity) - (b.due_at ? new Date(b.due_at) : Infinity));
  const newFb = subs.filter((s) => s.feedback && !s.feedback.seen_at);
  const withFb = subs.filter((s) => s.feedback);
  const recent = withFb.slice(0, 5);
  const avgs = CRIT.map(([k, n]) => [n, AVG(recent.map((s) => s.feedback[k + '_band']).filter((x) => x != null))]);

  setView(`
    <h1>Xin chào, ${esc(S.profile.full_name || 'bạn')} 👋</h1>
    <div class="stats">
      <div class="stat"><b>${doneIds.size}/${lessons.length}</b><span>bài đã nộp</span></div>
      <div class="stat"><b>${subs.length}</b><span>lần nộp</span></div>
      <div class="stat"><b>${withFb.length}</b><span>phản hồi đã nhận</span></div>
    </div>
    ${newFb.length ? `<section class="card highlight"><h2>🔔 Phản hồi mới (${newFb.length})</h2>
      <ul class="plain">${newFb.map((s) => `<li><a href="#/submission/${s.id}">${esc(s.lessons?.title || '')} — ${esc(s.task_label || '')}</a> <span class="small muted">${fmtDate(s.feedback.released_at)}</span></li>`).join('')}</ul></section>` : ''}
    <section><h2>✨ Nội dung mới tháng này</h2>
      ${newThisMonth.length ? `<div class="cards">${newThisMonth.map((l) => lessonCard(l, doneIds.has(l.id))).join('')}</div>` : '<p class="muted">Tháng này chưa có nội dung mới. Giáo viên sẽ cập nhật sớm.</p>'}
    </section>
    <section><h2>📌 Bài cần hoàn thành</h2>
      ${todo.length ? `<div class="cards">${todo.slice(0, 6).map((l) => lessonCard(l, false)).join('')}</div>` : '<p class="muted">Bạn đã nộp tất cả bài hiện có. Tuyệt vời!</p>'}
    </section>
    <section class="card"><h2>📈 Tiến độ theo 4 tiêu chí</h2>
      ${withFb.length ? `<p class="small muted">Trung bình band giáo viên ghi trong tối đa 5 phản hồi gần nhất (band luyện tập, không phải điểm thi chính thức).</p>
      <div class="crit-bars">${avgs.map(([n, a]) => `<div class="crit-bar"><span>${n}</span><div class="bar"><i style="width:${a == null ? 0 : (a / 9) * 100}%"></i></div><b>${a == null ? '—' : a.toFixed(1)}</b></div>`).join('')}</div>`
      : '<p class="muted">Chưa có phản hồi. Hãy nộp bài ghi âm đầu tiên!</p>'}
      <a class="btn small" href="#/progress">Xem lịch sử bài nộp</a>
    </section>`);
}

function filterBar(lessons) {
  const topics = [...new Set(lessons.map((l) => l.topic).filter(Boolean))].sort();
  return `<div class="filters">
    <div class="chips" data-f="part"><button class="chip on" data-v="">Tất cả</button><button class="chip" data-v="1">Part 1</button><button class="chip" data-v="2">Part 2</button><button class="chip" data-v="3">Part 3</button></div>
    <select data-f="level"><option value="">Mọi trình độ</option><option value="B1">B1</option><option value="B2">B2</option><option value="B1-B2">B1–B2</option></select>
    <select data-f="topic"><option value="">Mọi chủ đề</option>${topics.map((t) => `<option>${esc(t)}</option>`).join('')}</select>
    <input type="search" data-f="q" placeholder="Tìm bài…">
  </div>`;
}

function wireFilters(v, lessons, doneIds, target) {
  const st = { part: '', level: '', topic: '', q: '' };
  const draw = () => {
    const list = lessons.filter((l) => (!st.part || String(l.part) === st.part) && (!st.level || l.level === st.level)
      && (!st.topic || l.topic === st.topic) && (!st.q || (l.title + ' ' + l.topic + ' ' + l.summary).toLowerCase().includes(st.q.toLowerCase())));
    $(target, v).innerHTML = list.length ? list.map((l) => lessonCard(l, doneIds.has(l.id))).join('') : '<p class="muted">Không có bài phù hợp.</p>';
  };
  $$('.chip', v).forEach((c) => c.addEventListener('click', () => { $$('.chip', v).forEach((x) => x.classList.remove('on')); c.classList.add('on'); st.part = c.dataset.v; draw(); }));
  $$('select[data-f], input[data-f]', v).forEach((i) => i.addEventListener('input', () => { st[i.dataset.f] = i.value; draw(); }));
  draw();
}

async function library() {
  if (!guardActive()) return;
  const [lessons, subs] = await Promise.all([api.listLessons({ kind: 'lesson' }), api.listMySubmissions(S.session.user.id)]);
  const doneIds = new Set(subs.map((s) => s.lesson_id));
  const v = setView(`<h1>Thư viện bài học</h1>${filterBar(lessons)}<div class="cards" id="list"></div>`);
  wireFilters(v, lessons, doneIds, '#list');
}

async function tests() {
  if (!guardActive()) return;
  const [lessons, subs] = await Promise.all([api.listLessons({ kind: 'mock_test' }), api.listMySubmissions(S.session.user.id)]);
  const doneIds = new Set(subs.map((s) => s.lesson_id));
  setView(`<h1>Đề luyện thi & thi thử</h1>
    <p class="muted">Làm như thi thật: mỗi phần có đồng hồ riêng. Ghi âm và nộp từng phần; giáo viên phản hồi cho từng phần.</p>
    <div class="cards">${lessons.length ? lessons.map((l) => lessonCard(l, doneIds.has(l.id))).join('') : '<p class="muted">Chưa có đề thi nào được mở.</p>'}</div>`);
}

export async function attachmentUrls(lesson) {
  const list = lesson.content?.attachments || [];
  return Promise.all(list.map((a) => api.signedUrl('lesson-media', a.path)));
}

async function lessonPage({ params }) {
  if (!guardActive()) return;
  const l = await api.getLesson(params.id);
  if (!l) return setView('<div class="card center"><h1>Bài học chưa mở</h1><p>Bài này không tồn tại hoặc chưa được giáo viên xuất bản.</p><a class="btn" href="#/library">Về thư viện</a></div>');
  const [urls, subs] = await Promise.all([attachmentUrls(l), api.listMySubmissions(S.session.user.id)]);
  const v = setView(`<a class="back" href="${l.kind === 'mock_test' ? '#/tests' : '#/library'}">← Quay lại</a><div id="lessonRoot"></div>`);
  const el = renderLesson(l, {
    mode: 'student', mediaUrls: urls, mySubs: subs.filter((s) => s.lesson_id === l.id),
    submit: ({ taskKey, taskLabel, result, selfAssessment, note }) => api.createSubmission({
      userId: S.session.user.id, lessonId: l.id, taskKey, taskLabel, blob: result.blob, mime: result.mime,
      duration: result.duration, selfAssessment, note,
    }),
  });
  $('#lessonRoot', v).appendChild(el);
}

function bandsLine(fb) {
  return CRIT.map(([k, n]) => (fb[k + '_band'] != null ? `<span class="pill">${n.split(' ')[0]} ${fb[k + '_band']}</span>` : '')).join('');
}

async function progress() {
  if (!guardActive()) return;
  const subs = await api.listMySubmissions(S.session.user.id);
  setView(`<h1>Bài nộp & phản hồi</h1>
    ${subs.length ? `<div class="list">${subs.map((s) => `
      <a class="card row-card" href="#/submission/${s.id}">
        <div><div class="small muted">${fmtDate(s.created_at)} · ${esc(s.lessons ? partLabel(s.lessons) : '')}</div>
        <b>${esc(s.lessons?.title || '(bài đã bị xoá)')}</b> <span class="muted">— ${esc(s.task_label || '')}</span>
        ${s.feedback ? `<div class="pills">${bandsLine(s.feedback)}</div>` : ''}</div>
        <div>${s.feedback ? `<span class="pill ok">${s.feedback.seen_at ? 'Đã có phản hồi' : '🔔 Phản hồi mới'}</span>` : '<span class="pill">Chờ phản hồi</span>'}</div>
      </a>`).join('')}</div>` : '<p class="muted">Bạn chưa nộp bài nào. Vào <a href="#/library">Thư viện bài học</a> để bắt đầu.</p>'}`);
}

export function feedbackHtml(fb) {
  if (!fb) return '';
  return `<section class="card feedback">
    <h2>Phản hồi của giáo viên</h2>
    <p class="small muted">Giáo viên nghe bài và chấm trực tiếp. Band (nếu có) là ước lượng cho bài luyện tập, không phải điểm thi chính thức.</p>
    <div class="crit-grid">${CRIT.map(([k, n]) => `
      <div class="crit"><div class="crit-head"><b>${n}</b>${fb[k + '_band'] != null ? `<span class="band">${fb[k + '_band']}</span>` : ''}</div>
      ${fb[k + '_comment'] ? `<div class="rich">${esc(fb[k + '_comment']).replace(/\n/g, '<br>')}</div>` : '<div class="muted small">—</div>'}</div>`).join('')}</div>
    ${fb.strengths ? `<h3>👍 Điểm mạnh</h3><div class="rich">${esc(fb.strengths).replace(/\n/g, '<br>')}</div>` : ''}
    ${fb.improvements ? `<h3>🎯 Cần cải thiện</h3><div class="rich">${esc(fb.improvements).replace(/\n/g, '<br>')}</div>` : ''}
    ${fb.next_task ? `<h3>🏋️ Nhiệm vụ luyện tập tiếp theo</h3><div class="rich next-task">${esc(fb.next_task).replace(/\n/g, '<br>')}</div>` : ''}
  </section>`;
}

async function submissionPage({ params }) {
  const s = await api.getSubmission(params.id);
  if (!s) return setView('<div class="card center"><h1>Không tìm thấy bài nộp</h1><a class="btn" href="#/progress">Quay lại</a></div>');
  const url = await api.signedUrl('recordings', s.audio_path);
  const self = Object.entries(s.self_assessment || {});
  setView(`<a class="back" href="#/progress">← Bài nộp của tôi</a>
    <h1>${esc(s.lessons?.title || '')}</h1>
    <section class="card">
      <p class="small muted">${esc(s.task_label || '')} · Nộp lúc ${fmtDate(s.created_at)}${s.duration_seconds ? ' · ' + s.duration_seconds + ' giây' : ''}</p>
      ${url ? `<audio controls src="${esc(url)}"></audio>` : '<p class="muted small">Tệp ghi âm đã được giáo viên lưu trữ/xoá để giải phóng dung lượng.</p>'}
      ${self.length ? `<h3>Tự đánh giá</h3><ul class="plain">${self.map(([k, ok]) => `<li>${ok ? '✅' : '⬜'} ${esc(k)}</li>`).join('')}</ul>` : ''}
      ${s.student_note ? `<h3>Ghi chú của bạn</h3><p>${esc(s.student_note)}</p>` : ''}
      ${s.lessons ? `<a class="btn small" href="#/lesson/${s.lessons.id}">Mở lại bài học</a>` : ''}
    </section>
    ${s.feedback ? feedbackHtml(s.feedback) : '<div class="card muted">Giáo viên chưa gửi phản hồi cho bài này.</div>'}`);
  if (s.feedback && !s.feedback.seen_at) api.markFeedbackSeen(s.feedback.id);
}

// ---------- Khởi động ----------
async function start() {
  if (!api.configured) {
    setView(`<div class="card narrow"><h1>Website chưa được cấu hình</h1>
      <p>Mở tệp <code>js/config.js</code> và dán <b>Project URL</b> và <b>anon key</b> của dự án Supabase (xem HUONG-DAN.md, Bước 2).</p></div>`);
    return;
  }
  api.onAuth((event, session) => {
    S.session = session;
    if (event === 'PASSWORD_RECOVERY') { S.recovery = true; setTimeout(() => go('/reset'), 0); }
    if (event === 'SIGNED_OUT') { S.profile = null; }
  });
  try {
    S.session = await api.getSession();
    await loadProfile();
  } catch (e) { console.error(e); }
  window.addEventListener('hashchange', router);
  if (S.recovery && S.session) history.replaceState(null, '', location.pathname + '#/reset');
  router();
}

start();
