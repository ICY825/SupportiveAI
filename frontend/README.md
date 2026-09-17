# Frontend — Trung tâm Hành chính

React + Next.js (App Router) + TypeScript.

> ⚠️ **Lệch với ADR 0001.** Đội đã chốt **React 19 + TypeScript + Vite**
> ([ADR 0001](../docs/decisions/0001-floor-planning-web-stack-and-floor-data.md), 15/09), còn
> mã trong thư mục này dựng trên **Next.js 14 App Router** trước khi nhánh lấy ADR về.
> Chưa ai quyết chuyển hay không.
>
> Phần lớn mã ở đây là **React thuần**, không phụ thuộc Next. Chỗ thật sự dính:
>
> | Chỗ dính | Sang Vite thì thay bằng |
> |---|---|
> | Định tuyến theo thư mục `app/`, nhóm `(admin)` | `react-router` trong `src/router/` |
> | `next.config.mjs` proxy `/api/*` | `server.proxy` trong `vite.config.ts` |
> | `next/font` nạp Inter | Thẻ `<link>` Google Fonts, hoặc tự host |
> | `next/link`, `next/navigation` | `Link`, `useNavigate`, `useParams` của react-router |
> | `'use client'` | Bỏ hẳn — Vite không có server component |
>
> Còn lại (`api/`, `components/`, `shared/`, `layouts/`, toàn bộ nội dung màn hình)
> chuyển sang nguyên vẹn.

Hiện mới có **Đề 3 — Chuyển phát nhanh**. Ba đề còn lại chưa làm; rail bên
trái vẫn hiện icon của chúng ở trạng thái mờ để thấy Đề 3 nằm ở đâu trong
tổng thể.

## Chạy

```bash
cp .env.local.example .env.local     # trỏ BACKEND_ORIGIN nếu backend không ở :8000
npm install
npm run dev                          # http://localhost:3000
```

Backend phải chạy song song, và Postgres phải bật trước đó:

```bash
docker compose up -d                        # Postgres, cổng 5433
cd ../backend
alembic upgrade head                        # lần đầu: tạo bảng
uvicorn app.main:app --reload --port 8000
```

> pgAdmin mặc định nối cổng 5432 — đó là Postgres cài sẵn trên máy, không phải
> của dự án. Khai server mới trỏ vào **5433**, db `supportive_ai`, user/mật khẩu
> `supportive`/`supportive`.

### Đăng nhập bằng tài khoản nào?

**Chưa có sẵn tài khoản nào** — bảng `employee` trống cho tới khi HR gửi danh
mục (mục A1 trong [checklist](../docs/checklist-truoc-khi-chay.md)). Hệ thống
cũng **không có trang tự đăng ký**: phần lớn CBNV không bao giờ đăng nhập, họ
chỉ nhận thư và quét QR ở `/station`.

Tạo tài khoản HC đầu tiên từ dòng lệnh:

```bash
cd ../backend
python ../scripts/create_user.py --code HC001 --name "Phạm Thị Duyên" \
    --email duyen@congty.vn --phone 0911111111
```

Rồi đăng nhập bằng **mã nhân viên** (`HC001`) và mật khẩu vừa đặt — không phải
email.

Next proxy `/api/*` sang backend (xem `next.config.mjs`), nên trình duyệt
chỉ thấy **một origin** — không cần bật CORS ở backend, và trang khu để đơn
mở trên điện thoại cũng không vướng gì.

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy dev server |
| `npm run build` | Dựng bản production |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (`eslint-config-next`) |

## Màn hình

| Đường dẫn | Màn hình | Tài liệu |
|---|---|---|
| `/login` | Đăng nhập bằng mã nhân viên | — |
| `/mail/batches` | Danh sách lô + tải file lễ tân | [§3.1](../docs/architecture/mail-tracking.md#31-cách-nhận-file) |
| `/mail/batches/[id]` | **Soát trước khi gửi** — chốt chặn quan trọng nhất | [§5](../docs/architecture/mail-tracking.md#5-màn-hình-soát-trước-khi-gửi) |
| `/mail/pending-match` | "Chờ khớp" xuyên lô | [§6.4](../docs/architecture/mail-tracking.md#64-gửi-một-phần) |
| `/mail/items` | Kiện hàng — lọc theo trạng thái, tự làm mới | [§9.1](../docs/architecture/mail-tracking.md#91-màn-hình-kiện-hàng-ưu-tiên-cao-nhất) |
| `/mail/reports` | Báo cáo | [§9.3](../docs/architecture/mail-tracking.md#93-bảng-kpi) |
| `/station` | **Công khai** — quét QR tại khu để đơn | [§7.2](../docs/architecture/mail-tracking.md#72-phương-án-chọn) |

`/station` là trang duy nhất **không đăng nhập** và là trang duy nhất thiết
kế cho điện thoại. Mã QR dán tại khu để đơn phải trỏ tới
`https://<host>/station?t=<MAIL_STATION_TOKEN>` — mã trạm nằm trong URL, không
phải thứ người dùng gõ.

## Cấu trúc

Theo `docs/architecture/repository-structure.md` §9: `features/` chia dọc
đúng bốn đề bài, và **các feature không import lẫn nhau**.

```text
src/
├── app/                    # route (App Router)
│   ├── (admin)/            # nhóm cần đăng nhập — dùng AdminShell
│   ├── login/
│   └── station/            # công khai, không shell
├── api/                    # client gọi backend + DTO
├── components/             # ui.tsx, EmployeePicker
├── layouts/                # AdminShell
└── shared/                 # auth, format, nhãn tiếng Việt
```

Thư mục `src/features/` và `src/router/` để trống: Next dùng định tuyến theo
file nên không cần `router/`, còn mã của Đề 3 hiện đủ nhỏ để nằm trong
`app/(admin)/mail/`. Khi Đề 1/2/4 vào thì tách sang `features/` theo đúng
quy ước.

## Hai thứ đừng sửa nếu chưa đọc tài liệu

**1. Phân ba mức bằng ký hiệu VÀ màu, không chỉ bằng màu.**
`shared/mail-labels.ts` gắn cho mỗi mức một `symbol` (`✓` / `!` / `?` / `⧉`)
và `StatusPill` luôn in nó ra. [§5.2](../docs/architecture/mail-tracking.md#52-nội-dung-màn-hình)
yêu cầu vậy để người khó phân biệt màu vẫn dùng được màn hình soát. Thêm
giá trị mới thì phải đặt cả `symbol`.

**2. Tỷ lệ khớp tự động vẽ theo tuần, không phải một con số.**
Cơ chế alias làm tỷ lệ tăng dần theo thời gian
([§4.5](../docs/architecture/mail-tracking.md#45-học-alias)). Gộp thành một
con số trung bình sẽ làm hệ thống trông tệ hơn hẳn thực lực, và che mất
chính cái đường đi lên — thứ là bằng chứng rằng thiết kế này hoạt động.

## Màu và kiểu chữ

Lấy từ **wireframe mới** (artboard `0a`), khai trong `src/app/globals.css`. Wireframe là
nguồn chuẩn cho **thị giác**; **luồng nghiệp vụ** thì theo `docs/architecture/` — xem
[§16](../docs/architecture/mail-tracking.md#16-khác-biệt-so-với-wireframe).

**Năm màu trạng thái vận hành**, dùng chung cho cả bốn đề bài. Đừng đặt màu khác cho cùng
một ý nghĩa — người dùng đi qua lại giữa các phân hệ.

| Token | Giá trị | Nghĩa | Đề 3 dùng cho |
|---|---|---|---|
| `--vsf-red` | `#D2181F` | Khẩn cấp / hành động | Nút chính, vạch phân hệ đang xem, pill `Tồn đọng` (đỏ đặc) |
| `--status-occupied` | `#3D617F` | Đang diễn ra | `Đã thông báo` |
| `--status-available` | `#297A60` | Sẵn sàng / xong | `Khớp chắc`, `Đã nhận` |
| `--status-reserved` | `#9A701E` | Chờ duyệt | `Cần soát` |
| `--status-conflict` | `#B6443D` | Xung đột | (chưa dùng ở Đề 3) |
| `--status-unavailable` | `#6D7882` | Tạm ngưng | (chưa dùng ở Đề 3) |
| `--charcoal` | `#1C1B1A` | Nền AppNav | Thanh điều hướng trái |
| `--bg` / `--card` | `#F6F4F1` / `#FFFFFF` | Nền và thẻ | |

Font Inter (600 tiêu đề, 400 nội dung).

## Khung màn hình

Theo wireframe mới: **AppNav 204px** (không phải rail icon 60px của bản cũ) + **topbar 52px**.

- AppNav có nhãn chữ, chia hai nhóm *Đang sử dụng* / *Sắp triển khai*; phân hệ chưa làm thì
  chữ mờ và gắn thẻ `Khóa`.
- Mục đang xem báo bằng **hai** tín hiệu: nền sáng `rgba(255,255,255,.1)` **và** vạch đỏ VSF
  3px ở mép trái.
- Bốn màn hình của Đề 3 nằm ở topbar dưới dạng `view-toggle`, đúng chỗ wireframe đặt nút
  chuyển chế độ. AppNav chỉ liệt kê phân hệ.

**Hai chỗ cố tình lệch wireframe, có lý do:**

| Chỗ lệch | Lý do |
|---|---|
| Đảo hai nhóm: Đề 3 nằm ở *Đang sử dụng*, ba đề kia ở *Sắp triển khai* | Wireframe dựng từ góc nhìn nhóm Đề 1/2. Ở ứng dụng này Đề 3 là phân hệ **đã chạy** — rail nói dối thì người dùng bấm vào chỗ trống |
| Không có ô tìm kiếm chung + `Ctrl K` | Chưa có endpoint tìm kiếm xuyên phân hệ. Ô tìm không làm gì còn tệ hơn không có ô tìm. Thêm khi nào có thứ để tìm |
