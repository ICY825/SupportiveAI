# Checklist trước khi chạy thật

> Những gì còn thiếu để hệ thống chạy được với người dùng thật
> Phạm vi: **Đề 3 — Chuyển phát nhanh**

**Trạng thái:** `Đang theo dõi`
**Phiên bản:** 1.1
**Cập nhật:** 17/09/2026

> **Bản 1.1** cập nhật sau khi nhận file mẫu thật từ lễ tân và áp dụng
> [CR-001](architecture/CR-001-de3-cap-nhat-theo-file-that.md):
> **B1 và C1 đã giải**, A1 thêm một câu hỏi mới về cột email.

---

## Cách dùng tài liệu này

Code phần không phụ thuộc dữ liệu đã xong. Thứ còn thiếu **không phải code** mà là dữ liệu, quyết định và hạ tầng — tài liệu này liệt kê đúng những thứ đó.

Xếp theo **mức độ chặn**, không theo người trả lời. Phần [phiếu câu hỏi](#7-phiếu-câu-hỏi-theo-đầu-mối) ở cuối gom lại theo từng đầu mối để gửi đi.

Khi một mục được trả lời: đổi ❓ thành ✅, ghi câu trả lời và ngày vào ngay dòng đó.

| Ký hiệu | Ý nghĩa |
|---|---|
| 🔴 | Chặn cứng — không có thì hệ thống không chạy thật được |
| 🟠 | Vấn đề thiết kế chưa có lời giải |
| 🟡 | Cần để hoàn chỉnh, có thể làm song song |
| ⚪ | Ảnh hưởng chất lượng, không chặn |
| ❓ | Chưa có câu trả lời |
| ✅ | Đã chốt |

---

## Mục lục

- [1. Tóm tắt](#1-tóm-tắt)
- [2. Chặn cứng](#2-chặn-cứng)
- [3. Vấn đề thiết kế chưa có lời giải](#3-vấn-đề-thiết-kế-chưa-có-lời-giải)
- [4. Cần để hoàn chỉnh Đề 3](#4-cần-để-hoàn-chỉnh-đề-3)
- [5. Ảnh hưởng chất lượng, không chặn](#5-ảnh-hưởng-chất-lượng-không-chặn)
- [6. Không thuộc Đề 3](#6-không-thuộc-đề-3)
- [7. Phiếu câu hỏi theo đầu mối](#7-phiếu-câu-hỏi-theo-đầu-mối)
- [8. Thứ tự ưu tiên](#8-thứ-tự-ưu-tiên)

---

## 1. Tóm tắt

| # | Mục | Mức | Chờ ai | Trạng thái |
|---|---|---|---|---|
| A1 | Danh mục nhân sự | 🔴 | HR | ❓ |
| A2 | Kênh thông báo hoạt động | 🔴 | IT | ❓ |
| A3 | Mạng và nơi triển khai | 🔴 | IT | ❓ |
| ~~B1~~ | ~~Khử trùng lặp khi không có mã vận đơn~~ | ~~🟠~~ | — | ✅ **đã giải 17/09** |
| ~~C1~~ | ~~File mẫu thật~~ | ~~🟡~~ | — | ✅ **đã giải 17/09** |
| C2 | Frontend 5 màn hình | 🟡 | Dev | ✅ **đã dựng 17/09** — chờ UAT |
| C3 | Đo baseline thủ công | 🟡 | HC | ❓ **có hạn chót** |
| D1–D7 | Bảy mục chất lượng | ⚪ | HC / Lễ tân | ❓ |
| D8 | Khi nào bỏ được tờ ký giấy | 🟠 | HC | ❓ **chờ số liệu pilot** |

**Đã xong:** backend Đề 3, lõi chung, và frontend 6 màn hình — **354 test** backend, và một lượt chạy thật xuyên hai tầng trên `mau.xlsx`.

> ✅ **Đã chạy trên PostgreSQL thật 17/09/2026:** `alembic upgrade head` lên tới `0004` sạch,
> và một lượt đi hết luồng (tải `mau.xlsx` → soát → gửi một phần → chờ khớp → khu để đơn →
> báo cáo) đạt 22/22 bước. Bộ 354 test vẫn chạy trên SQLite in-memory — đó là chủ ý, để test
> nhanh và không cần hạ tầng; phần nào phụ thuộc đặc thù Postgres thì kiểm bằng lượt chạy thật.

### Cơ sở dữ liệu ở đâu

Postgres của dự án chạy trong Docker, **cổng 5433** — không phải 5432:

```bash
docker compose up -d                    # dựng/bật container
cd backend && alembic upgrade head      # tạo bảng, tới bản 0004
```

| | |
|---|---|
| Host / cổng | `localhost` / **5433** |
| Database | `supportive_ai` |
| User / mật khẩu | `supportive` / `supportive` |

> ⚠️ **pgAdmin mặc định nối vào cổng 5432** — đó là bản PostgreSQL cài sẵn trên máy, hoàn
> toàn không liên quan tới dự án. Phải khai một server mới trỏ vào **5433** mới thấy dữ liệu.
> `docker-compose.yml` cố ý chọn 5433 vì nhiều máy dev đã có Postgres chiếm sẵn 5432, và khi
> đó ứng dụng sẽ lặng lẽ nối nhầm vào bản local.

---

## 2. Chặn cứng

### 🔴 A1. Danh mục nhân sự

Bảng `employee` đã dựng xong, đủ cột, có index — nhưng **chưa có dữ liệu thật**. Không có nó thì không khớp được ai và không biết gửi cho ai.

`README §5.1`: *"Nếu chưa có danh sách nhân sự sạch với mã duy nhất thì cả 4 phân hệ đều gãy ở cùng một chỗ."*

**Cần:** file xuất từ HR.

| Cột | Bắt buộc | Dùng làm gì |
|---|---|---|
| Mã nhân viên | Có | Khóa duy nhất (`README A4`) |
| **Họ tên đầy đủ** | Có | **Khóa khớp chính** từ 17/09 ([mail-tracking §4.2](architecture/mail-tracking.md#42-thứ-tự-ưu-tiên)) |
| **Email — hộp thư THẬT** | Có | Địa chỉ gửi. **Không phải tài khoản AD** — xem cảnh báo dưới |
| Tài khoản AD (UPN) | Nên có | Lưu riêng ở cột `upn`; cần nếu sau này chuyển sang Teams |
| Số điện thoại | Có | Trang quét QR tại khu để đơn ([§7.2](architecture/mail-tracking.md#72-phương-án-chọn)). **Không còn là khóa khớp** vì file lễ tân không có cột này |
| Phòng ban | Nên có | Báo cáo theo đơn vị |

> 🔴 **Cột `email` phải là hộp thư thật sự nhận mail, không phải tài khoản đăng nhập AD.**
> Hai chuỗi này khác nhau: `v.trungab1@vinsmartfuture.tech` (hộp thư) và
> `trungab1@vingroup.net` (tài khoản AD). Lấy nhầm cột là **lỗi im lặng nguy hiểm nhất
> trong cả hệ thống**: thư không tới ai, nhưng SMTP vẫn nhận và hệ thống vẫn báo gửi
> thành công — đồng hồ SLA chạy, kiện chuyển tồn đọng, còn người nhận thì không bao giờ
> biết mình có hàng.
>
> Đặt `UPN_DOMAIN_HINT` trong `.env` (ví dụ `vingroup.net`) thì màn hình nhập danh mục
> cảnh báo ngay khi phát hiện. Để trống thì không kiểm tra gì.

| ❓ | Câu hỏi | Vì sao quan trọng |
|---|---|---|
| ❓ | **Email có đầy đủ cho mọi nhân sự không?** Bao nhiêu người thiếu? | Đã xác nhận SĐT đầy đủ, **chưa ai xác nhận email**. Thiếu email thì người đó không nhận được thông báo, mà hệ thống vẫn im lặng tính SLA rồi chuyển tồn đọng — họ không bao giờ biết mình có kiện hàng |
| ❓ | **Cột email trong file HR là hộp thư hay tài khoản AD?** Tên miền của mỗi loại là gì? | Quyết định giá trị `UPN_DOMAIN_HINT`, và là lỗi im lặng nguy hiểm nhất nếu lấy nhầm |
| ❓ | **Họ tên trong hồ sơ có đầy đủ không** (đủ họ, đệm, tên)? | Từ 17/09 tên là khóa khớp chính. Hồ sơ ghi thiếu họ thì khớp gần đúng phải làm việc nhiều hơn |
| ❓ | Đồng bộ một lần hay định kỳ? Ai cập nhật, bao lâu một lần? | Người mới vào, nghỉ việc, đổi số (`README B3`) |

> **Lưu ý về Teams:** nếu chuyển sang Teams thì vẫn cần email — đó là cách tra ra tài khoản Azure AD của từng người. Teams **không** tra người bằng số điện thoại.

**Tài khoản đăng nhập.** Chỉ nhân viên HC mới cần — người nhận thư không đăng
nhập, họ quét QR ở khu để đơn. Hệ thống **không có trang tự đăng ký**, nên tài
khoản đầu tiên tạo từ dòng lệnh:

```bash
cd backend
python ../scripts/create_user.py --code HC001 --name "Phạm Thị Duyên" \
    --email duyen@congty.vn --phone 0911111111
```

Đăng nhập bằng **mã nhân viên**, không phải email. Đổi mật khẩu: thêm
`--set-password`.

> ⚠️ Script đọc `DATABASE_URL` giống hệt ứng dụng — chạy nhầm một phát là tạo
> tài khoản vào cơ sở dữ liệu khác. Script in ra chuỗi kết nối trước khi ghi,
> nhìn dòng đó rồi hãy gõ mật khẩu.

### 🔴 A2. Kênh thông báo

Hiện dùng `OutboxChannel`: thông báo lưu đầy đủ vào bảng `notification` nhưng **không gửi đi đâu**. Tiện để chạy thử toàn luồng, nhưng không dùng thật được.

| Kênh | Cần gì | Độ khó |
|---|---|---|
| **Email** | Host/cổng SMTP relay nội bộ, hoặc bật SMTP AUTH cho một hộp thư | **Thấp** — code đã xong, chỉ điền `.env` |
| **Teams** | Đăng ký app Azure AD + **admin consent** + cài app cho toàn tenant | **Cao** — phần khó là thủ tục phê duyệt, không phải code |

Chi tiết thông số SMTP: [mail-tracking §6.3](architecture/mail-tracking.md#63-kênh).

**Khuyến nghị:** làm email trước — chạy được cho *mọi* người, kể cả ai không dùng Teams. Thêm Teams sau nếu IT duyệt kịp. Đừng đặt đường thông báo duy nhất của pilot vào thứ phụ thuộc thủ tục mà ta không kiểm soát được.

> ✅ **Chốt 17/09/2026 ([CR-001](architecture/CR-001-de3-cap-nhat-theo-file-that.md) D9):
> pilot gửi qua email tại tên miền công ty. Teams ra khỏi phạm vi pilot** vì phụ thuộc
> phê duyệt cấp tập đoàn — không đặt đường thông báo duy nhất của pilot vào thứ nhóm
> không kiểm soát được. Câu hỏi còn lại chỉ là thông số SMTP.

| ❓ | Câu hỏi |
|---|---|
| ❓ | Thông số SMTP relay nội bộ: host, cổng, có cần xác thực không? |

### 🔴 A3. Mạng và nơi triển khai

> **Mục này chưa từng được đặt ra, và nó có thể phá hỏng toàn bộ thiết kế xác nhận ở [§7](architecture/mail-tracking.md#7-xác-nhận-đã-nhận).**

Thiết kế xác nhận dựa trên một giả định ngầm: **điện thoại cá nhân của người nhận, khi đang đứng ngoài hành lang, mở được trang web của hệ thống.**

Nếu hệ thống chỉ chạy trong mạng nội bộ:

| Đường xác nhận | Điện thoại ở wifi khách hoặc 4G |
|---|---|
| Quét QR tại khu để đơn — **đường chính** | ❌ Không vào được |
| Bấm link trong email — đường phụ | ❌ Đọc được email nhưng bấm link không vào được |
| HC đối chiếu tờ ký giấy | ✅ Nhưng đây là đường lui, không phải thiết kế |

Tức là **cả hai đường xác nhận điện tử đều chết**, và quy trình quay về đúng tờ giấy như cũ.

| ❓ | Câu hỏi | Hệ quả nếu trả lời "không" |
|---|---|---|
| ❓ | Hệ thống đặt ở server nào? Ai cấp? | Không triển khai được |
| ❓ | **Điện thoại cá nhân đứng ở hành lang có vào được hệ thống không?** | Phải thiết kế lại §7 — không phải sửa code |
| ❓ | Có domain nội bộ và **HTTPS** không? | QR trỏ tới `http://` sẽ bị trình duyệt điện thoại cảnh báo, nhiều người không dám bấm |

---

## 3. Vấn đề thiết kế chưa có lời giải

### ✅ B1. Khử trùng lặp khi không có mã vận đơn — **đã giải 17/09/2026**

> Mục này từng là 🟠 — vấn đề thiết kế duy nhất chưa có lời giải. Giữ lại nguyên văn
> lập luận vì nó giải thích vì sao lời giải cuối cùng có hình dạng như vậy.

**Vấn đề:** file thật từ lễ tân không có mã vận đơn, nên [§3.3 bản 0.3](architecture/mail-tracking.md#33-khử-trùng-lặp) lấy `tracking_code` làm khóa duy nhất mất hẳn nguồn dữ liệu. Code vẫn chạy nhưng vô dụng: mọi dòng `tracking_code = NULL`, ràng buộc `UNIQUE` không chặn được gì.

Ba hướng đã cân nhắc:

| Hướng | Cách làm | Rủi ro |
|---|---|---|
| **A. Khử trùng theo lô/ngày** | Lấy ngày nhận làm khóa của lô | Hỏng nếu lễ tân gửi 2 file/ngày |
| **B. Khóa tổ hợp** | `(người nhận + người gửi + ngày nhận)` | Nuốt mất kiện thứ hai nếu một người nhận 2 kiện cùng nguồn trong cùng ngày |
| **C. Xin thêm cột mã vận đơn** | Mã đã in sẵn trên tem | Thêm việc cho lễ tân |

**Lời giải đã chốt: B + A, và cả hai đều là _cảnh báo mềm_.**

Cái gỡ được rủi ro của hướng B là một đặc điểm của file thật mà lúc đặt câu hỏi chưa ai biết: **lễ tân gộp nhiều kiện cùng nguồn trong cùng ngày vào một dòng rồi ghi `số lượng`**. Nên hai dòng trùng khóa không phải hai kiện thật — đó là dấu hiệu tải lại file.

| Cơ chế | Hành vi |
|---|---|
| Khóa tổ hợp (B) | Trùng với dòng thuộc lô **đã gửi** → đánh dấu nghi trùng, hiện tham chiếu tới dòng cũ. Mặc định không gửi, **HC bấm giữ lại được** |
| Ngày của lô (A) | Tải lại file của ngày đã có lô → cảnh báo ở đầu màn hình soát, HC quyết |
| Ràng buộc DB | **Không** `UNIQUE` trên `dedup_key` — chỉ index |

> **Vì sao không tự động bỏ dòng:** âm thầm nuốt dữ liệu là kiểu hỏng tệ nhất — không ai phát hiện ra, và người nhận không bao giờ biết mình có kiện. Cảnh báo sai thì HC mất mười giây.

Hướng C **vẫn nên hỏi**, nhưng hỏi sau khi có số liệu — xem [§8](#8-thứ-tự-ưu-tiên).

Chi tiết: [mail-tracking §3.3](architecture/mail-tracking.md#33-khử-trùng-lặp).

---

## 4. Cần để hoàn chỉnh Đề 3

### ✅ C1. File mẫu thật — **đã có 17/09/2026**

`mau.xlsx` đã nhận. Toàn bộ câu hỏi về cấu trúc file đã có câu trả lời:

| Câu hỏi | Trả lời |
|---|---|
| Tên cột chính xác | `stt`, `người gửi`, `ngày nhận`, `số lượng`, `nội dung`, `người nhận` — tất cả chữ thường |
| Có dòng tiêu đề không? | Có, ở **dòng 1**, không có dòng thừa phía trên |
| Một sheet hay nhiều? | Một, tên `Trang_tính1` (nhiều khả năng xuất từ Google Sheets) |
| "Ngày nhận" có giờ không? | **Chỉ ngày**, và là ô datetime thật (format `mm-dd-yy`) |
| `.xlsx` hay `.csv`? | `.xlsx` — và **nên giữ như vậy** |

`importer.py` đã viết xong và có test chạy trên chính file mẫu này.

> ⚠️ **Nói với lễ tân: xin giữ nguyên `.xlsx`, đừng xuất sang `.csv`.** Trong `.xlsx` ô
> ngày là datetime thật, đọc chắc chắn. Xuất sang `.csv` thì định dạng `mm-dd-yy` thành
> chuỗi mơ hồ — `09/17/26` và `17/09/26` không phân biệt được. Gặp chuỗi mơ hồ thì hệ
> thống **không đoán**, mà bắt HC xác nhận ngày cho cả lô.

**Ba hệ quả lớn của file thật** (không phải câu hỏi nữa, nhưng phải biết):

1. **Không có số điện thoại** → khớp theo tên, và bảng `matching_alias` học từ lần HC chọn trở thành cơ chế khớp chính. Tỷ lệ khớp tự động sẽ **thấp ở tuần đầu rồi tăng dần**.
2. **Không có phòng ban** → không còn tín hiệu phụ để tách người trùng tên. Thay bằng lịch sử "ai từng nhận hàng từ người gửi này".
3. **Một dòng không phải một kiện** → mọi con số phải nói rõ đang đếm dòng hay đếm kiện.

### ✅ C2. Frontend — **đã dựng 17/09/2026**

Next.js App Router + TypeScript. Sáu màn hình, `npm run build` sạch, đã chạy
thật end-to-end với backend (22/22 bước đạt, gồm cả đọc `mau.xlsx` thật).

| Màn hình | Đường dẫn | Ghi chú |
|---|---|---|
| Soát trước khi gửi | `/mail/batches/[id]` | [§5](architecture/mail-tracking.md#5-màn-hình-soát-trước-khi-gửi) gọi là chốt chặn quan trọng nhất |
| Lô thư + tải file | `/mail/batches` | Cảnh báo lô cùng ngày, ngày mơ hồ, thiếu email |
| "Chờ khớp" xuyên lô | `/mail/pending-match` | [§6.4](architecture/mail-tracking.md#64-gửi-một-phần) |
| Kiện hàng | `/mail/items` | HC dùng hằng ngày. Lọc theo trạng thái, tự làm mới mỗi 45s |
| Báo cáo | `/mail/reports` | Tỷ lệ khớp tự động vẽ **theo tuần** |
| Quét QR tại khu để đơn | `/station` | **Công khai**, thiết kế cho điện thoại. Phụ thuộc [A3](#-a3-mạng-và-nơi-triển-khai) |

Màu và kiểu chữ lấy từ wireframe artboard `0a` để đồng bộ với ba đề còn lại.

| ❓ | Còn lại |
|---|---|
| ❓ | **UAT**: ai thử, thử cái gì, tiêu chí nghiệm thu? (`README C6`) |
| ❓ | Mã QR dán tại khu để đơn phải trỏ tới `https://<host>/station?t=<MAIL_STATION_TOKEN>` — chưa có host thật ([A3](#-a3-mạng-và-nơi-triển-khai)) |

> ⚠️ **Chưa ai dùng thử trên trình duyệt thật.** Kiểm chứng tới giờ là build sạch,
> lint sạch, và chạy hết luồng qua HTTP. Cái chưa đo được là thao tác thật của HC
> có nhanh hơn quy trình cũ không — đó là việc của UAT, và cần [C3](#-c3-đo-baseline-thủ-công--có-hạn-chót) làm trước để có gì mà so.

### 🟡 C3. Đo baseline thủ công — **có hạn chót**

`README §11` yêu cầu đo ở Tuần 0:

- Hiện HC mất bao lâu để xử lý một file?
- Tỷ lệ thư bị quên nhận trong tháng gần nhất?

> ⚠️ **Phải làm TRƯỚC khi hệ thống chạy thật.** Chạy rồi thì không còn quy trình cũ để bấm giờ — mất cơ hội vĩnh viễn, và cuối pilot không có gì để so sánh.

Đây là mục **duy nhất** trong cả danh sách bị ràng buộc về thời điểm.

| ❓ | Câu hỏi |
|---|---|
| ❓ | Ai bấm giờ, đo khi nào? |

---

## 5. Ảnh hưởng chất lượng, không chặn

| # | Mục | Hiện tại | Chờ ai |
|---|---|---|---|
| ⚪ D1 | **Nơi lấy** — chuỗi in thẳng vào email | `"Khu vực chuyển phát nhanh"`. Nên ghi rõ tầng và vị trí, mơ hồ là người nhận tìm nhầm chỗ | HC |
| ⚪ D2 | **Mã trạm QR** (`MAIL_STATION_TOKEN`) | Đang để trống = endpoint công khai trần. Ai trong mạng nội bộ cũng gõ 4 số bất kỳ rồi xác nhận hộ người khác | HC / IT |
| ⚪ D3 | **Ngưỡng tên gần đúng** `0.85` (`MAIL_NAME_FUZZY_THRESHOLD`) | Tự đặt, cần hiệu chỉnh khi có dữ liệu thật. Quan trọng hơn trước vì tên giờ là khóa khớp chính | Tự đo sau vài lô |
| ⚪ D4 | **Nhận sau khi đã tồn đọng** | Hiện cho phép. Nếu quy định là sau 5 ngày trả lại bên gửi thì `Tồn đọng` phải là điểm cuối và cần thêm trạng thái `Đã trả lại` | HC |
| ⚪ D5 | **Lưu lượng thực tế** mỗi ngày bao nhiêu kiện | Chưa biết | Lễ tân |
| ⚪ D6 | **Ngưỡng cảnh báo dòng `Chờ khớp`** 2 ngày (`MAIL_PENDING_MATCH_ALERT_DAYS`) | Tự đặt. Chỉ đẩy lên đầu màn hình, **không** tự chuyển `Tồn đọng` | HC |
| ⚪ D7 | **Cột `nội dung`** (`"phong bì"`, …) | Chưa biết là bộ giá trị cố định hay ghi tự do. Nếu cố định thì dùng được để nhận diện kiện giá trị cao | Lễ tân |
| 🟠 D8 | **Bỏ tờ ký giấy sau pilot** | Xem khung bên dưới — đây là quyết định **phải chờ số liệu pilot**, không chốt trước được | HC |

### 🟠 D8. Khi nào bỏ được tờ ký giấy

Câu hỏi đã đặt ra: *"đi vào hoạt động sẽ bỏ bước ký tên trên giấy, vậy nút 'Đã trao tay' còn cần không?"*

**Không quyết trước được — tỷ lệ `hc_reconciled` trong pilot mới là câu trả lời.**

| Tỷ lệ `hc_reconciled` | Nghĩa | Bỏ giấy được chưa |
|---|---|---|
| Thấp | Người nhận tự quét QR sau khi lấy hàng | ✅ Bỏ được |
| Cao | Kiện chỉ được ghi nhận nhờ HC đọc tờ giấy | ❌ Bỏ giấy = đúng ngần ấy kiện nằm mãi ở `Đã thông báo`, bị nhắc T+2 rồi chuyển `Tồn đọng` T+5 **dù đã có người lấy**. Danh sách tồn đọng đầy báo động giả |

Sau khi bỏ giấy, nút "Đã trao tay" **vẫn còn nghĩa nhưng hẹp lại**: chỉ dùng khi HC **tự tay trao kiện** cho người vào hỏi ([§7.1](architecture/mail-tracking.md#71-quy-trình-thật-tại-chỗ-để-đơn) ghi nhận tình huống này có thật). Không dùng để tick cho danh sách gọn mắt — ghi nhận một việc không ai chứng kiến thì số liệu trông sạch trong khi thực tế không ai biết kiện ở đâu.

| ❓ | Câu hỏi cho Phòng HC |
|---|---|
| ❓ | Đặt ngưỡng `hc_reconciled` bao nhiêu thì đồng ý bỏ giấy? (đề xuất: dưới 10% trong 2 tuần liền) |
| ❓ | Nếu tỷ lệ cứ cao mãi: đổi vị trí/kích thước biển QR, hay giữ giấy luôn? |
| ❓ | Ai được bấm "Đã trao tay", và có bắt ghi lý do không? |

---

## 6. Không thuộc Đề 3

Ba mục dưới có ghi chú ⚠️ trong mã nguồn, **không chặn Đề 3** nhưng sẽ chặn đề khác:

| Mục | Chặn ai | Vị trí trong mã |
|---|---|---|
| Lịch làm việc + nguồn ngày lễ | Đề 2, Đề 4 (Đề 3 đã bỏ theo [§8.4](architecture/mail-tracking.md#84-tính-theo-giờ-đồng-hồ-không-theo-giờ-làm-việc)) | `platform/workflow/calendar.py` |
| Token dùng một lần cho link xác nhận | Đường phụ của §7, và cả 3 đề còn lại | `core/security.py` |
| Phân quyền theo dòng (row-level) | Đề 4 (`README C1`) | `core/permissions.py` |

Và `README A1` vẫn treo: **team có ai, ai làm gì, ai duy trì sau pilot.**

---

## 7. Phiếu câu hỏi theo đầu mối

### Gửi HR

1. Xin file xuất danh mục nhân sự: mã NV, **họ tên đầy đủ**, email, tài khoản AD, số điện thoại, phòng ban.
2. **Email có đầy đủ cho mọi nhân sự không?** Nếu thiếu thì bao nhiêu người?
3. **Cột email trong file là hộp thư thật hay tài khoản đăng nhập AD?** Tên miền của mỗi loại là gì? (Xem cảnh báo ở [A1](#-a1-danh-mục-nhân-sự) — đây là lỗi im lặng nguy hiểm nhất.)
4. Họ tên trong hồ sơ có đầy đủ họ, đệm, tên không?
5. Khi có người mới vào / nghỉ việc / đổi số thì cập nhật thế nào, ai làm, bao lâu một lần?

### Gửi IT

6. Có SMTP relay nội bộ cho ứng dụng gửi mail không? Host, cổng, có cần xác thực hay cho phép theo IP?
7. Xin một hộp thư dùng chung (kiểu `hanhchinh@congty.vn`) làm địa chỉ gửi.
8. SPF/DKIM của domain đã khai chưa?
9. Hệ thống đặt ở server nào? Có domain nội bộ và HTTPS không?
10. **Điện thoại cá nhân của nhân viên, khi đứng ở hành lang, có vào được hệ thống không?**

> Câu về Teams đã bỏ — Teams ra khỏi phạm vi pilot ([A2](#-a2-kênh-thông-báo)).

### Gửi lễ tân

11. **Xin giữ nguyên định dạng `.xlsx`, đừng xuất sang `.csv`** — định dạng ngày hiện tại là `mm-dd-yy`, sang `.csv` là đọc sai được. *(Đây là việc nhờ, không phải câu hỏi.)*
12. Mỗi ngày đúng một file, hay có khi gửi nhiều lần? Có khi nào gửi lại file đã sửa?
13. Tải lại file mà `số lượng` đổi từ 1 thành 3 — là sửa lại con số cũ, hay có thêm 2 kiện mới?
14. Cột `nội dung` có bộ giá trị cố định không, hay ghi tự do?
15. File có phải xuất từ Google Sheets không?
16. Mỗi ngày trung bình bao nhiêu kiện?
17. **Thêm được cột số điện thoại vào file không?** — *hỏi sau 1–2 tuần chạy thật, xem [§8](#8-thứ-tự-ưu-tiên).*

> Câu về mã vận đơn đã bỏ: khử trùng lặp đã có lời giải khác ([B1](#-b1-khử-trùng-lặp-khi-không-có-mã-vận-đơn--đã-giải-17092026)), và cột cần xin bây giờ là **số điện thoại** — nó gỡ được việc khớp, thứ tốn công hơn nhiều.

### Gửi Phòng Hành chính

18. **Nơi lấy** ghi chính xác thế nào để in vào email (tầng, vị trí)?
19. Quá 5 ngày chưa ai nhận thì xử lý ra sao — vẫn giữ cho người ta lấy, hay trả lại bên gửi?
20. **Dòng ở `Chờ khớp` quá lâu thì quy trình xử lý ra sao?** (kiện của khách, thực tập sinh, người không có trong danh mục)
21. **Ai bấm giờ đo baseline, và bao giờ?** (phải xong trước khi hệ thống chạy thật)
22. Kế hoạch UAT: ai thử, thử cái gì, tiêu chí nghiệm thu? (`README C6`)

---

## 8. Thứ tự ưu tiên

Nếu chỉ làm được ba việc, làm đúng ba việc này — **đều là đi hỏi, không phải code**:

| # | Việc | Gỡ được gì |
|---|---|---|
| 1 | **Xin HR file danh mục nhân sự** (câu 1–4) | Gỡ chặn lớn nhất, và không phụ thuộc bất kỳ quyết định nào khác. Nhớ hỏi kỹ câu 3 về cột email |
| 2 | **Hỏi IT câu 10** — điện thoại cá nhân có vào được không | Nếu "không" thì phải thiết kế lại §7 **ngay**, đừng để phát hiện lúc chạy thật |
| 3 | **Nhờ lễ tân câu 11** — giữ nguyên `.xlsx` | Một câu nhắn, gỡ luôn rủi ro đọc sai ngày |

Sau đó theo thứ tự: A2 (thông số SMTP) → C3 (baseline, **làm sớm vì có hạn chót**) → UAT.

### Việc cần làm **sau** 1–2 tuần chạy thật

**Đề nghị lễ tân thêm cột số điện thoại** (câu 17), dùng số liệu trong bảng `mail_match_feedback` làm căn cứ:

> "Trong N ngày vừa rồi, HC phải chọn tay X% số dòng, mất khoảng Y phút mỗi ngày.
> Thêm một cột số điện thoại thì con số đó về gần 0."

Lập luận có số đo cụ thể thuyết phục hơn nhiều so với đề nghị trước khi chạy — và lúc đó lễ tân cũng đã quen với hệ thống. Khi có cột đó, bật `MAIL_MATCH_BY_PHONE=true`, **không phải sửa code**.

---

*Cập nhật tài liệu này mỗi khi một mục được trả lời. Khi tất cả 🔴 đã ✅ thì hệ thống chạy thật được.*
