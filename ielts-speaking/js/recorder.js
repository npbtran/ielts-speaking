// Bộ ghi âm có đồng hồ chuẩn bị + đồng hồ nói.
// Dùng MediaRecorder; nếu thiết bị không hỗ trợ → cho tải tệp âm thanh lên.
import { esc, fmtSecs } from './util.js';

const MAX_UPLOAD = 25 * 1024 * 1024;

function pickMime() {
  if (!window.MediaRecorder) return null;
  const list = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const m of list) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* bỏ qua */ } }
  return '';
}

export function canRecord() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

/**
 * createRecorder({ prep, speak, allowUpload, label })
 * Trả về { el, getResult, onChange } — getResult() => { blob, mime, duration, source } | null
 */
export function createRecorder({ prep = 0, speak = 60, allowUpload = true, label = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'recorder';
  let state = 'idle', stream = null, rec = null, chunks = [], timer = null, startedAt = 0;
  let result = null, objectUrl = null, listeners = [];

  const supported = canRecord();
  el.innerHTML = `
    ${label ? `<div class="rec-label">${esc(label)}</div>` : ''}
    <div class="rec-meta">${prep ? `Chuẩn bị <b>${fmtSecs(prep)}</b> · ` : ''}Nói tối đa <b>${fmtSecs(speak)}</b></div>
    <div class="rec-stage">
      <div class="rec-phase" data-r="phase">${supported ? 'Sẵn sàng' : 'Thiết bị/trình duyệt này không hỗ trợ ghi âm trực tiếp.'}</div>
      <div class="rec-clock" data-r="clock">${fmtSecs(prep || speak)}</div>
      <div class="rec-bar"><span data-r="bar"></span></div>
    </div>
    <div class="rec-actions">
      <button type="button" class="btn primary" data-r="start" ${supported ? '' : 'hidden'}>🎙️ Bắt đầu</button>
      <button type="button" class="btn" data-r="skip" hidden>Nói ngay</button>
      <button type="button" class="btn danger" data-r="stop" hidden>⏹ Dừng</button>
      <button type="button" class="btn" data-r="redo" hidden>↺ Ghi âm lại</button>
    </div>
    <audio controls data-r="audio" hidden></audio>
    ${allowUpload ? `
    <details class="rec-upload" ${supported ? '' : 'open'}>
      <summary>Không ghi âm được? Tải tệp âm thanh lên</summary>
      <p class="muted small">Ghi âm bằng ứng dụng ghi âm của điện thoại, rồi chọn tệp (mp3, m4a, wav, webm, ogg; tối đa 25 MB).</p>
      <input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.aac" data-r="file">
    </details>` : ''}
    <p class="rec-error" data-r="err" hidden></p>`;

  const r = (k) => el.querySelector(`[data-r="${k}"]`);
  const show = (k, v) => { const n = r(k); if (n) n.hidden = !v; };
  const setErr = (m) => { r('err').textContent = m || ''; show('err', !!m); };
  const emit = () => listeners.forEach((f) => f(result));

  function tick(total, onEnd, phaseText) {
    clearInterval(timer);
    const t0 = Date.now();
    r('phase').textContent = phaseText;
    const draw = () => {
      const left = total - (Date.now() - t0) / 1000;
      r('clock').textContent = fmtSecs(Math.ceil(left));
      r('bar').style.width = `${Math.min(100, (1 - left / total) * 100)}%`;
      if (left <= 0) { clearInterval(timer); onEnd(); }
    };
    draw();
    timer = setInterval(draw, 250);
  }

  function setResult(res) {
    result = res;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = res ? URL.createObjectURL(res.blob) : null;
    const a = r('audio');
    if (objectUrl) { a.src = objectUrl; a.hidden = false; } else { a.removeAttribute('src'); a.hidden = true; }
    emit();
  }

  async function start() {
    setErr('');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setErr('Không truy cập được micro. Hãy cho phép trình duyệt dùng micro (biểu tượng ổ khoá cạnh địa chỉ web), hoặc tải tệp âm thanh lên bên dưới.');
      const d = el.querySelector('.rec-upload'); if (d) d.open = true;
      return;
    }
    setResult(null);
    show('start', false); show('redo', false);
    el.classList.add('active');
    if (prep > 0) {
      state = 'prep';
      show('skip', true);
      tick(prep, beginSpeaking, 'Thời gian chuẩn bị — ghi chú ý chính');
    } else beginSpeaking();
  }

  function beginSpeaking() {
    if (state === 'recording') return;
    state = 'recording';
    show('skip', false); show('stop', true);
    chunks = [];
    const mime = pickMime();
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    } catch {
      rec = new MediaRecorder(stream);
    }
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const type = rec.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunks, { type });
      const duration = (Date.now() - startedAt) / 1000;
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      setResult({ blob, mime: type.split(';')[0], duration, source: 'record' });
      r('phase').textContent = 'Đã ghi xong — nghe lại bên dưới';
      r('clock').textContent = fmtSecs(duration);
      show('stop', false); show('redo', true);
      el.classList.remove('active');
      state = 'done';
    };
    startedAt = Date.now();
    rec.start(1000);
    el.classList.add('recording');
    tick(speak, stop, '● Đang ghi âm — hãy nói');
  }

  function stop() {
    clearInterval(timer);
    el.classList.remove('recording');
    if (rec && rec.state !== 'inactive') rec.stop();
  }

  function reset() {
    clearInterval(timer);
    if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); }
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; state = 'idle';
    el.classList.remove('active', 'recording');
    setResult(null);
    r('phase').textContent = 'Sẵn sàng';
    r('clock').textContent = fmtSecs(prep || speak);
    r('bar').style.width = '0';
    show('start', supported); show('skip', false); show('stop', false); show('redo', false);
    const f = r('file'); if (f) f.value = '';
  }

  r('start')?.addEventListener('click', start);
  r('skip')?.addEventListener('click', () => { clearInterval(timer); beginSpeaking(); });
  r('stop')?.addEventListener('click', stop);
  r('redo')?.addEventListener('click', () => { reset(); start(); });
  r('file')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    setErr('');
    if (!file) return;
    if (file.size > MAX_UPLOAD) { setErr('Tệp quá lớn (tối đa 25 MB).'); e.target.value = ''; return; }
    if (state === 'prep' || state === 'recording') reset();
    const probe = new Audio(); const u = URL.createObjectURL(file);
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => { URL.revokeObjectURL(u); setResult({ blob: file, mime: file.type || 'audio/mpeg', duration: isFinite(probe.duration) ? probe.duration : null, source: 'upload' }); };
    probe.onerror = () => { URL.revokeObjectURL(u); setResult({ blob: file, mime: file.type || 'audio/mpeg', duration: null, source: 'upload' }); };
    probe.src = u;
    r('phase').textContent = `Đã chọn tệp: ${file.name}`;
  });

  return {
    el,
    getResult: () => result,
    onChange: (f) => listeners.push(f),
    reset,
    destroy: reset,
  };
}
