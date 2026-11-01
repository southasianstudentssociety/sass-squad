# SASS Hub

Members hub for the South Asian Student Society: events, member-only pricing and early access, QR tickets, and a door scanner.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, Auth) · Tailwind v4 · deploy on Vercel.

## What's in Phase 1

| Who | Can do |
|---|---|
| Anyone | Browse events, log in with an emailed one-time code (uni or Gmail), set their name |
| Members (email is on the member list and not expired) | Member price, early access, members-only events, one free ticket per event |
| Non-members | Get tickets at the non-member price. Paid tickets stay **Awaiting payment** until Finance marks them paid |
| Staff | Scan mode: camera QR scan, find by name, add walk-ins and comps, live check-in count |
| Admins | Create and edit events, confirm FPS payments, cancel tickets, undo check-ins, import and manage members, CSV and printable guest lists, assign roles |

All the ticket rules live in Postgres functions (`supabase/migrations/`), so they can't be bypassed from the browser:
- `claim_ticket`: membership, sales windows, capacity (row-locked), one ticket per person
- `check_in`: one atomic update, so two scanners can't both accept the same ticket. Returns *ok / already used / unpaid / cancelled / wrong event / invalid*
- `create_door_ticket`, `confirm_payment`, `cancel_ticket`, `undo_check_in`, `set_user_role`

## Setup

### 1. Supabase project
1. Create a project at supabase.com. Use a **society-owned email** so it survives committee handover.
2. Open the **SQL Editor**, paste in `supabase/migrations/20261101000000_init.sql` and run it.
   (Or with the CLI: `supabase link` then `supabase db push`.)
3. **Authentication → Sign In / Providers → Email:** enabled. "Confirm email" can stay on.
4. **Authentication → URL Configuration:** set Site URL to your deployed URL, and add `http://localhost:3000/**` and `https://YOUR-DOMAIN/**` to Redirect URLs.
5. **Authentication → Email Templates → Magic Link**, replace the body with:
   ```html
   <h2>Your SASS login code</h2>
   <p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
   <p>Or <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/tickets">tap here to log in</a>.</p>
   ```
   The code works on any device. The default link only works in the same browser that requested it.
6. **Set up custom SMTP (required before launch).** Supabase's built-in email sender allows only a handful of emails per hour. 220 people logging in for Diwali **will** hit that limit. Use Resend, Brevo or Postmark (all have free tiers) under **Authentication → Emails → SMTP Settings**, then raise the rate limit under **Authentication → Rate Limits**.

### 2. Run locally
```bash
cp .env.example .env.local   # fill in URL + publishable key from Supabase → Settings → API
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

1. **Admin → New event.** Set prices (member £0 = free member ticket), access, capacity, sales windows, and bank details for paid tickets. Tick **Published**.
2. Paid tickets: the attendee sees the amount and a unique reference like `SASS-7K3QX`. Finance checks the bank app and clicks **Mark paid** on the event page. Their QR code then appears.
3. **On the night:** print the guest list beforehand (**Admin → event → Printable guest list**). Staff open **Scan** on their phones.
   - Green = let in. Red **ALREADY USED** shows the time of the first scan, so check ID because it may be a shared screenshot.
   - **Find name** if someone's phone is dead. **Walk-in** for door payments and comps.

## Known limits and what's next
- Payments are checked by hand. A bank-statement CSV matcher is the planned Phase 2 upgrade.
- Unpaid tickets count towards capacity until an admin cancels them.
- A member who logs in with a different email from the one on the member list isn't recognised. Add it as their **Alt email**.
- The scanner needs a connection. If the venue has no signal, use the printed list.
- Brand colours are placeholders in `src/app/globals.css` (`:root`). Swap in the official palette.
- Gallery (Phase 3) is not built yet.
