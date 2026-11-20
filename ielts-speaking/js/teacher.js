// Trang dành cho giáo viên: tổng quan, mã tham gia, học viên, nội dung, bài nộp, phản hồi.
import * as api from './api.js';
import { S, setView, go, attachmentUrls, feedbackHtml } from './app.js';
import {
  $, $$, esc, rich, fmtDate, toast, errMsg, toLocalInput, fromLocalInput, batchOptions, currentBatches,
  lessonState, partLabel, uid,
} from './util.js';
import { badges, renderLesson } from './render.js';
import { buildEditor, LESSON_SCHEMA, MOCK_SCHEMA } from './editor.js';

const siteUrl = () => location.origin + location.pathname;
const stateBadge = (l) => { const s = lessonState(l); return `<span class="state ${s.key}">${s.label}</span>`; };

// ---------- Tổng quan ----------
export async function home() {
  const [lessons, subs, students] = await Promise.all([api.listLessons(), api.listAllSubmissions(), api.listStudents()]);
  const pending = subs.filter((s) => !s.feedback?.released);
  const count = (k) => lessons.filter((l) => lessonState(l).key === k).length;
  const batches = currentBatches();
  setView(`
    <h1>Tổng quan giáo viên</h1>
    <div class="stats">
      <a class="stat" href="#/t/submissions"><b>${pending.length}</b><span>bài chờ phản hồi</span></a>
      <a class="stat" href="#/t/students"><b>${students.filter((s) => s.active).length}</b><span>học viên đang học</span></a>
      <a class="stat" href="#/t/content"><b>${count('published')}</b><span>đã xuất bản</span></a>
      <a class="stat" href="#/t/content"><b>${count('scheduled')}</b><span>đã lên lịch</span></a>
      <a class="stat" href="#/t/content"><b>${count('draft')}</b><span>bản nháp</span></a>
    </div>
    <section class="card">
      <h2>🗓 Kế hoạch cập nhật tháng này</h2>
      <p class="small muted">Mỗi tháng có 2 đợt. Hệ thống <b>không tự đăng</b>: bài chỉ hiện với học viên khi cô bấm “Xuất bản” hoặc đặt lịch.</p>
      <div class="batches">${batches.map((b) => {
        const items = lessons.filter((l) => l.update_batch === b.label);
        return `<div class="batch ${b.active ? 'now' : ''}">
          <div class="batch-head"><b>${esc(b.label)}</b><span class="small muted">${b.range}${b.active ? ' · đợt hiện tại' : ''}</span></div>
          ${items.length ? `<ul class="plain">${items.map((l) => `<li>${stateBadge(l)} <a href="#/t/edit/${l.id}">${esc(l.title)}</a></li>`).join('')}</ul>` : '<p class="small muted">Chưa có nội dung cho đợt này.</p>'}
          <div class="row-btns"><a class="btn small" href="#/t/new/lesson?batch=${encodeURIComponent(b.label)}">＋ Bài học</a>
          <a class="btn small" href="#/t/new/mock_test?batch=${encodeURIComponent(b.label)}">＋ Đề thi</a></div>
        </div>`;
      }).join('')}</div>
    </section>
    <section class="card">
      <h2>🎧 Bài nộp mới nhất chờ phản hồi</h2>
      ${pending.length ? `<ul class="plain">${pending.slice(0, 8).map((s) => `<li><a href="#/t/review/${s.id}">${esc(s.profiles?.full_name || s.profiles?.email || '')} — ${esc(s.lessons?.title || '')} (${esc(s.task_label || '')})</a> <span class="small muted">${fmtDate(s.created_at)}</span></li>`).join('')}</ul>` : '<p class="muted">Không có bài nào đang chờ.</p>'}
    </section>`);
}

// ---------- Mã tham gia ----------
function codeStatus(c) {
  if (c.revoked) return ['revoked', 'Đã thu hồi'];
  if (c.expires_at && new Date(c.expires_at) <= new Date()) return ['expired', 'Hết hạn'];
  if (c.used_count >= c.max_uses) return ['full', 'Hết lượt'];
  return ['ok', 'Đang hoạt động'];
}

export async function codes({ query }) {
  const [list, uses, students] = await Promise.all([api.listCodes(), api.listCodeUses(), api.listStudents()]);
  const names = Object.fromEntries(students.map((s) => [s.id, s.full_name || s.email]));
  const d30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const v = setView(`
    <h1>Mã tham gia</h1>
    <form class="card" id="codeForm">
      <h2>Tạo mã mới</h2>
      <p class="small muted">Mã cho 1 học viên: đặt “Số lượt dùng” = 1. Mã cho cả đợt tuyển sinh: đặt bằng số học viên của đợt.</p>
      <div class="form-grid">
        <label class="field"><span>Ghi chú (tên học viên hoặc tên đợt)</span><input name="label" required maxlength="80" value="${esc(query.label || '')}" placeholder="VD: Nguyễn Văn A / Đợt 12-2026"></label>
        <label class="field"><span>Lớp / đợt (gắn vào học viên)</span><input name="cohort" maxlength="60" placeholder="VD: K12-2026"></label>
        <label class="field"><span>Hết hạn ngày</span><input name="exp" type="date" value="${d30}"></label>
        <label class="field"><span>Số lượt dùng</span><input name="max" type="number" min="1" max="500" value="1" required></label>
      </div>
      <button class="btn primary">Tạo mã</button>
    </form>
    <div id="newCode"></div>
    <section class="card"><h2>Danh sách mã</h2>
      ${list.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Mã</th><th>Ghi chú</th><th>Lớp/đợt</th><th>Đã dùng</th><th>Hết hạn</th><th>Trạng thái</th><th>Người dùng</th><th></th></tr></thead>
        <tbody>${list.map((c) => {
          const [k, t] = codeStatus(c);
          const who = uses.filter((u) => u.code_id === c.id).map((u) => names[u.user_id] || '—');
          return `<tr><td><code>••••-•${esc(c.code_hint || '')}</code></td><td>${esc(c.label)}</td><td>${esc(c.cohort || '')}</td>
            <td>${c.used_count}/${c.max_uses}</td><td>${c.expires_at ? fmtDate(c.expires_at, false) : 'Không'}</td>
            <td><span class="state ${k}">${t}</span></td><td class="small">${who.map(esc).join(', ')}</td>
            <td>${c.revoked ? `<button class="btn small" data-restore="${c.id}">Mở lại</button>` : `<button class="btn small danger" data-revoke="${c.id}">Thu hồi</button>`}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muted">Chưa có mã nào.</p>'}
      <p class="small muted">Vì lý do bảo mật, hệ thống chỉ lưu bản mã hoá của mã; cô chỉ thấy mã đầy đủ ngay khi vừa tạo. Thu hồi mã không xoá tài khoản đã tạo — muốn chặn học viên, vào trang Học viên và bấm “Khoá”.</p>
    </section>`);
  $('#codeForm', v).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const exp = f.exp.value ? new Date(f.exp.value + 'T23:59:59').toISOString() : null;
    try {
      const code = await api.createCode({ label: f.label.value.trim(), cohort: f.cohort.value.trim(), expiresAt: exp, maxUses: +f.max.value });
      const link = `${siteUrl()}#/?code=${encodeURIComponent(code)}`;
      $('#newCode', v).innerHTML = `<div class="card highlight new-code">
        <p>Mã mới cho <b>${esc(f.label.value)}</b> — <b>hãy sao chép ngay</b>, mã sẽ không hiện lại:</p>
        <div class="big-code" id="theCode">${esc(code)}</div>
        <div class="row-btns"><button class="btn" id="cpCode">Sao chép mã</button><button class="btn" id="cpLink">Sao chép liên kết mời</button></div>
        <p class="small muted">Liên kết mời: ${esc(link)}</p>
        <a class="btn small ghost" href="#/t/codes">Xong — làm mới danh sách</a></div>`;
      const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast('Đã sao chép'), () => toast('Hãy bôi đen và sao chép thủ công', 'err'));
      $('#cpCode', v).onclick = () => copy(code);
      $('#cpLink', v).onclick = () => copy(link);
      f.reset(); f.exp.value = d30;
      $('#newCode', v).scrollIntoView({ behavior: 'smooth' });
    } catch (err) { toast(errMsg(err), 'err'); }
  });
  v.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-revoke],[data-restore]'); if (!b) return;
    const revoke = !!b.dataset.revoke;
    if (revoke && !confirm('Thu hồi mã này? Người chưa đăng ký sẽ không dùng được nữa.')) return;
    try { await api.setCodeRevoked(b.dataset.revoke || b.dataset.restore, revoke); toast(revoke ? 'Đã thu hồi mã' : 'Đã mở lại mã'); codes({ query: {} }); }
    catch (err) { toast(errMsg(err), 'err'); }
  });
}

// ---------- Học viên ----------
export async function students() {
  const [list, subs] = await Promise.all([api.listStudents(), api.listAllSubmissions()]);
  const v = setView(`
    <h1>Học viên</h1>
    <div class="card info">
      <b>Thêm học viên:</b> tạo một mã tham gia (số lượt = 1) rồi gửi mã hoặc liên kết mời cho học viên. Học viên tự tạo tài khoản bằng email của mình.
      <a class="btn small primary" href="#/t/codes">Tạo mã tham gia</a>
    </div>
    ${list.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Họ tên</th><th>Email</th><th>Lớp/đợt</th><th>Tham gia</th><th>Bài nộp</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>${list.map((s) => {
        const mine = subs.filter((x) => x.student_id === s.id);
        const waiting = mine.filter((x) => !x.feedback?.released).length;
        return `<tr><td>${esc(s.full_name)}</td><td class="small">${esc(s.email)}</td><td>${esc(s.cohort || '')}</td>
        <td class="small">${fmtDate(s.created_at, false)}</td>
        <td>${mine.length}${waiting ? ` <a class="small" href="#/t/submissions?student=${s.id}">(${waiting} chờ)</a>` : ''}</td>
        <td>${s.active ? '<span class="state ok">Đang học</span>' : '<span class="state revoked">Đã khoá</span>'}</td>
        <td class="row-btns">
          <button class="btn small" data-cohort="${s.id}">Lớp/đợt</button>
          <button class="btn small" data-pw="${s.id}">Đặt lại mật khẩu</button>
          ${s.active ? `<button class="btn small danger" data-lock="${s.id}">Khoá</button>` : `<button class="btn small" data-unlock="${s.id}">Mở khoá</button>`}
        </td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="muted">Chưa có học viên nào đăng ký.</p>'}`);
  v.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const s = list.find((x) => x.id === (b.dataset.cohort || b.dataset.pw || b.dataset.lock || b.dataset.unlock));
    if (!s) return;
    try {
      if (b.dataset.cohort) {
        const c = prompt(`Lớp/đợt của ${s.full_name}:`, s.cohort || ''); if (c === null) return;
        await api.updateStudent(s.id, { cohort: c.trim() || null });
      } else if (b.dataset.pw) {
        const p = prompt(`Mật khẩu mới cho ${s.full_name} (ít nhất 8 ký tự). Gửi mật khẩu này cho học viên và nhắc họ đổi lại trong mục Tài khoản:`);
        if (!p) return;
        await api.setStudentPassword(s.id, p);
        toast('Đã đặt lại mật khẩu'); return;
      } else if (b.dataset.lock) {
        if (!confirm(`Khoá tài khoản ${s.full_name}? Học viên sẽ không xem được bài học và không nộp bài được.`)) return;
        await api.updateStudent(s.id, { active: false });
      } else if (b.dataset.unlock) {
        await api.updateStudent(s.id, { active: true });
      }
      toast('Đã cập nhật'); students();
    } catch (err) { toast(errMsg(err), 'err'); }
  });
}

// ---------- Danh sách nội dung ----------
export async function content() {
  const lessons = await api.listLessons();
  const batches = [...new Set(lessons.map((l) => l.update_batch).filter(Boolean))].sort().reverse();
  const v = setView(`
    <div class="page-head"><h1>Bài học & đề thi</h1>
      <div class="row-btns"><a class="btn primary" href="#/t/new/lesson">＋ Bài học mới</a><a class="btn" href="#/t/new/mock_test">＋ Đề thi mới</a></div></div>
    <div class="filters">
      <select data-f="kind"><option value="">Bài học + đề thi</option><option value="lesson">Bài học</option><option value="mock_test">Đề thi</option></select>
      <select data-f="state"><option value="">Mọi trạng thái</option><option value="draft">Nháp</option><option value="scheduled">Đã lên lịch</option><option value="published">Đã xuất bản</option><option value="unpublished">Đã gỡ</option></select>
      <select data-f="batch"><option value="">Mọi đợt cập nhật</option>${batches.map((b) => `<option>${esc(b)}</option>`).join('')}</select>
      <input type="search" data-f="q" placeholder="Tìm theo tên, chủ đề…">
    </div>
    <div class="list" id="clist"></div>`);
  const st = { kind: '', state: '', batch: '', q: '' };
  const draw = () => {
    const list = lessons.filter((l) => (!st.kind || l.kind === st.kind) && (!st.state || lessonState(l).key === st.state)
      && (!st.batch || l.update_batch === st.batch) && (!st.q || (l.title + ' ' + l.topic).toLowerCase().includes(st.q.toLowerCase())));
    $('#clist', v).innerHTML = list.length ? list.map((l) => `
      <div class="card row-card">
        <div><div class="badges">${stateBadge(l)} ${badges(l)}</div>
          <b>${esc(l.title)}</b>
          <div class="small muted">${l.update_batch ? esc(l.update_batch) + ' · ' : ''}${l.publish_at ? (lessonState(l).key === 'scheduled' ? 'Sẽ đăng ' : 'Đăng ') + fmtDate(l.publish_at) + ' · ' : ''}Sửa lần cuối ${fmtDate(l.updated_at)}</div></div>
        <div class="row-btns">
          <a class="btn small primary" href="#/t/edit/${l.id}">Sửa</a>
          <a class="btn small" href="#/t/preview/${l.id}">Xem trước</a>
          <a class="btn small" href="#/t/history/${l.id}">Lịch sử</a>
          <button class="btn small" data-dup="${l.id}">Nhân bản</button>
        </div></div>`).join('') : '<p class="muted">Không có nội dung phù hợp.</p>';
  };
  $$('[data-f]', v).forEach((i) => i.addEventListener('input', () => { st[i.dataset.f] = i.value; draw(); }));
  v.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dup]'); if (!b) return;
    try {
      const l = await api.getLesson(b.dataset.dup);
      const copy = await api.saveLesson({
        kind: l.kind, title: l.title + ' (bản sao)', summary: l.summary, part: l.part, level: l.level, topic: l.topic,
        update_batch: null, status: 'draft', publish_at: null, due_at: null, content: { ...l.content, attachments: [] },
      });
      toast('Đã tạo bản sao (nháp). Tài liệu đính kèm không được sao chép.');
      go('/t/edit/' + copy.id);
    } catch (err) { toast(errMsg(err), 'err'); }
  });
  draw();
}

// ---------- Soạn bài ----------
export async function edit({ params, query }) {
  let l;
  if (params.id) {
    l = await api.getLesson(params.id);
    if (!l) return setView('<div class="card">Không tìm thấy bài.</div>');
  } else {
    const kind = params.kind === 'mock_test' ? 'mock_test' : 'lesson';
    l = { kind, title: '', summary: '', part: kind === 'lesson' ? 1 : null, level: 'B1-B2', topic: '', update_batch: query.batch || '', status: 'draft', publish_at: null, due_at: null,
      content: kind === 'lesson' ? { task: { prompt: '', cue: '', prep: 0, speak: 120 } } : { sections: [
        { part: 1, title: 'Part 1 – Introduction and interview', instructions: '', questions: '', cue: '', prep: 0, speak: 300 },
        { part: 2, title: 'Part 2 – Individual long turn', instructions: '', questions: '', cue: '', prep: 60, speak: 120 },
        { part: 3, title: 'Part 3 – Two-way discussion', instructions: '', questions: '', cue: '', prep: 0, speak: 300 }] } };
  }
  const all = await api.listLessons();
  const topics = [...new Set(all.map((x) => x.topic).filter(Boolean))].sort();
  const batchList = [...new Set([...batchOptions(), ...all.map((x) => x.update_batch).filter(Boolean), l.update_batch].filter(Boolean))].sort();
  const isMock = l.kind === 'mock_test';
  const st = lessonState(l);

  const v = setView(`
    <a class="back" href="#/t/content">← Danh sách nội dung</a>
    <div class="page-head"><h1>${l.id ? 'Sửa' : 'Tạo'} ${isMock ? 'đề thi' : 'bài học'}</h1><span class="state ${st.key}" id="stBadge">${st.label}</span></div>
    <form class="card" id="metaForm" autocomplete="off">
      <div class="form-grid">
        <label class="field wide"><span>Tiêu đề *</span><input name="title" required maxlength="160" value="${esc(l.title)}"></label>
        <label class="field wide"><span>Mô tả ngắn</span><input name="summary" maxlength="300" value="${esc(l.summary)}"></label>
        <label class="field"><span>Part</span><select name="part">
          ${isMock ? `<option value="" ${!l.part ? 'selected' : ''}>Đủ 3 phần</option>` : ''}
          ${[1, 2, 3].map((p) => `<option value="${p}" ${l.part === p ? 'selected' : ''}>Part ${p}</option>`).join('')}</select></label>
        <label class="field"><span>Trình độ</span><select name="level">${['B1', 'B2', 'B1-B2'].map((x) => `<option value="${x}" ${l.level === x ? 'selected' : ''}>${x.replace('-', '–')}</option>`).join('')}</select></label>
        <label class="field"><span>Chủ đề</span><input name="topic" list="topicList" maxlength="80" value="${esc(l.topic)}"><datalist id="topicList">${topics.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></label>
        <label class="field"><span>Đợt cập nhật</span><select name="batch"><option value="">(Không gắn đợt)</option>${batchList.map((b) => `<option ${b === l.update_batch ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
        <label class="field"><span>Hạn nộp (không bắt buộc)</span><input name="due" type="datetime-local" value="${toLocalInput(l.due_at)}"></label>
      </div>
    </form>
    <h2>Nội dung</h2>
    <p class="small muted">Gõ hướng dẫn bằng tiếng Việt, câu hỏi và câu trả lời mẫu bằng tiếng Anh. Mẹo định dạng: dòng bắt đầu “- ” thành gạch đầu dòng; **chữ** in đậm; để trống một dòng để sang đoạn mới.</p>
    <div id="editorHost"></div>
    <section class="card" id="attBox"><h2>Tài liệu đính kèm (âm thanh, hình ảnh, PDF…)</h2><div id="attList"></div>
      <label class="field"><span>Thêm tệp (tối đa 50 MB)</span><input type="file" id="attFile" multiple></label>
      ${l.id ? '' : '<p class="small muted">Bài sẽ được tự động lưu nháp trước khi tải tệp lên.</p>'}</section>
    <section class="card publish-box">
      <h2>Lưu & xuất bản</h2>
      <p class="small" id="pubInfo"></p>
      <div class="row-btns">
        <button class="btn" data-act="save">💾 Lưu</button>
        <button class="btn" data-act="preview">👁 Lưu & xem trước</button>
        <button class="btn primary" data-act="publish">🚀 Xuất bản ngay</button>
      </div>
      <div class="schedule">
        <label class="field"><span>Hoặc lên lịch xuất bản lúc</span><input type="datetime-local" id="schedAt" value="${st.key === 'scheduled' ? toLocalInput(l.publish_at) : ''}"></label>
        <button class="btn" data-act="schedule">🗓 Lên lịch</button>
      </div>
      <div class="row-btns danger-zone">
        <button class="btn" data-act="unpublish" ${['published', 'scheduled'].includes(st.key) ? '' : 'hidden'}>⏸ Gỡ bài (ẩn với học viên)</button>
        ${l.id ? '<button class="btn danger" data-act="delete">🗑 Xoá vĩnh viễn</button>' : ''}
      </div>
    </section>`);

  const editor = buildEditor(isMock ? MOCK_SCHEMA : LESSON_SCHEMA, l.content);
  $('#editorHost', v).appendChild(editor.el);
  let attachments = [...(l.content?.attachments || [])];

  const setInfo = () => {
    const s = lessonState(l);
    $('#stBadge', v).className = `state ${s.key}`; $('#stBadge', v).textContent = s.label;
    $('#pubInfo', v).innerHTML = {
      draft: 'Bài đang là <b>nháp</b>: học viên chưa thấy.',
      scheduled: `Bài sẽ tự hiện với học viên lúc <b>${fmtDate(l.publish_at)}</b>.`,
      published: 'Bài <b>đang hiển thị</b> với học viên. Bấm “Lưu” sẽ cập nhật ngay nội dung học viên đang xem.',
      unpublished: 'Bài <b>đã gỡ</b>: học viên không thấy. Bài nộp cũ vẫn được giữ.',
    }[s.key];
    $('[data-act="unpublish"]', v).hidden = !['published', 'scheduled'].includes(s.key);
  };
  setInfo();

  const drawAtt = async () => {
    const urls = await Promise.all(attachments.map((a) => api.signedUrl('lesson-media', a.path)));
    $('#attList', v).innerHTML = attachments.length ? `<ul class="plain">${attachments.map((a, i) => `
      <li>${urls[i] ? `<a href="${esc(urls[i])}" target="_blank" rel="noopener">${esc(a.name)}</a>` : esc(a.name)} <span class="small muted">${esc(a.mime || '')}</span>
      <button type="button" class="icon danger" data-rm="${i}" title="Gỡ tệp">✕</button></li>`).join('')}</ul>` : '<p class="small muted">Chưa có tệp.</p>';
  };
  drawAtt();

  const markDirty = () => { S.dirty = true; };
  v.addEventListener('input', (e) => { if (!e.target.closest('#attBox') && e.target.id !== 'schedAt') markDirty(); });

  function collect() {
    const f = $('#metaForm', v);
    return {
      id: l.id, kind: l.kind, title: f.title.value.trim(), summary: f.summary.value.trim(),
      part: f.part.value ? +f.part.value : null, level: f.level.value, topic: f.topic.value.trim(),
      update_batch: f.batch.value || null, due_at: fromLocalInput(f.due.value),
      content: { ...editor.getValue(), attachments },
    };
  }

  async function save(extra = {}) {
    const data = { ...collect(), ...extra };
    if (!data.title) { toast('Hãy nhập tiêu đề.', 'err'); $('#metaForm', v).title.focus(); throw new Error('no title'); }
    const saved = await api.saveLesson(data);
    const wasNew = !l.id;
    l = saved; S.dirty = false;
    setInfo();
    if (wasNew) history.replaceState(null, '', '#/t/edit/' + saved.id);
    return saved;
  }

  function warnings() {
    const c = editor.getValue(), w = [];
    if (isMock) { if (!(c.sections || []).length) w.push('chưa có phần thi nào'); }
    else {
      if (!(c.questions || []).length) w.push('chưa có câu hỏi luyện tập');
      if (!c.task?.cue && !c.task?.prompt) w.push('chưa có nhiệm vụ ghi âm');
    }
    return w;
  }

  v.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      const a = attachments[+rm.dataset.rm];
      if (!confirm(`Gỡ tệp “${a.name}”?`)) return;
      try { await api.removeMedia(a.path); } catch { /* tệp có thể đã bị xoá */ }
      attachments.splice(+rm.dataset.rm, 1);
      try { await save(); toast('Đã gỡ tệp'); } catch (err) { if (err.message !== 'no title') toast(errMsg(err), 'err'); }
      return drawAtt();
    }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    b.disabled = true;
    try {
      if (act === 'save') { await save(); toast('Đã lưu'); }
      else if (act === 'preview') { const s = await save(); go('/t/preview/' + s.id); }
      else if (act === 'publish') {
        const w = warnings();
        if (w.length && !confirm(`Lưu ý: ${w.join(', ')}. Vẫn xuất bản?`)) return;
        await save({ status: 'published', publish_at: new Date().toISOString() });
        toast('Đã xuất bản — học viên đã thấy bài này');
      } else if (act === 'schedule') {
        const at = fromLocalInput($('#schedAt', v).value);
        if (!at || new Date(at) <= new Date()) return toast('Chọn một thời điểm trong tương lai.', 'err');
        await save({ status: 'published', publish_at: at });
        toast('Đã lên lịch xuất bản ' + fmtDate(at));
      } else if (act === 'unpublish') {
        if (!confirm('Gỡ bài? Học viên sẽ không thấy bài này nữa (bài nộp cũ vẫn giữ).')) return;
        await save({ status: 'unpublished' });
        toast('Đã gỡ bài');
      } else if (act === 'delete') {
        if (!confirm('XOÁ VĨNH VIỄN bài này cùng mọi bài nộp và phản hồi liên quan? Không thể hoàn tác. (Muốn ẩn tạm thời, hãy dùng “Gỡ bài”.)')) return;
        for (const a of attachments) { try { await api.removeMedia(a.path); } catch { /* bỏ qua */ } }
        await api.deleteLesson(l.id); S.dirty = false;
        toast('Đã xoá'); go('/t/content');
      }
    } catch (err) { if (err.message !== 'no title') toast(errMsg(err), 'err'); }
    finally { b.disabled = false; }
  });

  $('#attFile', v).addEventListener('change', async (e) => {
    const files = [...e.target.files]; if (!files.length) return;
    try {
      if (!l.id) await save();
      for (const file of files) {
        if (file.size > 50 * 1024 * 1024) { toast(`${file.name}: quá 50 MB`, 'err'); continue; }
        const path = await api.uploadMedia(l.id, file);
        attachments.push({ id: uid(), name: file.name, path, mime: file.type });
      }
      await save(); toast('Đã tải tệp lên'); drawAtt();
    } catch (err) { if (err.message !== 'no title') toast(errMsg(err), 'err'); }
    e.target.value = '';
  });
}

// ---------- Xem trước ----------
export async function preview({ params }) {
  const l = await api.getLesson(params.id);
  if (!l) return setView('<div class="card">Không tìm thấy bài.</div>');
  const urls = await attachmentUrls(l);
  const st = lessonState(l);
  const v = setView(`<div class="preview-bar card"><span>Trạng thái: <span class="state ${st.key}">${st.label}</span></span>
    <span class="row-btns"><a class="btn small" href="#/t/edit/${l.id}">✏️ Quay lại sửa</a><a class="btn small" href="#/t/content">Danh sách</a></span></div><div id="pv"></div>`);
  $('#pv', v).appendChild(renderLesson(l, { mode: 'preview', mediaUrls: urls, mySubs: [], submit: async () => { throw new Error('preview'); } }));
}

// ---------- Lịch sử cập nhật ----------
export async function revisions({ params }) {
  const [l, revs] = await Promise.all([api.getLesson(params.id), api.listRevisions(params.id)]);
  if (!l) return setView('<div class="card">Không tìm thấy bài.</div>');
  const v = setView(`<a class="back" href="#/t/content">← Danh sách nội dung</a>
    <h1>Lịch sử cập nhật</h1><p><b>${esc(l.title)}</b> ${stateBadge(l)}</p>
    <div class="list">${revs.map((r) => `
      <div class="card row-card"><div><b>${esc(r.action)}</b> <span class="small muted">${fmtDate(r.edited_at)}</span>
        <div class="small">Tiêu đề: ${esc(r.title)} · Trạng thái: ${esc(r.status)}${r.publish_at ? ' · Lịch: ' + fmtDate(r.publish_at) : ''}</div></div>
        <button class="btn small" data-restore="${r.id}">Khôi phục nội dung này</button></div>`).join('')}</div>
    <p class="small muted">“Khôi phục” chép lại tiêu đề và nội dung của phiên bản đó, giữ nguyên trạng thái xuất bản hiện tại.</p>`);
  v.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-restore]'); if (!b) return;
    const r = revs.find((x) => String(x.id) === b.dataset.restore);
    if (!confirm(`Khôi phục phiên bản lúc ${fmtDate(r.edited_at)}?`)) return;
    const s = r.snapshot;
    try {
      await api.saveLesson({ id: l.id, title: s.title, summary: s.summary, part: s.part, level: s.level, topic: s.topic, update_batch: s.update_batch, due_at: s.due_at, content: s.content });
      toast('Đã khôi phục'); go('/t/edit/' + l.id);
    } catch (err) { toast(errMsg(err), 'err'); }
  });
}

// ---------- Bài nộp ----------
export async function submissions({ query }) {
  const subs = await api.listAllSubmissions();
  const studentsMap = {}; subs.forEach((s) => { studentsMap[s.student_id] = s.profiles?.full_name || s.profiles?.email; });
  const v = setView(`<h1>Bài nộp</h1>
    <div class="filters">
      <select data-f="status"><option value="pending">Chờ phản hồi</option><option value="draft">Phản hồi đang soạn</option><option value="done">Đã gửi phản hồi</option><option value="">Tất cả</option></select>
      <select data-f="student"><option value="">Mọi học viên</option>${Object.entries(studentsMap).map(([id, n]) => `<option value="${id}" ${query.student === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    </div><div class="list" id="slist"></div>`);
  const st = { status: 'pending', student: query.student || '' };
  const draw = () => {
    const list = subs.filter((s) => {
      const fb = s.feedback;
      const k = fb?.released ? 'done' : fb ? 'draft' : 'pending';
      return (!st.status || (st.status === 'pending' ? k !== 'done' : k === st.status)) && (!st.student || s.student_id === st.student);
    });
    $('#slist', v).innerHTML = list.length ? list.map((s) => `
      <a class="card row-card" href="#/t/review/${s.id}">
        <div><b>${esc(s.profiles?.full_name || s.profiles?.email || '')}</b> <span class="small muted">${esc(s.profiles?.cohort || '')}</span>
          <div>${esc(s.lessons?.title || '(bài đã xoá)')} — <span class="muted">${esc(s.task_label || '')}</span></div>
          <div class="small muted">${fmtDate(s.created_at)}${s.duration_seconds ? ' · ' + s.duration_seconds + 's' : ''}${s.student_note ? ' · có ghi chú' : ''}</div></div>
        <span class="pill ${s.feedback?.released ? 'ok' : s.feedback ? 'warn' : ''}">${s.feedback?.released ? 'Đã phản hồi' : s.feedback ? 'Đang soạn' : 'Chờ phản hồi'}</span>
      </a>`).join('') : '<p class="muted">Không có bài nộp phù hợp.</p>';
  };
  $$('[data-f]', v).forEach((i) => i.addEventListener('input', () => { st[i.dataset.f] = i.value; draw(); }));
  draw();
}

const CRITERIA = [
  ['fc', 'Fluency and Coherence', 'Độ trôi chảy, ngập ngừng/tự sửa, liên kết ý, phát triển câu trả lời đủ dài.'],
  ['lr', 'Lexical Resource', 'Độ rộng và độ chính xác của từ vựng, collocation, khả năng diễn đạt lại (paraphrase).'],
  ['gra', 'Grammatical Range and Accuracy', 'Đa dạng cấu trúc (câu phức, mệnh đề), độ chính xác, mức độ lỗi ảnh hưởng tới ý.'],
  ['pr', 'Pronunciation', 'Phát âm âm vị, âm cuối, trọng âm từ/câu, ngữ điệu, nối âm, mức độ dễ hiểu.'],
];

export async function review({ params }) {
  const s = await api.getSubmission(params.id);
  if (!s) return setView('<div class="card">Không tìm thấy bài nộp.</div>');
  const [url, lesson, all] = await Promise.all([api.signedUrl('recordings', s.audio_path), api.getLesson(s.lesson_id), api.listAllSubmissions()]);
  const fb = s.feedback || {};
  let taskHtml = '';
  if (lesson) {
    const c = lesson.content || {};
    if (lesson.kind === 'mock_test') {
      const sec = (c.sections || []).find((x) => (x.key || `part${x.part}`) === s.task_key);
      if (sec) taskHtml = `${sec.questions ? `<ol class="questions">${sec.questions.split('\n').filter((q) => q.trim()).map((q) => `<li>${esc(q)}</li>`).join('')}</ol>` : ''}${sec.cue ? `<div class="cue-card">${rich(sec.cue)}</div>` : ''}`;
    } else if (c.task) taskHtml = `${c.task.cue ? `<div class="cue-card">${rich(c.task.cue)}</div>` : rich(c.task.prompt)}`;
  }
  const pendingOthers = all.filter((x) => x.id !== s.id && !x.feedback?.released);
  const self = Object.entries(s.self_assessment || {});
  const prevOfStudent = all.filter((x) => x.student_id === s.student_id && x.id !== s.id && x.feedback?.released).slice(0, 3);

  const v = setView(`<a class="back" href="#/t/submissions">← Danh sách bài nộp</a>
    <h1>${esc(s.profiles?.full_name || s.profiles?.email || '')}</h1>
    <section class="card">
      <p><b>${esc(s.lessons?.title || '')}</b> — ${esc(s.task_label || '')}</p>
      <p class="small muted">Nộp lúc ${fmtDate(s.created_at)}${s.duration_seconds ? ' · ' + s.duration_seconds + ' giây' : ''} · ${esc(s.profiles?.email || '')}</p>
      ${url ? `<audio controls src="${esc(url)}"></audio>` : '<p class="muted">Tệp ghi âm đã bị xoá.</p>'}
      ${taskHtml ? `<details><summary>Xem đề / câu hỏi</summary>${taskHtml}</details>` : ''}
      ${self.length ? `<details><summary>Học viên tự đánh giá</summary><ul class="plain">${self.map(([k, ok]) => `<li>${ok ? '✅' : '⬜'} ${esc(k)}</li>`).join('')}</ul></details>` : ''}
      ${s.student_note ? `<div class="notice">💬 Ghi chú của học viên: ${esc(s.student_note)}</div>` : ''}
      ${prevOfStudent.length ? `<details><summary>Phản hồi gần đây cho học viên này</summary><ul class="plain">${prevOfStudent.map((p) => `<li><a href="#/t/review/${p.id}">${esc(p.lessons?.title || '')} (${fmtDate(p.created_at, false)})</a> — cần cải thiện: ${esc((p.feedback.improvements || '').slice(0, 140))}</li>`).join('')}</ul></details>` : ''}
    </section>
    <form class="card" id="fbForm">
      <h2>Phản hồi theo 4 tiêu chí ${fb.released ? '<span class="state ok">Đã gửi cho học viên</span>' : fb.id ? '<span class="state draft">Bản nháp</span>' : ''}</h2>
      <p class="small muted">Band không bắt buộc. Nếu ghi band, đó là ước lượng cho bài luyện tập.</p>
      <div class="crit-grid">${CRITERIA.map(([k, n, hint]) => `
        <div class="crit"><div class="crit-head"><b>${n}</b>
          <select name="${k}_band" aria-label="Band ${n}"><option value="">Band —</option>${[9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((b) => `<option value="${b}" ${fb[k + '_band'] === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
          <small class="help">${hint}</small>
          <textarea name="${k}_comment" rows="3">${esc(fb[k + '_comment'] || '')}</textarea></div>`).join('')}</div>
      <label class="field"><span>👍 Điểm mạnh</span><textarea name="strengths" rows="3">${esc(fb.strengths || '')}</textarea></label>
      <label class="field"><span>🎯 Các điểm cần cải thiện</span><textarea name="improvements" rows="3">${esc(fb.improvements || '')}</textarea></label>
      <label class="field"><span>🏋️ Nhiệm vụ luyện tập tiếp theo</span><textarea name="next_task" rows="3">${esc(fb.next_task || '')}</textarea></label>
      <div class="row-btns">
        <button type="button" class="btn" data-act="draft">💾 Lưu nháp</button>
        <button type="button" class="btn primary" data-act="send">${fb.released ? '📨 Cập nhật phản hồi' : '📨 Gửi phản hồi cho học viên'}</button>
      </div>
    </form>
    <section class="card">
      <div class="row-btns">
        ${pendingOthers.length ? `<a class="btn" href="#/t/review/${pendingOthers[0].id}">Bài chờ tiếp theo →</a>` : ''}
        ${s.audio_path && fb.released ? '<button class="btn danger small" id="delAudio">Xoá tệp ghi âm (giải phóng dung lượng)</button>' : ''}
      </div>
    </section>`);

  const form = $('#fbForm', v);
  const fields = () => {
    const o = {};
    CRITERIA.forEach(([k]) => { o[k + '_band'] = form[k + '_band'].value === '' ? null : +form[k + '_band'].value; o[k + '_comment'] = form[k + '_comment'].value.trim(); });
    ['strengths', 'improvements', 'next_task'].forEach((k) => { o[k] = form[k].value.trim(); });
    return o;
  };
  form.addEventListener('input', () => { S.dirty = true; });
  form.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const send = b.dataset.act === 'send';
    const f = fields();
    if (send && !f.strengths && !f.improvements && !f.next_task) return toast('Hãy viết ít nhất điểm mạnh, điểm cần cải thiện hoặc nhiệm vụ tiếp theo.', 'err');
    b.disabled = true;
    try {
      await api.saveFeedback(s.id, S.session.user.id, f, send);
      S.dirty = false;
      toast(send ? 'Đã gửi phản hồi — học viên sẽ thấy ngay' : 'Đã lưu nháp');
      review({ params });
    } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
  });
  $('#delAudio', v)?.addEventListener('click', async () => {
    if (!confirm('Xoá tệp ghi âm này? Phản hồi vẫn được giữ.')) return;
    try { await api.deleteSubmissionAudio(s); toast('Đã xoá tệp ghi âm'); review({ params }); } catch (err) { toast(errMsg(err), 'err'); }
  });
}

