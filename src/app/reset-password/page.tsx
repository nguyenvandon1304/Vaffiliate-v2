"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data: current }) => setReady(Boolean(current.session)));
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if (password.length < 8) return setError("Mật khẩu cần có ít nhất 8 ký tự.");
    if (password !== confirm) return setError("Mật khẩu nhập lại không khớp.");
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) return setError("Không thể cập nhật mật khẩu. Vui lòng mở lại liên kết trong email.");
    setMessage("Mật khẩu đã được cập nhật. Bạn có thể đăng nhập lại."); setPassword(""); setConfirm("");
  }

  return <main className="min-h-screen px-4 py-10 sm:px-6"><section className="surface-card mx-auto max-w-lg p-6 sm:p-10"><Link href="/login" className="text-sm text-[color:var(--brand-strong)]">← Đăng nhập</Link><h1 className="mt-8 text-3xl font-semibold">Tạo mật khẩu mới</h1><p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">{ready ? "Chọn mật khẩu mới cho tài khoản của bạn." : "Liên kết đặt lại mật khẩu không còn hiệu lực hoặc chưa được mở từ email."}</p>{error && <p role="alert" className="mt-5 rounded-[var(--radius-lg)] bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mt-5 rounded-[var(--radius-lg)] bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p>}{ready && <form onSubmit={submit} className="mt-8 grid gap-4"><label htmlFor="new-password" className="text-sm font-semibold">Mật khẩu mới</label><input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-white/90 px-4 py-3" /><label htmlFor="confirm-password" className="text-sm font-semibold">Nhập lại mật khẩu</label><input id="confirm-password" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.14)] bg-white/90 px-4 py-3" /><button className="primary-button w-full" type="submit">Cập nhật mật khẩu</button></form>}</section></main>;
}
