import { redirect } from "next/navigation";

// Staff & roles moved to the Team page in Phase 2.
export default function StaffPage() {
  redirect("/admin/team");
}
