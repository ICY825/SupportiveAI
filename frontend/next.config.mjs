/** @type {import('next').NextConfig} */

// Backend chạy ở cổng khác. Proxy `/api/*` qua Next thay vì bật CORS ở
// backend: trình duyệt chỉ thấy MỘT origin duy nhất, nên không có
// preflight, không phải khai danh sách origin, và trang khu để đơn mở
// trên điện thoại cũng không vướng gì.
const BACKEND = process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8000';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND}/api/:path*` }];
  },
};

export default nextConfig;
