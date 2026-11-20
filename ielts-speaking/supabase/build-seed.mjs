// Tạo 02_seed.sql từ seed-content.mjs. Chạy: node supabase/build-seed.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lessons, BATCH } from './seed-content.mjs';

const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const dollar = (json) => { let tag = 'json'; while (json.includes(`$${tag}$`)) tag += 'x'; return `$${tag}$${json}$${tag}$::jsonb`; };

let sql = `-- =====================================================================
-- Nội dung mẫu: 3 bài học (Part 1, 2, 3) + 1 đề thi thử — trạng thái NHÁP.
-- Chạy SAU 01_schema.sql. Cô xem trước rồi bấm "Xuất bản" trong trang giáo viên.
-- =====================================================================\n`;
for (const l of lessons) {
  sql += `\ninsert into public.lessons (kind, title, summary, part, level, topic, update_batch, status, content)
select ${q(l.kind)}, ${q(l.title)}, ${q(l.summary)}, ${l.part ?? 'null'}, ${q(l.level)}, ${q(l.topic)}, ${q(BATCH)}, 'draft',
  ${dollar(JSON.stringify(l.content))}
where not exists (select 1 from public.lessons where title = ${q(l.title)});\n`;
}
const out = join(dirname(fileURLToPath(import.meta.url)), '02_seed.sql');
writeFileSync(out, sql);
console.log('Wrote', out, lessons.length, 'items');
