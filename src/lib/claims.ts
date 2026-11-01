import type { ClaimStatus, PayoutMethod } from "@/lib/types";

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; cls: string }> = {
  submitted: { label: "Waiting for Finance", cls: "bg-warn/10 text-warn" },
  approved: { label: "Approved, not paid yet", cls: "bg-accent text-accent-ink" },
  rejected: { label: "Rejected", cls: "bg-bad/10 text-bad" },
  paid: { label: "Paid", cls: "bg-ok/10 text-ok" },
  withdrawn: { label: "Withdrawn", cls: "bg-ink/10 text-ink" },
};

export const PAYOUT_METHODS: Record<PayoutMethod, { label: string; detailsLabel: string | null }> = {
  fps: { label: "FPS", detailsLabel: "FPS ID, phone or email" },
  payme: { label: "PayMe", detailsLabel: "PayMe phone number" },
  bank_transfer: { label: "Bank transfer", detailsLabel: "Bank, account name and number" },
  cash: { label: "Cash", detailsLabel: null },
};

export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
