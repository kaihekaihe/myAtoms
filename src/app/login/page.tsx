'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const FEATURES = [
  { icon: '🔍', title: '需求分析师', desc: '把一句话拆解成结构化需求简报' },
  { icon: '🏗️', title: '应用架构师', desc: '设计字段、视图与统计的完整蓝图' },
  { icon: '✅', title: '蓝图质检员', desc: '逐项校验并修复，保证可运行' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || '登录失败');
      router.replace('/studio');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
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
            <h1 className="font-semibold">登录 AtomLab</h1>
            <p className="mt-1 text-xs text-stone-500">
              一句话描述业务，三个智能体为你搭出可运行的应用。
            </p>
          </div>
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
            {loading ? '登录中…' : '登 录'}
          </button>
          <p className="text-center text-xs text-stone-500">
            还没有账号？{' '}
            <Link href="/register" className="font-medium text-violet-600 hover:text-violet-700">
              免费注册
            </Link>
          </p>
        </form>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="card px-3 py-3 text-center">
              <div className="text-lg">{f.icon}</div>
              <div className="mt-1 text-xs font-semibold">{f.title}</div>
              <div className="mt-0.5 text-[10px] leading-relaxed text-stone-400">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}