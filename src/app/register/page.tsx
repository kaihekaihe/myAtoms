'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || '注册失败');
      router.replace('/studio');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-lg font-bold text-white">
            A
          </div>
          <div>
            <div className="text-lg font-bold leading-none">AtomLab</div>
            <div className="mt-1 text-[11px] tracking-wide text-stone-400">智能体应用生成工作台</div>
          </div>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <h1 className="font-semibold">创建账号</h1>
            <p className="mt-1 text-xs text-stone-500">注册后即可开始生成你的第一个应用。</p>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">昵称</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="怎么称呼你"
              maxLength={24}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">邮箱</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">密码</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              required
              minLength={6}
            />
          </label>
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
              {error}
            </div>
          )}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? '创建中…' : '注册并进入工作台'}
          </button>
          <p className="text-center text-xs text-stone-500">
            已有账号？{' '}
            <Link href="/login" className="font-medium text-violet-600 hover:text-violet-700">
              直接登录
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}