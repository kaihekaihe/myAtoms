import { NextResponse } from 'next/server';

export function ok(data: unknown) {
  return NextResponse.json(data);
}

export function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}