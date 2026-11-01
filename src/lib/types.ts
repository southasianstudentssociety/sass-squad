export type UserRole = "user" | "staff" | "admin";
export type TicketStatus = "awaiting_payment" | "confirmed" | "cancelled";
export type TicketSource = "online" | "walk_in" | "comp";
export type EventAccess = "everyone" | "members_only";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  onboarded: boolean;
};

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
