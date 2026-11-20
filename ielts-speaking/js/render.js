// Hiển thị bài học / đề thi cho học viên (và cho giáo viên ở chế độ xem trước)
import { esc, rich, fmtDate, fmtSecs, partLabel, toast, errMsg } from './util.js';
import { createRecorder } from './recorder.js';

const LEVEL = { 'B1': 'B1', 'B2': 'B2', 'B1-B2': 'B1–B2' };

export function badges(l) {
  return `<span class="badge part">${esc(partLabel(l))}</span>
    <span class="badge">${esc(LEVEL[l.level] || l.level)}</span>
    ${l.topic ? `<span class="badge topic">${esc(l.topic)}</span>` : ''}`;
}

function section(n, title, inner, id) {
  return `<section class="card lesson-sec" ${id ? `id="${id}"` : ''}><h2><span class="num">${n}</span>${esc(title)}</h2>${inner}</section>`;
}

function attachmentsHtml(list, urls) {
  if (!list?.length) return '';
  return `<div class="attachments">${list.map((a, i) => {
    const u = urls[i];
    if (!u) return `<div class="att muted">${esc(a.name)} (không tải được)</div>`;
    if ((a.mime || '').startsWith('audio/')) return `<div class="att"><div class="small">${esc(a.name)}</div><audio controls preload="none" src="${esc(u)}"></audio></div>`;
    if ((a.mime || '').startsWith('image/')) return `<div class="att"><img src="${esc(u)}" alt="${esc(a.name)}" loading="lazy"></div>`;
    return `<div class="att"><a class="btn small" href="${esc(u)}" target="_blank" rel="noopener">📄 ${esc(a.name)}</a></div>`;
  }).join('')}</div>`;
}

/**
 * ctx = {
 *   mode: 'student' | 'preview',
 *   mediaUrls: [signed url per attachment],
 *   mySubs: [submission rows for this lesson],
 *   submit: async ({taskKey, taskLabel, result, selfAssessment, note}) => void
 * }
 */
export function renderLesson(l, ctx) {
  const c = l.content || {};
  const root = document.createElement('div');
  root.className = 'lesson';
  const preview = ctx.mode === 'preview';

  let html = `
    <header class="lesson-head">
      ${preview ? '<div class="preview-flag">CHẾ ĐỘ XEM TRƯỚC — học viên chưa thấy nếu bài chưa xuất bản</div>' : ''}
      <div class="badges">${badges(l)}</div>
      <h1>${esc(l.title)}</h1>
      ${l.summary ? `<p class="lead">${esc(l.summary)}</p>` : ''}
      ${l.due_at ? `<p class="due">⏰ Hạn nộp: <b>${fmtDate(l.due_at)}</b></p>` : ''}
    </header>`;

  let n = 0;
  if (l.kind === 'mock_test') {
    if (c.intro) html += section(++n, 'Hướng dẫn làm bài', `<div class="rich">${rich(c.intro)}</div>`);
    if (c.attachments?.length) html += section(++n, 'Tài liệu kèm theo', attachmentsHtml(c.attachments, ctx.mediaUrls || []));
    (c.sections || []).forEach((s, i) => {
      const key = s.key || `part${s.part || i + 1}`;
      const qs = String(s.questions || '').split('\n').map((x) => x.trim()).filter(Boolean);
      html += section(++n, s.title || `Part ${s.part}`, `
        ${s.instructions ? `<div class="rich vi-note">${rich(s.instructions)}</div>` : ''}
        ${qs.length ? `<ol class="questions">${qs.map((q) => `<li lang="en">${esc(q)}</li>`).join('')}</ol>` : ''}
        ${s.cue ? `<div class="cue-card" lang="en">${rich(s.cue)}</div>` : ''}
        <div class="task-slot" data-key="${esc(key)}" data-label="${esc(s.title || 'Part ' + s.part)}" data-prep="${+s.prep || 0}" data-speak="${+s.speak || 120}"></div>`, `sec-${esc(key)}`);
    });
  } else {
    if (c.objectives?.length) html += section(++n, 'Mục tiêu bài học', `<ul class="checks">${c.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>`);
    if (c.warmup) html += section(++n, 'Khởi động', `<div class="rich">${rich(c.warmup)}</div>`);
    if (c.vocabulary?.length) html += section(++n, 'Từ vựng & cụm từ hữu ích', `
      <div class="vocab">${c.vocabulary.map((v) => `
        <div class="vocab-item"><div class="term" lang="en">${esc(v.term)}</div>
        <div class="meaning">${esc(v.meaning)}</div>
        ${v.example ? `<div class="example" lang="en">${esc(v.example)}</div>` : ''}</div>`).join('')}</div>`);
    if (c.strategy) html += section(++n, 'Cách phát triển câu trả lời', `<div class="rich">${rich(c.strategy)}</div>`);
    if (c.questions?.length) html += section(++n, 'Câu hỏi luyện tập', `
      <p class="muted small">Bấm “Luyện nói” để bật đồng hồ và tự ghi âm nghe lại. Phần luyện này <b>không</b> gửi cho giáo viên.</p>
      <div class="practice-list">${c.questions.map((q, i) => `
        <div class="practice">
          <div class="q" lang="en"><b>${i + 1}.</b> ${esc(q.text)}</div>
          ${q.cue ? `<div class="cue-card" lang="en">${rich(q.cue)}</div>` : ''}
          <button type="button" class="btn small" data-practice="${i}">🎧 Luyện nói (${q.prep ? fmtSecs(q.prep) + ' chuẩn bị + ' : ''}${fmtSecs(q.speak || 30)})</button>
          <div class="practice-slot" data-slot="${i}"></div>
        </div>`).join('')}</div>`);
    if (c.models?.length) html += section(++n, 'Câu trả lời mẫu: B1 → nâng cấp B2', `
      <p class="muted small">Đọc bản B1 trước, tự nâng cấp bằng lời của mình, rồi mới mở bản B2 để so sánh.</p>
      ${c.models.map((m) => `
      <div class="model">
        <div class="q" lang="en">${esc(m.question)}</div>
        <div class="model-b1"><span class="tag b1">B1</span><div class="rich" lang="en">${rich(m.b1)}</div></div>
        <details class="model-b2"><summary><span class="tag b2">B2</span> Xem phiên bản nâng cấp</summary><div class="rich" lang="en">${rich(m.b2)}</div></details>
        ${m.note ? `<div class="model-note">💡 ${rich(m.note)}</div>` : ''}
      </div>`).join('')}`);
    if (c.errors?.length) html += section(++n, 'Lỗi thường gặp của người học Việt Nam', `
      <div class="errors">${c.errors.map((e) => `
        <div class="err-item">
          <div class="wrong" lang="en">✗ ${esc(e.wrong)}</div>
          <div class="right" lang="en">✓ ${esc(e.right)}</div>
          ${e.explain ? `<div class="explain">${esc(e.explain)}</div>` : ''}
        </div>`).join('')}</div>`);
    if (c.attachments?.length) html += section(++n, 'Tài liệu kèm theo', attachmentsHtml(c.attachments, ctx.mediaUrls || []));
    if (c.task) html += section(++n, 'Nhiệm vụ ghi âm (nộp cho giáo viên)', `
      ${c.task.prompt ? `<div class="rich">${rich(c.task.prompt)}</div>` : ''}
      ${c.task.cue ? `<div class="cue-card" lang="en">${rich(c.task.cue)}</div>` : ''}
      <div class="task-slot" data-key="main" data-label="Nhiệm vụ ghi âm" data-prep="${+c.task.prep || 0}" data-speak="${+c.task.speak || 120}"></div>`, 'sec-task');
  }

  root.innerHTML = html;

  // Luyện nói (không nộp)
  root.querySelectorAll('[data-practice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.practice, q = c.questions[i];
      const slot = root.querySelector(`[data-slot="${i}"]`);
      if (slot.firstChild) { slot.innerHTML = ''; btn.classList.remove('on'); return; }
      const rec = createRecorder({ prep: +q.prep || 0, speak: +q.speak || 30, allowUpload: false });
      slot.appendChild(rec.el);
      btn.classList.add('on');
    });
  });

  // Ô nộp bài
  const selfItems = c.self_check || [];
  root.querySelectorAll('.task-slot').forEach((slot) => {
    const key = slot.dataset.key, label = slot.dataset.label;
    const prev = (ctx.mySubs || []).filter((s) => s.task_key === key);
    const rec = createRecorder({ prep: +slot.dataset.prep, speak: +slot.dataset.speak, allowUpload: true });
    const box = document.createElement('div');
    box.className = 'submit-box';
    box.innerHTML = `
      ${prev.length ? `<div class="prev-subs">Bạn đã nộp ${prev.length} lần cho phần này. ${prev.map((s) => `<a href="#/submission/${s.id}">${fmtDate(s.created_at)}${s.feedback ? ' · có phản hồi' : ''}</a>`).join(' · ')}</div>` : ''}
      ${selfItems.length ? `
      <div class="self-check"><h3>Tự đánh giá trước khi nộp</h3>
        ${selfItems.map((t, i) => `<label class="check"><input type="checkbox" data-self="${i}"> <span>${esc(t)}</span></label>`).join('')}
      </div>` : ''}
      <label class="field"><span>Ghi chú cho giáo viên (không bắt buộc)</span>
        <textarea rows="2" maxlength="1000" data-note placeholder="Ví dụ: Em chưa chắc cách phát âm từ ‘comfortable’."></textarea></label>
      <button type="button" class="btn primary block" data-submit disabled>${preview ? 'Nộp bài (tắt trong chế độ xem trước)' : '📤 Nộp bài cho giáo viên'}</button>
      <p class="small muted" data-hint>Hãy ghi âm hoặc chọn tệp trước khi nộp.</p>`;
    slot.append(rec.el, box);
    const btn = box.querySelector('[data-submit]');
    rec.onChange((res) => {
      btn.disabled = preview || !res;
      box.querySelector('[data-hint]').hidden = !!res;
    });
    btn.addEventListener('click', async () => {
      const res = rec.getResult();
      if (!res || preview) return;
      const selfAssessment = {};
      box.querySelectorAll('[data-self]').forEach((cb) => { selfAssessment[selfItems[+cb.dataset.self]] = cb.checked; });
      btn.disabled = true; btn.textContent = 'Đang tải lên…';
      try {
        const sub = await ctx.submit({ taskKey: key, taskLabel: label, result: res, selfAssessment, note: box.querySelector('[data-note]').value.trim() });
        rec.reset();
        box.querySelector('[data-note]').value = '';
        box.querySelectorAll('[data-self]').forEach((cb) => { cb.checked = false; });
        const ok = document.createElement('div');
        ok.className = 'notice ok';
        ok.innerHTML = `✅ Đã nộp lúc ${fmtDate(sub.created_at)}. Giáo viên sẽ nghe và phản hồi. <a href="#/submission/${sub.id}">Xem bài nộp</a>`;
        box.prepend(ok);
        toast('Đã nộp bài thành công');
      } catch (e) {
        toast(errMsg(e), 'err');
      } finally {
        btn.textContent = '📤 Nộp bài cho giáo viên';
        btn.disabled = !rec.getResult();
      }
    });
  });

  return root;
}
