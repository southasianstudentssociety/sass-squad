export type TeamPosition = "exco" | "subcommittee";
export type TicketStatus = "awaiting_payment" | "confirmed" | "cancelled";
export type TicketSource = "online" | "walk_in" | "comp";
export type EventAccess = "everyone" | "members_only";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  onboarded: boolean;
};

/** What the signed-in user may do, from public.my_access(). The database enforces it too. */
export type Access = {
  /** Active ExCo membership: events, members, payments, team. */
  isAdmin: boolean;
  /** Active team membership or door-volunteer grant: the scanner. */
  isStaff: boolean;
  /** Active team membership (ExCo or subcommittee): can submit reimbursement claims. */
  isTeam: boolean;
  /** Active ExCo in a department that handles finance: reviews and pays claims. */
  isFinance: boolean;
  /** Default end date for new memberships (31 Aug of this academic year). */
  termEnd: string;
};

export type Department = { id: string; name: string; handles_finance: boolean };

export type TeamMembership = {
  id: string;
  user_id: string;
  department_id: string;
  position: TeamPosition;
  title: string | null;
  starts_on: string;
  ends_on: string;
};

export type DoorStaff = { user_id: string; expires_on: string };

export type Member = {
  id: string;
  full_name: string;
  email: string;
  alt_email: string | null;
  student_id: string | null;
  purchased_at: string | null;
  valid_until: string;
  notes: string | null;
};

export type SassEvent = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  venue: string | null;
  starts_at: string;
  ends_at: string | null;
  cover_image_url: string | null;
  is_published: boolean;
  access: EventAccess;
  member_price_cents: number;
  public_price_cents: number;
  capacity: number | null;
  member_sales_open_at: string | null;
  public_sales_open_at: string | null;
  sales_close_at: string | null;
  payment_instructions: string | null;
};

export type Ticket = {
  id: string;
  event_id: string;
  user_id: string | null;
  holder_name: string;
  holder_email: string | null;
  is_member: boolean;
  price_cents: number;
  status: TicketStatus;
  source: TicketSource;
  payment_reference: string;
  qr_token: string;
  confirmed_at: string | null;
  checked_in_at: string | null;
  notes: string | null;
  created_at: string;
};

export type ScanResult =
  | "ok"
  | "already_used"
  | "unpaid"
  | "cancelled"
  | "wrong_event"
  | "invalid";

export type CheckInResponse = {
  result: ScanResult;
  ticket: {
    id: string;
    holder_name: string;
    holder_email: string | null;
    is_member: boolean;
    member_now: boolean;
    price_cents: number;
    status: TicketStatus;
    source: TicketSource;
    payment_reference: string;
    checked_in_at: string | null;
  } | null;
};

export type ClaimStatus = "submitted" | "approved" | "rejected" | "paid" | "withdrawn";
export type PayoutMethod = "fps" | "bank_transfer" | "payme" | "cash";

export type Claim = {
  id: string;
  reference: string;
  claimant_id: string;
  status: ClaimStatus;
  current_revision: number;
  created_at: string;
  updated_at: string;
};

export type ClaimRevision = {
  claim_id: string;
  revision: number;
  event_id: string | null;
  amount_cents: number;
  description: string;
  payout_method: PayoutMethod;
  payout_details: string | null;
  receipt_path: string;
  created_at: string;
};

export type ClaimEvent = {
  id: number;
  claim_id: string;
  revision: number;
  from_status: ClaimStatus | null;
  to_status: ClaimStatus;
  actor_id: string | null;
  note: string | null;
  created_at: string;
};
