# Mã Next.js của Đề 3 — chờ chuyển sang Vite

Thư mục này là **kho tạm**, không nằm trong ứng dụng đang chạy. `tsconfig.app.json`
chỉ nhận `src`, `.oxlintrc.json` bỏ qua `legacy/**`, nên không có gì ở đây được
biên dịch, lint hay build.

## Vì sao có thư mục này

Đề 3 (chuyển phát nhanh) được dựng ngày 17/09/2026 trên Next.js 14 App Router,
lệch với ADR 0001 (React + TypeScript + Vite). Issue #1 đã chốt: chuyển Đề 3 sang
Vite, giữ ứng dụng Vite làm nền chung cho cả 4 đề bài.

Khi gộp hai nhánh, mã Next được chuyển vào đây nguyên vẹn thay vì xóa, để việc
chuyển đổi có thể đối chiếu từng màn hình mà không phải đọc lịch sử Git.

## Cái gì **không** nằm ở đây

`src/api/{client,types,mail,employees,auth}.ts` ở lại `frontend/src/api/`. Đó là
ranh giới với backend, viết bằng `fetch` thuần, không dính Next, và theo thỏa
thuận ở Issue #1 thì không được sửa.

## Việc phải làm khi chuyển (P3)

| Hiện tại (Next) | Thay bằng (Vite + react-router) |
|---|---|
| `next/link` | `Link` của react-router |
| `useRouter().push` | `useNavigate()` |
| `usePathname` | `useLocation().pathname` |
| `useSearchParams` | bản của react-router |
| `next/font/google` (Inter) | thẻ `<link>` trong `index.html` |
| `src/layout.tsx` + `Metadata` | `<title>` |
| `src/page.tsx` + `redirect` | `<Navigate>` |
| `src/(admin)/mail/**/page.tsx` | bảng route |
| `rewrites()` trong `next.config.mjs` | `server.proxy` trong `vite.config.ts` — **đã làm** |

Hai điểm bắt buộc, theo yêu cầu của @CongDuc02 ở Issue #1:

1. **Tách guard đúng hai nhánh.** `src/(admin)/**` là nhóm cần đăng nhập;
   `src/station/` là trang **công khai**, người quét QR tại khu để đơn không có
   tài khoản. Next diễn đạt việc này bằng route group nên sai thì thấy ngay;
   react-router phải viết tay. Cần test riêng cho cả hai ca.
2. **Phục vụ `dist/` trên production.** `backend/app/main.py` chưa có
   `StaticFiles` nào — trước đây Next tự phục vụ chính nó. Việc này phát sinh do
   chuyển đổi.

Chuyển xong màn hình nào thì xóa file gốc của màn hình đó khỏi đây. Khi thư mục
rỗng thì xóa luôn cả thư mục.
