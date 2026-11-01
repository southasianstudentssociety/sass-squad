import { requireFinance } from "@/lib/auth";
import { FinanceTabs } from "./finance-tabs";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  await requireFinance("/finance");
  return (
    <div className="space-y-6">
      <FinanceTabs />
      {children}
    </div>
  );
}
