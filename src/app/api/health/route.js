import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, message: "Backend interno disponível" }, { status: 200 });
}
