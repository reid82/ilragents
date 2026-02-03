# Plan: Specialist Email Drafting & Tone Fixes

## Overview

Two changes:

1. **Remove "mate" from agent tone** - Add explicit instruction to suppress condescending language.
2. **Specialist email drafting** - When agents advise on topics where professional help would benefit the client, they offer to draft an email to the relevant specialist team. The user reviews/edits the draft in a modal, then sends via Resend.

---

## Specialist Contact Map

| Key | Team Name | Email | Phone |
|-----|-----------|-------|-------|
| `finance` | Wizdom Finance Team | loans@wizdom.com.au | - |
| `accounting` | Wizdom Accounting Team | accounting@wizdom.com.au | +61 2 9011 6687 |
| `asset-protection` | IPS Asset Protection | info@investorpacificstructures.com.au | 1300 411 653 |
| `legal` | Pacific Law | info@pacificlaw.com.au | 1300 151 651 |

---

## Step 1: Add `email` and `phone` to ClientProfile

**File:** `packages/web/src/lib/stores/financial-store.ts`

Add two optional fields to `PersonalBasics`:

```typescript
export interface PersonalBasics {
  firstName: string;
  age?: number;
  state: AustralianState;
  dependents?: number;
  partnerInvesting?: boolean;
  partnerIncome?: number;
  email?: string;    // NEW
  phone?: string;    // NEW
}
```

These are optional because existing test profiles don't have them. The email modal will prompt for email if missing.

**Also update test profiles** in `packages/pipeline/src/pipeline/eval/profiles.ts` - add realistic email/phone to each profile so eval scenarios can exercise the flow.

---

## Step 2: Suppress "mate" and add referral instructions to system prompt

**File:** `packages/pipeline/src/pipeline/chat.ts` - `buildSystemPrompt()`

### 2a: Add to HOW TO BEHAVE section (after point 6, line 184):

```
7. Never use the word "mate" when addressing the client. While Australian in origin, it can come across as condescending in a professional advisory context. Use their name if available, or simply address them directly.
```

### 2b: Add new SPECIALIST REFERRALS section (after WHEN TO ASK CLARIFYING QUESTIONS, before format instructions):

```
SPECIALIST REFERRALS:
When your advice touches on areas where the client would benefit from engaging a professional - finance/loans, accounting/tax, asset protection structures, or legal matters - include a referral block at the END of your response after any sources section.

Format: <!--REFERRAL:{"team":"finance"|"accounting"|"asset-protection"|"legal","reason":"brief reason for referral","suggestedSubject":"email subject line"}-->

Rules:
- Always answer the question fully first. The referral supplements your answer, never replaces it.
- Only include a referral when professional engagement would genuinely help the client take action.
- You may include multiple referral blocks if multiple specialists are relevant.
- Keep "reason" to one sentence explaining why this specialist would help.
- Keep "suggestedSubject" short and specific (e.g. "Trust structure for next IP purchase").
- Do not mention the referral in your conversational response. The system will render it as a card.
```

### 2c: Update the test

**File:** `packages/pipeline/src/pipeline/chat.test.ts`

Add test for the "mate" suppression and referral instructions:

```typescript
it('suppresses use of mate', () => {
  const format = resolveResponseFormat();
  const prompt = buildSystemPrompt('Baseline Ben', mockContext, format);
  expect(prompt).toContain('Never use the word "mate"');
});

it('includes specialist referral instructions', () => {
  const format = resolveResponseFormat();
  const prompt = buildSystemPrompt('Baseline Ben', mockContext, format);
  expect(prompt).toContain('SPECIALIST REFERRALS');
  expect(prompt).toContain('<!--REFERRAL:');
});
```

---

## Step 3: Create specialist contact map config

**New file:** `packages/web/src/lib/specialists.ts`

```typescript
export interface SpecialistTeam {
  key: string;
  name: string;
  email: string;
  phone?: string;
  description: string;
}

export const SPECIALIST_TEAMS: Record<string, SpecialistTeam> = {
  finance: {
    key: 'finance',
    name: 'Wizdom Finance Team',
    email: 'loans@wizdom.com.au',
    description: 'Professional finance and lending',
  },
  accounting: {
    key: 'accounting',
    name: 'Wizdom Accounting Team',
    email: 'accounting@wizdom.com.au',
    phone: '+61 2 9011 6687',
    description: 'Tax strategy and accounting',
  },
  'asset-protection': {
    key: 'asset-protection',
    name: 'IPS Asset Protection',
    email: 'info@investorpacificstructures.com.au',
    phone: '1300 411 653',
    description: 'Asset protection structures',
  },
  legal: {
    key: 'legal',
    name: 'Pacific Law',
    email: 'info@pacificlaw.com.au',
    phone: '1300 151 651',
    description: 'Property and investment law',
  },
};

export interface Referral {
  team: string;
  reason: string;
  suggestedSubject: string;
}

/** Parse <!--REFERRAL:{...}--> blocks from a response string.
 *  Returns [cleanedContent, referrals[]] */
export function parseReferrals(content: string): [string, Referral[]] {
  const referrals: Referral[] = [];
  const cleaned = content.replace(
    /<!--REFERRAL:(.*?)-->/g,
    (_, json) => {
      try {
        referrals.push(JSON.parse(json));
      } catch { /* skip malformed */ }
      return '';
    }
  );
  return [cleaned.trim(), referrals];
}
```

---

## Step 4: Add `referrals` to Message type and extend chat store

**File:** `packages/web/src/lib/stores/chat-store.ts`

Add `Referral` import and optional `referrals` field to `Message`:

```typescript
import type { Referral } from '@/lib/specialists';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  referrals?: Referral[];  // NEW
}
```

No store logic changes needed - `referrals` is just data on the message object.

---

## Step 5: Parse referrals in ChatPanel and render cards

**File:** `packages/web/src/components/ChatPanel.tsx`

### 5a: Import referral utilities

```typescript
import { parseReferrals, SPECIALIST_TEAMS } from '@/lib/specialists';
import type { Referral } from '@/lib/specialists';
```

### 5b: Parse referrals from streamed content

In the streaming completion handler (after line 134, when stream ends), parse referrals before committing to store:

```typescript
const [cleanContent, referrals] = parseReferrals(assistantText);

updateLastMessage(agentSlug, {
  role: 'assistant',
  content: cleanContent,
  sources,
  referrals: referrals.length > 0 ? referrals : undefined,
});
```

Also update the streaming display - strip referral blocks from `streamingText` before rendering so partial `<!--REFERRAL:` tags don't flash on screen. Use a simple regex strip or just hide anything after `<!--` during streaming.

### 5c: Add state for email modal

```typescript
const [emailDraft, setEmailDraft] = useState<{
  team: SpecialistTeam;
  subject: string;
  body: string;
  userQuestion: string;
} | null>(null);
```

### 5d: Render referral cards after sources

Inside the message rendering block (after the sources section, around line 287), add:

```tsx
{msg.referrals && msg.referrals.length > 0 && (
  <div className="mt-3 pt-3 border-t border-zinc-700">
    <p className="text-xs text-zinc-400 mb-2">
      Need professional help?
    </p>
    <div className="flex flex-wrap gap-2">
      {msg.referrals.map((ref, k) => {
        const team = SPECIALIST_TEAMS[ref.team];
        if (!team) return null;
        return (
          <button
            key={k}
            onClick={() => openEmailDraft(ref, team, msg)}
            className="inline-flex items-center gap-1.5 bg-blue-600/20 text-blue-400 text-xs px-3 py-1.5 rounded-full hover:bg-blue-600/30 transition-colors"
          >
            Draft email to {team.name}
          </button>
        );
      })}
    </div>
  </div>
)}
```

### 5e: `openEmailDraft` function

Assembles the draft from profile data and opens the modal:

```typescript
function openEmailDraft(referral: Referral, team: SpecialistTeam, msg: Message) {
  const name = clientProfile?.personal.firstName || 'there';
  const financialSummary = clientProfile?.summary || '';

  // Find the user message that preceded this assistant message
  const msgIndex = messages.indexOf(msg);
  const userQuestion = msgIndex > 0 ? messages[msgIndex - 1].content : '';

  const body = `Hi Team,

I'm working with the ILR program and had a question I'd like your help with:

"${userQuestion}"

${referral.reason}

${financialSummary ? `For context, here's a summary of my situation:\n${financialSummary}\n` : ''}I'd appreciate your guidance on this.

Thanks,
${name}`;

  setEmailDraft({
    team,
    subject: referral.suggestedSubject,
    body,
    userQuestion,
  });
}
```

### 5f: Render modal

```tsx
{emailDraft && (
  <EmailDraftModal
    team={emailDraft.team}
    subject={emailDraft.subject}
    body={emailDraft.body}
    replyTo={clientProfile?.personal.email || ''}
    senderName={clientProfile?.personal.firstName || ''}
    onClose={() => setEmailDraft(null)}
    onSent={() => setEmailDraft(null)}
  />
)}
```

---

## Step 6: Create EmailDraftModal component

**New file:** `packages/web/src/components/EmailDraftModal.tsx`

A modal component with:

**Props:**
- `team: SpecialistTeam` - recipient info
- `subject: string` - pre-filled subject
- `body: string` - pre-filled body
- `replyTo: string` - user's email (may be empty)
- `senderName: string` - user's first name
- `onClose: () => void`
- `onSent: () => void`

**State:**
- `editSubject`, `editBody`, `editReplyTo` - editable copies of props
- `sending` - loading state
- `error` - error message

**UI layout:**
- Overlay backdrop with centered modal (max-w-2xl)
- **To:** read-only field showing team name + email
- **Reply-To:** editable input, required before sending. Pre-filled from profile if available, otherwise empty with placeholder "Your email address"
- **Subject:** editable input
- **Body:** editable textarea (min 8 rows)
- **Buttons:** "Cancel" (secondary) and "Send Email" (primary, disabled while sending or if reply-to empty)
- Success toast on send, error message inline

**Send handler:**
```typescript
const res = await fetch('/api/email/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: team.email,
    replyTo: editReplyTo,
    subject: editSubject,
    body: editBody,
    senderName,
  }),
});
```

---

## Step 7: Create Resend API route

**Install:** `npm install resend -w @ilre/web`

**New file:** `packages/web/src/app/api/email/send/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { SPECIALIST_TEAMS } from '@/lib/specialists';

const resend = new Resend(process.env.RESEND_API_KEY);

// Only allow sending to known specialist emails
const ALLOWED_RECIPIENTS = new Set(
  Object.values(SPECIALIST_TEAMS).map(t => t.email)
);

export async function POST(req: NextRequest) {
  const { to, replyTo, subject, body, senderName } = await req.json();

  if (!ALLOWED_RECIPIENTS.has(to)) {
    return NextResponse.json({ error: 'Invalid recipient' }, { status: 400 });
  }

  if (!replyTo || !subject || !body) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { error } = await resend.emails.send({
    from: `${senderName || 'ILR Client'} via ILR Agents <noreply@ilragents.app>`,
    to,
    replyTo,
    subject,
    text: body,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

**Env var:** `RESEND_API_KEY` in `.env.local` and Railway.

**Sending domain:** Verify `ilragents.app` (or whatever domain) in Resend dashboard. Until verified, testing sends to your own email only.

---

## Step 8: Update tests

**File:** `packages/pipeline/src/pipeline/chat.test.ts`

- Add "mate" suppression test (Step 2c above)
- Add referral instructions test (Step 2c above)

**File:** `packages/web/src/lib/specialists.test.ts` (NEW)

- Test `parseReferrals` strips blocks and returns parsed referrals
- Test it handles malformed JSON gracefully
- Test it returns empty array when no referrals present

---

## Files Summary

| File | Change |
|------|--------|
| `packages/web/src/lib/stores/financial-store.ts` | Add `email`, `phone` to `PersonalBasics` |
| `packages/pipeline/src/pipeline/chat.ts` | Add "no mate" + referral instructions to prompt |
| `packages/pipeline/src/pipeline/chat.test.ts` | Add tests for new prompt sections |
| `packages/web/src/lib/specialists.ts` | **NEW** - Contact map, Referral type, parseReferrals |
| `packages/web/src/lib/specialists.test.ts` | **NEW** - Tests for parseReferrals |
| `packages/web/src/lib/stores/chat-store.ts` | Add `referrals` to Message type |
| `packages/web/src/components/ChatPanel.tsx` | Parse referrals, render cards, wire modal |
| `packages/web/src/components/EmailDraftModal.tsx` | **NEW** - Editable email draft modal |
| `packages/web/src/app/api/email/send/route.ts` | **NEW** - Resend API route with allowlist |
| `packages/web/package.json` | Add `resend` dependency |

## Verification

1. `npm test` - all existing + new tests pass
2. `npm run build -w @ilre/web` - no type errors
3. Dev test: ask Finance & Legal Team about trust structures, verify referral card appears
4. Click "Draft email" - modal opens with pre-filled content
5. Edit and send - verify email arrives (test with own email until domain verified)
6. Verify "mate" no longer appears in agent responses
