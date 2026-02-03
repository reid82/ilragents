import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { SPECIALIST_TEAMS } from '@/lib/specialists';

const ALLOWED_RECIPIENTS = new Set(
  Object.values(SPECIALIST_TEAMS).map((t) => t.email)
);

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Email service not configured' },
      { status: 503 }
    );
  }

  const { to, replyTo, subject, body, senderName } = await req.json();

  if (!ALLOWED_RECIPIENTS.has(to)) {
    return NextResponse.json({ error: 'Invalid recipient' }, { status: 400 });
  }

  if (!replyTo || !subject || !body) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: `${senderName || 'ILR Client'} via ILR Agents <noreply@ilragents.app>`,
    to,
    replyTo,
    subject,
    text: body,
  });

  if (error) {
    console.error('Resend error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
