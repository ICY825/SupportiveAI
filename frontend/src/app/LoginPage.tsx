import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui';
import { useSession } from '@/shared/auth';
import '@/features/mail/mail.css';

export default function LoginPage() {
  const { employee, ready, signIn } = useSession();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && employee) navigate('/mail/batches', { replace: true });
  }, [ready, employee, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(code.trim(), password);
      navigate('/mail/batches', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Không kết nối được tới máy chủ. Thử lại sau.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mail-scope"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: 340,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 24,
        }}
      >
        {/* Huy hiệu thương hiệu của wireframe mới, thay ô chữ "V" tự chế. */}
        <img src="/vsf-mark.png" alt="VinSmart Future" style={{ height: 38, width: 'auto' }} />
        <h1 style={{ margin: '14px 0 4px' }}>Trung tâm Hành chính</h1>
        <p className="small muted" style={{ margin: '0 0 18px' }}>
          Đăng nhập bằng mã nhân viên.
        </p>

        <label className="small muted" htmlFor="code">
          Mã nhân viên
        </label>
        <input
          id="code"
          className="field"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="username"
          autoFocus
          required
          style={{ margin: '4px 0 12px' }}
        />

        <label className="small muted" htmlFor="password">
          Mật khẩu
        </label>
        <input
          id="password"
          className="field"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          style={{ margin: '4px 0 16px' }}
        />

        {error && (
          <p role="alert" className="small" style={{ color: 'var(--vsf-red-dark)', marginTop: 0 }}>
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" busy={busy} full>
          Đăng nhập
        </Button>

        <p className="small muted" style={{ marginBottom: 0, marginTop: 16 }}>
          Người nhận thư không cần tài khoản — quét mã QR dán tại khu để đơn.
        </p>
      </form>
    </div>
  );
}
