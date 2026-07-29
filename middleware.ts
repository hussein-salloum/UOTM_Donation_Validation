import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("report_session")?.value;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return NextResponse.redirect(new URL("/", request.url));
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }
}

export const config = { matcher: ["/report/:path*", "/api/report/:path*"] };
