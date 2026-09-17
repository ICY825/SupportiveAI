import { redirect } from 'next/navigation';

export default function Home() {
  // Pilot mới có Đề 3; dashboard tổng quan 4 đề (artboard 1a) làm sau.
  redirect('/mail/batches');
}
