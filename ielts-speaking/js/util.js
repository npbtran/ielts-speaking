// Tiện ích dùng chung

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Văn bản đơn giản → HTML an toàn.
// Hỗ trợ: dòng trống = đoạn mới; dòng bắt đầu "- " = gạch đầu dòng; **đậm**; *nghiêng*.
export function rich(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  let html = '', list = false, para = [];
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  const flushPara = () => { if (para.length) { html += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
  const closeList = () => { if (list) { html += '</ul>'; list = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*[-•]\s+/.test(line)) {
      flushPara();
      if (!list) { html += '<ul>'; list = true; }
      html += `<li>${inline(line.replace(/^\s*[-•]\s+/, ''))}</li>`;
    } else if (!line.trim()) {
      flushPara(); closeList();
    } else {
      closeList(); para.push(line);
    }
  }
  flushPara(); closeList();
  return html;
}

const VN = 'vi-VN';
export function fmtDate(d, withTime = true) {
  if (!d) return '';
  const dt = new Date(d);
  return withTime
    ? dt.toLocaleString(VN, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : dt.toLocaleDateString(VN, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// <input type="datetime-local"> dùng giờ địa phương
export function toLocalInput(d) {
  if (!d) return '';
  const dt = new Date(d);
  const off = dt.getTimezoneOffset();
  return new Date(dt.getTime() - off * 60000).toISOString().slice(0, 16);
}
export function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }

export function fmtSecs(s) {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function toast(msg, type = 'ok') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add('hide'), 3500);
  setTimeout(() => t.remove(), 4000);
}

export function errMsg(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  const map = [
    [/INVALID_JOIN_CODE|Database error saving new user/i, 'Mã tham gia không hợp lệ, đã hết hạn hoặc đã hết lượt dùng.'],
    [/Invalid login credentials/i, 'Email hoặc mật khẩu không đúng.'],
    [/Email not confirmed/i, 'Email chưa được xác nhận. Hãy mở hộp thư và bấm vào liên kết xác nhận.'],
    [/User already registered|already been registered/i, 'Email này đã có tài khoản. Hãy đăng nhập.'],
    [/Password should be at least|PASSWORD_TOO_SHORT/i, 'Mật khẩu cần ít nhất 8 ký tự.'],
    [/rate limit|too many/i, 'Thao tác quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.'],
    [/NOT_ALLOWED|row-level security|permission denied/i, 'Bạn không có quyền thực hiện thao tác này.'],
    [/Failed to fetch|NetworkError/i, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'],
    [/exceeded the maximum allowed size|Payload too large/i, 'Tệp quá lớn (tối đa 25 MB).'],
  ];
  for (const [re, vi] of map) if (re.test(m)) return vi;
  return m;
}

// Đợt cập nhật: mỗi tháng 2 đợt
export function batchLabel(date, half) {
  const d = new Date(date);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${ym} · Đợt ${half}`;
}
export function batchOptions(monthsBack = 2, monthsAhead = 3) {
  const out = [];
  const now = new Date();
  for (let m = -monthsBack; m <= monthsAhead; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
    out.push(batchLabel(d, 1), batchLabel(d, 2));
  }
  return out;
}
export function currentBatches() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return [
    { label: batchLabel(now, 1), range: `ngày 1–15/${now.getMonth() + 1}`, active: now.getDate() <= 15 },
    { label: batchLabel(now, 2), range: `ngày 16–${lastDay}/${now.getMonth() + 1}`, active: now.getDate() > 15 },
  ];
}

export function lessonState(l) {
  if (l.status === 'draft') return { key: 'draft', label: 'Nháp' };
  if (l.status === 'unpublished') return { key: 'unpublished', label: 'Đã gỡ' };
  if (l.publish_at && new Date(l.publish_at) > new Date()) return { key: 'scheduled', label: 'Đã lên lịch' };
  return { key: 'published', label: 'Đã xuất bản' };
}

export function partLabel(l) {
  if (l.kind === 'mock_test') return l.part ? `Thi thử Part ${l.part}` : 'Thi thử đủ 3 phần';
  return l.part ? `Part ${l.part}` : 'Tổng hợp';
}

export function isThisMonth(d) {
  if (!d) return false;
  const a = new Date(d), b = new Date();
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function one(x) { return Array.isArray(x) ? (x[0] || null) : (x || null); }

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}
