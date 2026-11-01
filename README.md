# SASS Hub

Members hub for the South Asian Student Society: events, member-only pricing and early access, QR tickets, and a door scanner.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, Auth; Singapore region) · Tailwind v4 · deploy on Vercel.

Built for Hong Kong: prices in HK$, times in Hong Kong time (`TIME_ZONE` in `src/lib/format.ts`, plus `Asia/Hong_Kong` in the membership expiry check in the migrations).

## What's in Phase 1

| Who | Can do |
|---|---|
| Anyone | Browse events, log in with Google or an emailed one-time code (uni or Gmail), set their name |
| Members (email is on the member list and not expired) | Member price, early access, members-only events, one free ticket per event |
| Non-members | Get tickets at the non-member price. Paid tickets stay **Awaiting payment** until Finance marks them paid |
| Staff | Scan mode: camera QR scan, find by name, add walk-ins and comps, live check-in count. Only from 24h before an event until 12h after it ends; they can't see other people's profiles or other events' attendees |
| Admins | Create and edit events, confirm FPS payments, cancel tickets, undo check-ins, import and manage members, CSV and printable guest lists, assign roles |

All the ticket rules live in Postgres functions (`supabase/migrations/`), so they can't be bypassed from the browser:
- `claim_ticket`: membership, sales windows, capacity (row-locked), one ticket per person
- `check_in`: one atomic update, so two scanners can't both accept the same ticket. Returns *ok / already used / unpaid / cancelled / wrong event / invalid*
- `create_door_ticket`, `confirm_payment`, `cancel_ticket`, `undo_check_in`, `set_user_role`

## Setup

### 1. Supabase project
The project already exists: **sass-squad** in the **SASS Org** organisation, region Singapore (`ap-southeast-1`), URL `https://cvtxpnwfkowaggyzrbai.supabase.co`. Both migrations in `supabase/migrations/` have been applied. New committee members should be invited to SASS Org under their own account, not given a shared login.

To set up a fresh project instead, run the files in `supabase/migrations/` in order in the SQL Editor, or use `supabase link` then `supabase db push`.

Remaining dashboard steps:

3. **Authentication → Sign In / Providers → Email:** enabled. "Confirm email" can stay on.
4. **Authentication → URL Configuration:** set Site URL to your deployed URL, and add `http://localhost:3000/**` and `https://YOUR-DOMAIN/**` to Redirect URLs.
5. **Authentication → Email Templates:** update **both** "Confirm signup" (sent the first time someone logs in) and "Magic Link" (every login after that). Replace each body with the template below and click **Save** on each:
   ```html
   <h2>Your SASS login code</h2>
   <p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
   <p>Or <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/tickets">tap here to log in</a>.</p>
   ```
   The code works on any device. The default link only works in the same browser that requested it.
6. **Custom SMTP (required).** Supabase's built-in sender only emails members of the Supabase organisation, and email templates can't be edited until custom SMTP is on. Without a domain, send through the society Gmail:
   - On the Gmail account: turn on 2-Step Verification, then create an App Password (Google Account → Security → App passwords).
   - **Authentication → Emails → SMTP Settings:** host `smtp.gmail.com`, port `587`, username = the Gmail address, password = the app password, sender email = the same address, sender name `SASS`.
   - Then edit the templates (step 5) and raise **Authentication → Rate Limits → emails per hour**.
   - Gmail caps at about 500 emails/day. If that, or HKUST junk filtering, becomes a problem, buy a domain and switch to Resend.
7. **Sign in with Google:**
   - In [Google Cloud Console](https://console.cloud.google.com), signed in as the society Gmail, create a project called "SASS Hub".
   - **APIs & Services → OAuth consent screen:** choose External, app name "SASS", support email = society Gmail. Scopes: only the defaults (email, profile, openid). Then **Publish app**. While it's in "Testing", only listed test users can sign in.
   - **Credentials → Create credentials → OAuth client ID → Web application.** Authorised redirect URI: `https://cvtxpnwfkowaggyzrbai.supabase.co/auth/v1/callback`
   - Copy the client ID and secret into Supabase **Authentication → Sign In / Providers → Google**, and enable it.

### 2. Run locally
```bash
cp .env.example .env.local   # already points at the sass-squad project
npm install
npm run dev
```

### 3. Make yourself admin
Log in once on the site, then in the Supabase SQL Editor run:
```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```
After that, add other staff and admins from **Admin → Staff & roles**.

### 4. Import members
Google Sheet: **File → Download → CSV**, then **Admin → Members → Import**. You need `Name` and `Email` columns. Optional columns: `Alt email`, `Student ID`, `Purchased`, `Valid until` (DD/MM/YYYY). Re-importing updates existing rows by email. From now on, **manage members in the app**, not the Sheet.

### 5. Deploy
Import the repo in Vercel and set the three env vars from `.env.example` (`NEXT_PUBLIC_SITE_URL` = your production URL). The camera scanner needs **HTTPS**, which Vercel provides.

## Running an event

1. **Admin → New event.** Set prices (member HK$0 = free member ticket), access, capacity, sales windows, and FPS details for paid tickets. Tick **Published**.
2. Paid tickets: the attendee sees the amount and a unique reference like `SASS-7K3QX`. Finance checks the FPS transfers in their banking app and clicks **Mark paid** on the event page. Their QR code then appears.
3. **On the night:** print the guest list beforehand (**Admin → event → Printable guest list**). Staff open **Scan** on their phones.
   - Green = let in. Red **ALREADY USED** shows the time of the first scan, so check ID because it may be a shared screenshot.
   - **Find name** if someone's phone is dead. **Walk-in** for door payments and comps.

## Known limits and what's next
- Payments are checked by hand. A bank-statement CSV matcher is the planned Phase 2 upgrade.
- Unpaid tickets count towards capacity until an admin cancels them.
- A member who logs in with a different email from the one on the member list isn't recognised. Add it as their **Alt email**.
- The scanner needs a connection. If the venue has no signal, use the printed list.
- Brand palette and Berkshire Swash are in `src/app/globals.css`. Amoresa Aged and Maragsa (from the marketing doc) are paid fonts and aren't included. The logo image isn't added yet.
- Gallery (Phase 3) is not built yet.
