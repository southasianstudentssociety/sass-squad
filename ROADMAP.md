# SASS Hub roadmap

Scope agreed so far. Build one module at a time; each must survive real use before the next starts.

## Phase 1: Ticketing (built, not yet used at a real event)
Events, member pricing and early access, QR tickets, door scanner, FPS payment confirmation, member list.

## Phase 2: Team model (built, not yet used by the real team)
The hub serves two groups: **members** (attendees) and the **team** (ExCos and subcommittee members), organised into **departments**.
- Replace the single `user | staff | admin` role with team membership per academic term: person, department, position (ExCo / subcommittee), term start and end.
- Permissions come from position and department (e.g. Finance ExCo approves reimbursements, department heads see their department's work).
- Access expires automatically at the end of the term, so handover doesn't depend on someone remembering to remove people.
- Door-scanning access stays separate: it's needed by volunteers who aren't on the team.

## Phase 3: Reimbursements (built, not yet used for a real claim)
A subcommittee member submits a claim (event, amount, description, receipt photo, how they want to be paid). Finance approves or rejects it and marks it paid.
- Receipts go in a **private** Supabase Storage bucket, visible only to the claimant and Finance.
- Claims can't be edited after submission; changes are a new revision. Every status change records who made it and when.
- Export for the treasurer's records and audits.

## Phase 4: Inventory (built, not yet stocked)
Items the society owns (decorations, equipment, leftover stock): quantity, location, condition, who has it, and when it was checked out or returned, with history.

## Phase 5: Department task tracker (built, not yet used)
Tasks per department and event, with owner, due date and status.
**Decision (1 Nov 2026):** built because the team committed to moving off their current tool. If it isn't in regular use by the end of December, remove it from the nav rather than keep two places for tasks.

## Built beyond the original phases (Nov 2026)
Swipe-to-confirm check-in, ticket tear-off on check-in, six-month team calendar, door live dashboard, add-to-calendar, event budgets with Finance expenses, membership purchase in the app, event feedback and attendance. All built 1–2 Nov 2026; none has been used at a real event yet.

## Changed 2 Nov 2026
- **Door volunteers removed from the app.** Only team members scan. The `door_staff` table and RPCs are still in the database (unused); drop them in a later cleanup migration.
- **Event budgets became Accounts**: income as well as expenses, a year statement and an opening bank balance. Ticket sales, memberships and reimbursements are automatic lines rather than an "import", so they can't be counted twice or go out of date.
- **Inventory**: person in charge and transfers. **Tasks**: Add task pop-up, card/table views.

- **Team prices** per event (only the team sees them; place reserved) and **team-only membership offers**. Normal ticket buying (`claim_ticket`) was deliberately not changed; team tickets use their own `claim_team_ticket`.

- **Gallery** on the home page: photos uploaded on Admin → Gallery (public `gallery` bucket), "View all photos" opens the Drive folder.

## On hold
- **Waitlist for sold-out events.** Decided 2 Nov 2026 to hold it. It changes `claim_ticket`, the function every ticket purchase goes through, so it waits until after Diwali (21 Nov) and until an event actually sells out. Revisit then.

## Not started
- Bank statement CSV matcher for FPS payments (recommended next: removes hand-ticking "Mark paid" for every FPS ticket)
