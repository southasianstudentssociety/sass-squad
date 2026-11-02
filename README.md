# SASS Hub

Members hub for the South Asian Student Society: events, member-only pricing and early access, QR tickets, and a door scanner.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, Auth; Singapore region) · Tailwind v4 · deploy on Vercel.

Built for Hong Kong: prices in HK$, times in Hong Kong time (`TIME_ZONE` in `src/lib/format.ts`, plus `Asia/Hong_Kong` in the membership expiry check in the migrations).

## What's in Phase 1

| Who | Can do |
|---|---|
| Anyone | Browse events, log in with Google or an emailed one-time code (uni or Gmail), set their name |
| Anyone logged in (membership) | Join at **/membership**: pay the offer by FPS with a `MEM-` reference; once ExCo confirms, they're added to (or renewed on) the member list and member prices apply immediately. Free offers confirm instantly |
| People who came to an event | Rate it 1–5 with an optional comment, anonymously if they like, for 30 days after it starts |
| Members (email is on the member list and not expired) | Member price, early access, members-only events, one free ticket per event |
| Non-members | Get tickets at the non-member price. Paid tickets stay **Awaiting payment** until Finance marks them paid |
| Subcommittee and door volunteers | Scan mode: camera QR scan, find by name, add walk-ins and comps, live check-in count. Only from 24h before an event until 12h after it ends; they can't see other people's profiles or other events' attendees |
| Team members (ExCo and subcommittee) | Submit reimbursement claims with a receipt photo, see their status, fix and resubmit if rejected |
| Team members (tasks) | See every department's tasks; add and edit tasks in their own departments (ExCo: any department); move tasks they own between To do, Doing, Blocked (with a reason) and Done |
| Team members (inventory) | See what the society owns, where it is and who has it; check items out to a team member and record returns |
| Finance (ExCo in a department marked *handles finance*) | See every claim and receipt, approve or reject, mark paid, download all claims as CSV. Nobody reviews or pays their own claim, except the Finance department's ExCo (the VP of Finance): their self-approvals are allowed but always marked **self-approved** on the claim, in the Finance list and in the CSV, and counted for hub owners. **Event budgets**: record the society's own spending per event (venue, alcohol, food, ...), void mistakes with a reason, and see each event's income, costs and net, with a CSV for the treasurer |
| ExCo (memberships, feedback, attendance) | Publish membership offers and confirm payments (Admin → Memberships); read each event's feedback (names hidden for anonymous ones, enforced in the database); see regulars, turn-up rates and active members who haven't come yet (Admin → Attendance) |
| ExCo (door live) | Per-event live dashboard: arrived vs confirmed, check-in rate, still to arrive, rejections by type, arrivals chart, latest scans by volunteer. Refreshes every 10 s |
| ExCo | Create and edit events, confirm FPS payments, cancel tickets, undo check-ins, import and manage members, CSV and printable guest lists, manage the team |

**Hub owners** (a small list, e.g. the President and the internal-affairs lead) are the only people who can change the team: add or end memberships, create or rename departments, choose which department handles finance, give door access, and add or remove owners. They also count as Finance. Owners pass the role on; the app won't remove the last one.

Access comes from **Admin → Team**: each person has a department, a position (ExCo or subcommittee) and a term with an end date. Access stops automatically after the last day of the term, so handover doesn't depend on anyone remembering to remove people. Door volunteers who aren't on the team get scanner-only access with its own expiry date. The app won't let you end the last active ExCo membership, and warns when every ExCo's term ends within 30 days.

All the ticket rules live in Postgres functions (`supabase/migrations/`), so they can't be bypassed from the browser:
- `claim_ticket`: membership, sales windows, capacity (row-locked), one ticket per person
- `preview_ticket` then `check_in`: door staff see the result first (it stays on screen), then swipe to admit. `check_in` is one atomic update, so two scanners can't both accept the same ticket. Returns *ok / already used / unpaid / cancelled / wrong event / invalid*
- `create_door_ticket`, `confirm_payment`, `cancel_ticket`, `undo_check_in`
- `submit_claim`, `revise_claim`, `withdraw_claim`, `review_claim`, `mark_claim_paid`: reimbursements. Claims are never edited: a change is a new revision, every status change is logged with who, when and which revision, and approval is tied to the revision Finance actually saw. Receipts live in the private `receipts` Storage bucket (uploaded straight from the phone, readable only by the claimant and Finance, can't be overwritten or deleted)
- `create_task`, `update_task`, `set_task_status`: department task tracker. Tasks are cancelled, never deleted, and every change is logged in `task_log`
- `create_inventory_item`, `update_inventory_item`, `adjust_inventory`, `check_out_item`, `return_item`, `retire_inventory_item`: inventory. Team members check out and return; ExCo adds, edits, recounts and retires. Partial loans are supported, items not returned are logged as lost and taken off the count, and every change goes to `inventory_log`
- `add_team_member`, `end_team_membership`, `set_door_staff`, `remove_door_staff`, `my_access`: team and access. RLS uses `private.is_admin()` (active ExCo) and `private.is_staff()` (active team member or door volunteer)

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
   <p>Type this code on the SASS login page.</p>
   <p>If you didn't try to log in to SASS, ignore this email.</p>
   ```
   Set the subject of both to `Your SASS login code`. The template deliberately has **no link**: HKUST's Microsoft 365 filter sent emails containing a `*.vercel.app` link to Junk. The code also works on any device, unlike a link. If you move to a custom domain and a domain-based sender, a link can come back.
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

### 3. Make yourself ExCo and hub owner
Log in once on the site, then in the Supabase SQL Editor run (replace the email and department):
```sql
insert into public.departments (name) values ('Internal Affairs') on conflict (name) do nothing;
insert into public.team_memberships (user_id, department_id, position, starts_on, ends_on)
select p.id, d.id, 'exco', current_date, private.current_term_end()
from public.profiles p, public.departments d
where p.email = 'you@example.com' and d.name = 'Internal Affairs';
insert into public.hub_owners (user_id) select id from public.profiles where email = 'you@example.com';
```
After that, add everyone else from **Admin → Team**. The same SQL is how you get back in if every ExCo's term has ended or no owner is left.

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

## Design
Minimal: warm off-white page, white surfaces, hairline borders, SASS red for actions only, the full palette as a thin signature stripe. Type is Geist (`geist` package); the Berkshire Swash script face is used only for the SASS wordmark.
- **Components:** shadcn-style source components on [Base UI](https://base-ui.com) (the header's Team and account menus), styled with Tailwind v4. Shared classes (`btn-primary`, `card`, `card-link`, `input`, `badge`, `table`, `eyebrow`, `skeleton`) live in `src/app/globals.css`.
- **Motion:** [`motion`](https://motion.dev) for page transitions, staggered lists and the sliding nav highlight; CSS keyframes for small effects. Everything respects the phone's *reduce motion* setting. The door scanner has no decorative motion, only a quick pop on each result.
- **Illustrations:** [unDraw](https://undraw.co) by Katerina Limpitsouni (free, no attribution required; not to be redistributed as a pack), taken from the `undraw-svg` npm package and stored in `src/components/illustrations/data.ts`. Their accent colour follows `currentColor`, so they pick up SASS red. They're rendered on the server only, so they never add to the JavaScript bundle.

