import Link from "next/link";
import type { Game, GameAccount } from "@/lib/types";

export function FarmNav({ id, game, account, active }: { id: string; game: Game; account: GameAccount; active: "builds" | "inventory" | "schedule" | "log" }) {
  const tabs = [["builds", "", "Builds & today"], ["inventory", "/inventory", "Inventory"], ["schedule", "/schedule", "Schedule"], ["log", "/log", "Log"]] as const;
  return (
    <div>
      <Link href={`/accounts/${id}`} className="text-sm underline">← {game.name} · {account.name}</Link>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold">{game.stamina_name} planner · {account.name}</h1>
        <nav className="flex gap-2 text-sm">
          {tabs.map(([key, path, label]) => (
            <Link key={key} href={`/accounts/${id}/farm${path}`} className={key === active ? "font-medium underline" : "text-neutral-600 hover:underline"}>{label}</Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

/** Done / Skip / Undo buttons for one day (server-action forms). */
export function DayButtons({ id, day, logged, skipped, action, returnTo = "" }: { id: string; day: string; logged: boolean; skipped: boolean; action: (f: FormData) => Promise<void>; returnTo?: string }) {
  const btn = (mode: string, label: string, primary = false) => (
    <form action={action} className="inline">
      <input type="hidden" name="account_id" value={id} /><input type="hidden" name="day" value={day} /><input type="hidden" name="mode" value={mode} /><input type="hidden" name="return" value={returnTo} />
      <button className={primary ? "btn" : "btn-secondary"} type="submit">{label}</button>
    </form>
  );
  if (logged || skipped) return btn("undo", logged ? "✓ Done · undo" : "✕ Skipped · undo");
  return <span className="flex gap-1">{btn("done", "Done", true)}{btn("skip", "Skip")}</span>;
}
