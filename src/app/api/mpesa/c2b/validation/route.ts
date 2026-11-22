import { NextResponse } from 'next/server';

function isAuthorizedWebhook(req: Request): boolean {
  const secret = process.env.MPESA_WEBHOOK_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('x-mpesa-webhook-secret');
  return token === secret;
}

export async function POST(req: Request) {
  if (!isAuthorizedWebhook(req)) {
    return NextResponse.json({ ResultCode: 'C2B00016', ResultDesc: 'Rejected' }, { status: 403 });
  }
  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
