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

## Phase 3: Reimbursements
A subcommittee member submits a claim (event, amount, description, receipt photo, how they want to be paid). Finance approves or rejects it and marks it paid.
- Receipts go in a **private** Supabase Storage bucket, visible only to the claimant and Finance.
- Claims can't be edited after submission; changes are a new revision. Every status change records who made it and when.
- Export for the treasurer's records and audits.

## Phase 4: Inventory
Items the society owns (decorations, equipment, leftover stock): quantity, location, condition, who has it, and when it was checked out or returned, with history.

## Phase 5: Department task tracker
Tasks per department and event, with owner, due date and status.
**Open question:** Notion, Trello or a shared Sheet may already do this better for free. Only build it if the team will actually move off their current tool.

## Not started
- Gallery (embeds and Supabase Storage)
- Bank statement CSV matcher for FPS payments
