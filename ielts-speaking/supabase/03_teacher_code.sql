-- =====================================================================
-- TẠO MÃ ĐĂNG KÝ CHO TÀI KHOẢN GIÁO VIÊN (chạy 1 lần)
-- 1. Thay  DOI-MA-NAY-2026  bằng một mã bí mật do cô tự đặt (chữ + số, không dấu).
-- 2. Bấm Run. Mã chỉ dùng được 1 lần.
-- 3. Mở website → nhập mã này ở ô "Mã tham gia" → tạo tài khoản → vào thẳng trang giáo viên.
-- =====================================================================
insert into public.join_codes (code_hash, code_hint, role, label, max_uses)
values (public.hash_code('DOI-MA-NAY-2026'), 'GV', 'teacher', 'Tài khoản giáo viên', 1);
