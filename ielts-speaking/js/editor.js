// Trình soạn nội dung cho giáo viên: biểu mẫu sinh tự động từ "schema".
// Giáo viên chỉ điền ô, thêm/xoá/đổi thứ tự dòng — không phải sửa mã.
import { esc } from './util.js';

export const LESSON_SCHEMA = [
  { key: 'objectives', label: 'Mục tiêu bài học', type: 'list', help: 'Mỗi dòng một mục tiêu.' },
  { key: 'warmup', label: 'Hoạt động khởi động', type: 'textarea', rows: 5,
    help: 'Viết hướng dẫn bằng tiếng Việt, câu hỏi bằng tiếng Anh. Dòng bắt đầu bằng "- " thành gạch đầu dòng; **chữ** để in đậm.' },
  { key: 'vocabulary', label: 'Từ vựng & cụm từ hữu ích', type: 'rows', add: 'Thêm từ/cụm từ', fields: [
    { key: 'term', label: 'Từ / cụm từ (EN)', type: 'text' },
    { key: 'meaning', label: 'Nghĩa / cách dùng (VI)', type: 'text' },
    { key: 'example', label: 'Câu ví dụ (EN)', type: 'textarea', rows: 2 },
  ] },
  { key: 'strategy', label: 'Hướng dẫn phát triển câu trả lời', type: 'textarea', rows: 8 },
  { key: 'questions', label: 'Câu hỏi luyện tập', type: 'rows', add: 'Thêm câu hỏi', fields: [
    { key: 'text', label: 'Câu hỏi (EN)', type: 'textarea', rows: 2 },
    { key: 'cue', label: 'Cue card / gợi ý (không bắt buộc)', type: 'textarea', rows: 3 },
    { key: 'prep', label: 'Giây chuẩn bị', type: 'number', def: 0 },
    { key: 'speak', label: 'Giây nói tối đa', type: 'number', def: 30 },
  ] },
  { key: 'models', label: 'Câu trả lời mẫu B1 và bản nâng cấp B2', type: 'rows', add: 'Thêm câu trả lời mẫu', fields: [
    { key: 'question', label: 'Câu hỏi', type: 'text' },
    { key: 'b1', label: 'Câu trả lời B1', type: 'textarea', rows: 4 },
    { key: 'b2', label: 'Phiên bản nâng cấp B2', type: 'textarea', rows: 5 },
    { key: 'note', label: 'Điểm nâng cấp (VI)', type: 'textarea', rows: 2 },
  ] },
  { key: 'errors', label: 'Lỗi thường gặp của người học Việt Nam', type: 'rows', add: 'Thêm lỗi', fields: [
    { key: 'wrong', label: 'Câu/ cách nói sai', type: 'text' },
    { key: 'right', label: 'Cách nói đúng', type: 'text' },
    { key: 'explain', label: 'Giải thích (VI)', type: 'textarea', rows: 2 },
  ] },
  { key: 'task', label: 'Nhiệm vụ ghi âm (học viên nộp)', type: 'group', fields: [
    { key: 'prompt', label: 'Hướng dẫn nhiệm vụ', type: 'textarea', rows: 3 },
    { key: 'cue', label: 'Câu hỏi / cue card (EN)', type: 'textarea', rows: 5 },
    { key: 'prep', label: 'Giây chuẩn bị', type: 'number', def: 0 },
    { key: 'speak', label: 'Giây nói tối đa', type: 'number', def: 120 },
  ] },
  { key: 'self_check', label: 'Phiếu tự đánh giá', type: 'list', help: 'Mỗi dòng một tiêu chí học viên tự đánh dấu trước khi nộp.' },
];

export const MOCK_SCHEMA = [
  { key: 'intro', label: 'Hướng dẫn chung', type: 'textarea', rows: 5 },
  { key: 'sections', label: 'Các phần thi', type: 'rows', add: 'Thêm phần thi', fields: [
    { key: 'part', label: 'Part (1, 2 hoặc 3)', type: 'number', def: 1 },
    { key: 'title', label: 'Tiêu đề phần', type: 'text' },
    { key: 'instructions', label: 'Hướng dẫn (VI)', type: 'textarea', rows: 2 },
    { key: 'questions', label: 'Câu hỏi (mỗi dòng một câu)', type: 'textarea', rows: 5 },
    { key: 'cue', label: 'Cue card (Part 2)', type: 'textarea', rows: 5 },
    { key: 'prep', label: 'Giây chuẩn bị', type: 'number', def: 0 },
    { key: 'speak', label: 'Giây nói tối đa', type: 'number', def: 240 },
  ] },
  { key: 'self_check', label: 'Phiếu tự đánh giá', type: 'list', help: 'Mỗi dòng một tiêu chí.' },
];

function fieldHtml(f, v, path) {
  const id = `f_${path.replace(/[^\w]/g, '_')}`;
  const help = f.help ? `<small class="help">${esc(f.help)}</small>` : '';
  if (f.type === 'textarea') return `<label class="field" for="${id}"><span>${esc(f.label)}</span>${help}<textarea id="${id}" data-path="${path}" rows="${f.rows || 3}">${esc(v ?? '')}</textarea></label>`;
  if (f.type === 'number') return `<label class="field num" for="${id}"><span>${esc(f.label)}</span><input id="${id}" type="number" min="0" max="900" data-path="${path}" data-num value="${esc(v ?? f.def ?? 0)}"></label>`;
  if (f.type === 'list') return `<label class="field" for="${id}"><span>${esc(f.label)}</span>${help}<textarea id="${id}" rows="${f.rows || 4}" data-path="${path}" data-list>${esc((v || []).join('\n'))}</textarea></label>`;
  return `<label class="field" for="${id}"><span>${esc(f.label)}</span>${help}<input id="${id}" type="text" data-path="${path}" value="${esc(v ?? '')}"></label>`;
}

function getAt(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
function setAt(obj, path, val) {
  const ks = path.split('.'); let o = obj;
  ks.slice(0, -1).forEach((k, i) => { if (o[k] == null) o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k]; });
  o[ks[ks.length - 1]] = val;
}
function blankRow(fields) { const r = {}; fields.forEach((f) => { r[f.key] = f.type === 'number' ? (f.def ?? 0) : ''; }); return r; }

export function buildEditor(schema, initial) {
  const model = JSON.parse(JSON.stringify(initial || {}));
  const el = document.createElement('div');
  el.className = 'editor';

  function render() {
    el.innerHTML = schema.map((f) => {
      if (f.type === 'rows') {
        const rows = model[f.key] || (model[f.key] = []);
        return `<fieldset class="ed-block"><legend>${esc(f.label)} <span class="count">${rows.length}</span></legend>
          ${rows.map((row, i) => `
            <div class="ed-row">
              <div class="ed-row-head"><b>#${i + 1}</b>
                <span class="ed-row-tools">
                  <button type="button" class="icon" data-move="${f.key}:${i}:-1" title="Lên" ${i === 0 ? 'disabled' : ''}>↑</button>
                  <button type="button" class="icon" data-move="${f.key}:${i}:1" title="Xuống" ${i === rows.length - 1 ? 'disabled' : ''}>↓</button>
                  <button type="button" class="icon danger" data-del="${f.key}:${i}" title="Xoá">✕</button>
                </span></div>
              ${f.fields.map((sf) => fieldHtml(sf, row[sf.key], `${f.key}.${i}.${sf.key}`)).join('')}
            </div>`).join('')}
          <button type="button" class="btn small" data-add="${f.key}">＋ ${esc(f.add || 'Thêm dòng')}</button>
        </fieldset>`;
      }
      if (f.type === 'group') {
        const g = model[f.key] || (model[f.key] = blankRow(f.fields));
        return `<fieldset class="ed-block"><legend>${esc(f.label)}</legend>${f.fields.map((sf) => fieldHtml(sf, g[sf.key], `${f.key}.${sf.key}`)).join('')}</fieldset>`;
      }
      return `<fieldset class="ed-block"><legend>${esc(f.label)}</legend>${fieldHtml({ ...f, label: '' }, model[f.key], f.key)}</fieldset>`;
    }).join('');
  }

  el.addEventListener('input', (e) => {
    const t = e.target; const p = t.dataset.path; if (!p) return;
    let v = t.value;
    if (t.hasAttribute('data-num')) v = v === '' ? 0 : Math.max(0, Math.min(900, parseInt(v, 10) || 0));
    if (t.hasAttribute('data-list')) v = v.split('\n').map((s) => s.trim()).filter(Boolean);
    setAt(model, p, v);
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.add) {
      const f = schema.find((x) => x.key === b.dataset.add);
      (model[f.key] ||= []).push(blankRow(f.fields)); render();
      const rows = el.querySelectorAll(`[data-path^="${f.key}."]`); rows[rows.length - f.fields.length]?.focus();
    } else if (b.dataset.del) {
      const [k, i] = b.dataset.del.split(':');
      if (!confirm('Xoá dòng này?')) return;
      model[k].splice(+i, 1); render();
    } else if (b.dataset.move) {
      const [k, i, d] = b.dataset.move.split(':'); const a = model[k]; const j = +i + +d;
      [a[+i], a[j]] = [a[j], a[+i]]; render();
    }
  });

  render();
  return {
    el,
    getValue: () => {
      // Đặt khoá ổn định cho từng phần thi thử
      if (Array.isArray(model.sections)) {
        const seen = {};
        model.sections.forEach((s) => {
          const base = `part${s.part || 0}`; seen[base] = (seen[base] || 0) + 1;
          s.key = seen[base] > 1 ? `${base}_${seen[base]}` : base;
        });
      }
      return JSON.parse(JSON.stringify(model));
    },
  };
}

export { getAt };
