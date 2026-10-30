import { loadFarm } from "@/lib/farm/load";
import { fmtDay } from "@/lib/farm/schedule";
import { FarmNav } from "../ui";

export default async function SchedulePage({ params }: PageProps<"/accounts/[id]/farm/schedule">) {
  const { id } = await params;
  const { account, game, plan } = await loadFarm(id);
  return (
    <div className="flex flex-col gap-4">
      <FarmNav id={id} game={game} account={account} active="schedule" />
      <p className="text-sm text-neutral-600">Weekly bosses first, then each build in plan order: talent domains on their weekdays, weapon domains, bosses, then ley lines. Plan starts {fmtDay(plan.start)}{plan.carry ? ` with ${plan.carry} banked` : ""}; leftovers {plan.settings.cap > 0 ? `above ${plan.settings.cap} are lost` : "go to artifacts"}.</p>
      <table className="table text-sm">
        <thead><tr><th>Date</th><th>Spent</th><th>Left</th><th>What to farm</th></tr></thead>
        <tbody>
          {plan.days.map((d) => (
            <tr key={d.abs} className={d.abs === plan.today ? "bg-blue-50 font-medium" : d.off ? "text-neutral-400 italic" : ""}>
              <td className="whitespace-nowrap">{fmtDay(d.abs)}</td><td>{d.spent}</td><td>{d.left}</td><td>{d.text}</td>
            </tr>
          ))}
          {plan.days.length === 0 && <tr><td colSpan={4} className="text-neutral-500">Nothing to farm — add builds first.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
