# Hướng dẫn cài đặt và sử dụng website IELTS Speaking B1–B2

Website gồm hai phần:
- **Giao diện** (thư mục này): đặt miễn phí trên GitHub Pages.
- **Máy chủ Supabase** (gói Free): lo đăng nhập, cơ sở dữ liệu, lưu ghi âm và phân quyền.

Tổng thời gian cài đặt lần đầu: khoảng 30–45 phút. Sau đó, mỗi đợt cập nhật bài chỉ cần làm trên trang giáo viên.

---

## Cấu trúc thư mục

```
index.html                   Trang web (một trang duy nhất)
css/styles.css               Giao diện
js/config.js                 ← CHỈ SỬA TỆP NÀY (địa chỉ + khoá Supabase)
js/app.js, teacher.js …      Mã nguồn chương trình
supabase/01_schema.sql       Tạo bảng, phân quyền, mã tham gia, kho ghi âm
supabase/02_seed.sql         3 bài mẫu (Part 1, 2, 3) + 1 đề thi thử, ở trạng thái Nháp
supabase/03_teacher_code.sql Tạo mã đăng ký tài khoản giáo viên
.github/workflows/keepalive.yml  Giữ dự án Supabase không bị tạm dừng
```

---

## Bước 1 — Tạo dự án Supabase

1. Vào https://supabase.com → **Start your project** → đăng nhập bằng tài khoản GitHub của cô.
2. **New project**: đặt tên `ielts-speaking`, tạo mật khẩu cơ sở dữ liệu (lưu lại), chọn Region **Southeast Asia (Singapore)** cho nhanh nhất ở Việt Nam. Gói **Free**.
3. Đợi 1–2 phút cho dự án khởi tạo xong.

## Bước 2 — Tạo cơ sở dữ liệu và kết nối website

1. Trong Supabase, mở **SQL Editor** → **New query**.
2. Mở tệp `supabase/01_schema.sql`, chép **toàn bộ** nội dung, dán vào ô → **Run**. Thấy "Success" là được.
3. Làm tương tự với `supabase/02_seed.sql` (tạo 4 nội dung mẫu ở trạng thái Nháp).
4. Vào **Project Settings → API** (hoặc **Data API**), chép:
   - **Project URL**
   - **anon public** key (KHÔNG dùng khoá `service_role`)
5. Mở tệp `js/config.js`, dán hai giá trị vào `SUPABASE_URL` và `SUPABASE_ANON_KEY`.

## Bước 3 — Cài đặt đăng nhập (Authentication)

Trong Supabase → **Authentication**:

1. **Sign In / Providers → Email**: tắt **Confirm email**. Lý do: máy chủ email mặc định của Supabase rất hạn chế, học viên có thể không nhận được email xác nhận. Việc kiểm soát người vào học đã do mã tham gia đảm nhận.
2. **URL Configuration**:
   - **Site URL**: `https://npbtran.github.io/ielts-speaking/`
   - **Redirect URLs**: thêm `https://npbtran.github.io/ielts-speaking/` (và `http://localhost:8000/` nếu chạy thử trên máy).
3. (Khuyến nghị, để học viên tự lấy lại mật khẩu qua email) **Emails → SMTP Settings → Enable custom SMTP**, ví dụ dùng Gmail:
   - Host `smtp.gmail.com`, Port `587`, Username = địa chỉ Gmail, Password = **App Password** (tạo tại myaccount.google.com → Bảo mật → Xác minh 2 bước → Mật khẩu ứng dụng).
   - Sender email = địa chỉ Gmail đó; Sender name = `IELTS Speaking`.

   Nếu chưa cài SMTP, học viên quên mật khẩu → cô đặt lại trực tiếp ở trang **Học viên** (xem Bước 6).

## Bước 4 — Chạy thử website

**Cách nhanh nhất:** đưa lên GitHub Pages ngay (Bước 9) rồi thử trên điện thoại.

**Chạy trên máy tính** (cần Python, thường có sẵn trên macOS):
```
cd ielts-speaking
python3 -m http.server 8000
```
Mở `http://localhost:8000`. (Không mở trực tiếp tệp `index.html` bằng cách nhấp đúp — trình duyệt sẽ chặn mã và micro.)

## Bước 5 — Tạo tài khoản giáo viên

1. Supabase → SQL Editor → mở `supabase/03_teacher_code.sql`, đổi `DOI-MA-NAY-2026` thành mã bí mật của cô → **Run**.
2. Mở website → nhập mã đó ở ô **Mã tham gia** → **Kiểm tra mã** → điền tên, email, mật khẩu → **Tạo tài khoản**.
3. Cô được đưa thẳng vào **Tổng quan giáo viên**. Mã giáo viên chỉ dùng được 1 lần, nên không ai khác dùng lại được.

## Bước 6 — Cấp, thu hồi mã tham gia và thêm học viên

**Tạo mã:** menu **Mã tham gia** → điền:
- *Ghi chú*: tên học viên (mã riêng) hoặc tên đợt (mã chung).
- *Lớp/đợt*: gắn tự động vào học viên dùng mã này (ví dụ `K12-2026`).
- *Hết hạn ngày* và *Số lượt dùng* (1 cho mã riêng; 2–5 cho cả đợt).

Bấm **Tạo mã** → mã hiện **một lần duy nhất** → bấm **Sao chép liên kết mời** và gửi cho học viên qua Zalo/email. Học viên mở liên kết là mã đã được điền sẵn.

**Thu hồi mã:** bấm **Thu hồi** trong danh sách. Người chưa đăng ký sẽ không dùng được nữa.

**Thêm học viên:** gửi mã như trên; học viên tự tạo tài khoản bằng email của mình. Trang **Học viên** cho phép:
- đổi lớp/đợt;
- **Khoá** tài khoản (học viên không xem bài, không nộp bài được) và **Mở khoá**;
- **Đặt lại mật khẩu**: nhập mật khẩu mới (≥ 8 ký tự) → gửi cho học viên → nhắc học viên vào **Tài khoản** để đổi lại.

## Bước 7 — Tạo và lên lịch bài học, đề thi

Menu **Bài học & đề thi**:
- **＋ Bài học mới** hoặc **＋ Đề thi mới**; hoặc **Nhân bản** một bài có sẵn rồi sửa (nhanh nhất).
- Điền tiêu đề, Part, trình độ (B1/B2/B1–B2), chủ đề, **đợt cập nhật** (mỗi tháng có Đợt 1 và Đợt 2), hạn nộp nếu cần.
- Nội dung là các ô có sẵn: mục tiêu, khởi động, từ vựng, cách phát triển ý, câu hỏi luyện tập (kèm giây chuẩn bị/giây nói), câu trả lời mẫu B1 và B2, lỗi thường gặp, nhiệm vụ ghi âm, phiếu tự đánh giá. Bấm **＋ Thêm…** để thêm dòng; ↑ ↓ để đổi thứ tự; ✕ để xoá.
- **Tài liệu đính kèm**: chọn tệp âm thanh, hình ảnh, PDF (≤ 50 MB/tệp).

Các nút:
| Nút | Tác dụng |
|---|---|
| 💾 Lưu | Lưu thay đổi; bài nháp vẫn là nháp |
| 👁 Lưu & xem trước | Xem đúng như học viên sẽ thấy |
| 🚀 Xuất bản ngay | Học viên thấy ngay |
| 🗓 Lên lịch | Chọn ngày giờ; bài **tự hiện** đúng giờ đó |
| ⏸ Gỡ bài | Ẩn với học viên, giữ bài nộp cũ |
| Lịch sử | Xem mọi lần tạo/sửa/xuất bản/gỡ; khôi phục phiên bản cũ |

Trang **Tổng quan** có khung **Kế hoạch cập nhật tháng này** với 2 đợt, liệt kê bài đã gắn vào từng đợt. Hệ thống **không bao giờ tự đăng** bài khi cô chưa bấm Xuất bản hoặc Lên lịch.

**Nội dung mẫu:** 4 bài trong `02_seed.sql` đang ở trạng thái **Nháp**. Cô vào Xem trước, chỉnh nếu cần, rồi Xuất bản.

## Bước 8 — Nghe bài ghi âm và gửi phản hồi

Menu **Bài nộp** (mặc định lọc bài *Chờ phản hồi*) → chọn bài:
1. Nghe ghi âm; mở *Xem đề*, *Học viên tự đánh giá*, ghi chú của học viên.
2. Điền nhận xét cho 4 tiêu chí: Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, Pronunciation. Band là **không bắt buộc**.
3. Điền **Điểm mạnh**, **Cần cải thiện**, **Nhiệm vụ luyện tập tiếp theo**.
4. **Lưu nháp** (học viên chưa thấy) hoặc **Gửi phản hồi** (học viên thấy ngay, có thông báo "Phản hồi mới" trên trang của họ).
5. Bấm **Bài chờ tiếp theo →** để chấm liên tục.

Sau khi gửi phản hồi, có thể bấm **Xoá tệp ghi âm** để giải phóng dung lượng (phản hồi vẫn giữ).

## Bước 9 — Đưa website lên mạng (GitHub Pages)

1. Trên GitHub, tạo repo mới **public** tên `ielts-speaking` (tài khoản `npbtran`).
2. **Add file → Upload files** → kéo **toàn bộ nội dung** thư mục này vào (gồm `index.html`, các thư mục `css`, `js`, `supabase`, `.github`) → **Commit changes**.
   (Thư mục `.github` có thể bị ẩn trên máy; nếu không kéo được, bỏ qua — chỉ ảnh hưởng mục giữ dự án hoạt động ở dưới.)
3. **Settings → Pages** → Source: **Deploy from a branch** → Branch **main** / **(root)** → **Save**.
4. Sau 1–2 phút, website chạy tại `https://npbtran.github.io/ielts-speaking/`.
5. Giữ dự án Supabase không bị tạm dừng: **Settings → Secrets and variables → Actions → New repository secret**, thêm `SUPABASE_URL` và `SUPABASE_ANON_KEY` (cùng giá trị trong `config.js`). Tệp `keepalive.yml` sẽ tự gọi Supabase mỗi 3 ngày.

Mỗi lần sửa mã sau này: sửa tệp trên GitHub → Commit → website tự cập nhật sau 1–2 phút. **Bài học và đề thi thì không cần sửa mã** — làm hoàn toàn trên trang giáo viên.

---

## Luồng học viên (để cô hướng dẫn lớp)

1. Mở liên kết mời → **Kiểm tra mã** → tạo tài khoản.
2. **Trang của tôi**: Nội dung mới tháng này, Bài cần hoàn thành, Phản hồi mới, tiến độ theo 4 tiêu chí.
3. Mở bài → học → **Luyện nói** từng câu (tự nghe lại, không gửi) → phần **Nhiệm vụ ghi âm**: bấm **Bắt đầu** (cho phép micro) → chuẩn bị → nói → nghe lại / ghi lại → tự đánh giá → **Nộp bài**.
4. Nếu điện thoại không ghi âm được: mở **"Không ghi âm được? Tải tệp âm thanh lên"**, ghi bằng ứng dụng ghi âm của máy rồi chọn tệp.
5. **Bài nộp & phản hồi**: xem lịch sử và phản hồi.

Trên iPhone nên dùng Safari bản mới; trên Android dùng Chrome. Micro chỉ hoạt động trên địa chỉ `https://`.

---

## Bảo mật — cái gì được bảo vệ ở đâu

- Mã tham gia chỉ lưu **bản băm**; kiểm tra và trừ lượt dùng diễn ra **trong cơ sở dữ liệu** khi tạo tài khoản. Gọi thẳng API mà không có mã hợp lệ cũng bị từ chối.
- Phân quyền (Row Level Security) nằm trong cơ sở dữ liệu: người chưa đăng nhập không đọc được bài học, đề thi, bài nộp, phản hồi; học viên chỉ đọc được **bài nộp và phản hồi của chính mình**; chỉ thấy bài đã xuất bản và đã đến giờ; chỉ giáo viên được tạo/sửa nội dung và phản hồi.
- Tệp ghi âm nằm trong kho riêng tư, mỗi học viên một thư mục; đường dẫn nghe chỉ có hiệu lực 1 giờ.
- Khoá `anon` trong `config.js` được phép công khai. **Không bao giờ** đưa khoá `service_role` hay mật khẩu cơ sở dữ liệu lên GitHub.

## Chi phí và giới hạn (gói Free của Supabase)

- Cơ sở dữ liệu 500 MB (văn bản bài học, phản hồi — dùng rất ít).
- **Lưu tệp 1 GB** — phần sẽ đầy trước. Ghi âm được nén ở chất lượng giọng nói (~0,25 MB/phút). Với 5 học viên × 8 bài/tháng × 2–3 phút: khoảng 25–30 MB/tháng → dùng được nhiều năm. Tệp học viên tự tải lên (m4a, mp3) thường nặng hơn.
- Băng thông 5 GB/tháng.
- Dự án Free bị **tạm dừng sau 1 tuần không hoạt động** → đã có `keepalive.yml`. Nếu bị dừng, vào Supabase bấm **Restore project**.
- Khi cần nhiều hơn: gói Pro khoảng 25 USD/tháng (100 GB lưu tệp, không tạm dừng).

Kiểm tra dung lượng: Supabase → **Storage** hoặc **Settings → Usage**.

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Trang báo "Website chưa được cấu hình" | Chưa dán URL/khoá vào `js/config.js` |
| "Mã tham gia không hợp lệ…" | Mã sai, hết hạn, hết lượt hoặc đã thu hồi → tạo mã mới |
| Tạo tài khoản xong phải "kiểm tra email" | Chưa tắt Confirm email (Bước 3.1) |
| Không ghi âm được | Cho phép micro trong trình duyệt; dùng `https://`; hoặc tải tệp lên |
| Học viên không thấy bài | Bài còn Nháp, đang Lên lịch, đã Gỡ, hoặc tài khoản học viên bị Khoá |
| Liên kết đặt lại mật khẩu báo lỗi | Kiểm tra Redirect URLs (Bước 3.2) hoặc đặt lại mật khẩu từ trang Học viên |

## Cập nhật nội dung mẫu bằng tệp (tuỳ chọn, cho người rành kỹ thuật)

Nội dung mẫu nằm ở `supabase/seed-content.mjs`. Sau khi sửa, chạy `node supabase/build-seed.mjs` để tạo lại `02_seed.sql`. Cách thông thường vẫn là sửa trên trang giáo viên.
