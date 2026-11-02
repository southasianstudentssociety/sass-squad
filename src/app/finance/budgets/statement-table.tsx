import { money, type Statement } from "@/lib/budgets";
import { cn } from "@/lib/utils";

/** Income statement: income by category, costs by category, net. "Auto" rows come from the hub itself. */
export function StatementTable({ st }: { st: Statement }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="sheet">
        <tbody>
          <Heading label="Income" />
          {st.income.length === 0 && <Empty />}
          {st.income.map((g) => <Line key={`i${g.category}${g.auto}`} label={g.category} auto={g.auto} cents={g.cents} />)}
          <Total label="Total income" cents={st.totalIncome} />
          <Heading label="Expenses" />
          {st.expenses.length === 0 && <Empty />}
          {st.expenses.map((g) => <Line key={`e${g.category}${g.auto}`} label={g.category} auto={g.auto} cents={-g.cents} />)}
          <Total label="Total expenses" cents={-st.totalExpenses} />
        </tbody>
        <tfoot>
          <tr>
            <td className="text-base">Net {st.net >= 0 ? "surplus" : "deficit"}</td>
            <td className={cn("text-right text-lg tabular-nums", st.net >= 0 ? "text-ok" : "text-bad")}>{money(st.net)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Heading({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={2} className="!bg-page text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</td>
    </tr>
  );
}

function Line({ label, auto, cents }: { label: string; auto: boolean; cents: number }) {
  return (
    <tr>
      <td className="pl-6">
        {label}
        {auto && <span className="badge ml-2 bg-sass-blue/10 text-sass-blue" title="Calculated by the hub, always up to date">auto</span>}
      </td>
      <td className="text-right tabular-nums">{money(cents)}</td>
    </tr>
  );
}

function Total({ label, cents }: { label: string; cents: number }) {
  return (
    <tr>
      <td className="font-medium">{label}</td>
      <td className="text-right font-medium tabular-nums">{money(cents)}</td>
    </tr>
  );
}

function Empty() {
  return (
    <tr>
      <td colSpan={2} className="pl-6 text-muted">Nothing yet</td>
    </tr>
  );
}
