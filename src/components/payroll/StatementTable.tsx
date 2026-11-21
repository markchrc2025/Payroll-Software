/** Wave G2 (PAY-217): the Annual Salary Statement as a table (dashboard and ESS). */
import { STATEMENT_COLUMNS, type Statement } from "@/lib/payroll/annual-statement-view";

const peso = (c: string) => (Number(c) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function StatementTable({ st }: { st: Statement }) {
  const head = "px-2 py-2 text-right text-[11.5px] font-semibold text-[#6B6B6B] whitespace-nowrap";
  return (
    <div className="rounded-lg border bg-white overflow-x-auto">
      <table className="w-full">
        <thead className="border-b bg-[#FAFAFA]"><tr><th className={`${head} text-left`}>Month</th>{STATEMENT_COLUMNS.map(([k, l]) => <th key={k} className={head}>{l}</th>)}</tr></thead>
        <tbody>
          {[...st.rows, st.total].map((r) => (
            <tr key={r.month} className={`border-b last:border-0 ${r.month === "Total" ? "font-semibold bg-[#FAFAFA]" : ""}`}>
              <td className="px-2 py-1.5 text-[12.5px]">{r.month}</td>
              {STATEMENT_COLUMNS.map(([k]) => <td key={k} className="px-2 py-1.5 text-right text-[12.5px] tabular-nums">{peso(r[k])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
