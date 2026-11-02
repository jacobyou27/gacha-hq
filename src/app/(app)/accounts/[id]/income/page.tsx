import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { defaultCaughtUp, loadAccountIncome } from "@/lib/income/load";
import { parseDay } from "@/lib/farm/schedule";
import { vkey } from "@/lib/calendar";
import type { Banner, Character, IncomeItem } from "@/lib/types";
import { IncomePlanner } from "./planner";

export default async function IncomePage({ params, searchParams }: PageProps<"/accounts/[id]/income">) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const saved = typeof sp.saved === "string" ? sp.saved : "0";
  const { account, items, marks, rows, today, current, canEdit } = await loadAccountIncome(id);

  // the browser only needs what the forecast reads: content, web lines and the Battle Pass rows
  const slim: IncomeItem[] = items
    .filter((i) => i.section !== "recurring" || /^Battle Pass/i.test(i.name))
    .map((i) => ({ ...i, resin: 0, mora: 0, extra: {}, note: null }));

  const supabase = await createClient();
  const [{ data: banners }, { data: chars }] = await Promise.all([
    supabase.from("banners").select("*").eq("game_id", account.game_id).returns<Banner[]>(),
    supabase.from("characters").select("id, name").eq("game_id", account.game_id).returns<Pick<Character, "id" | "name">[]>(),
  ]);
  const charName = new Map((chars ?? []).map((c) => [c.id, c.name]));
  const phases = rows.filter((r) => r.end >= today).flatMap((r) => [1, 2].map((ph) => {
    const day = r.start + (ph === 2 ? 21 : 0);
    const featured = (banners ?? []).filter((b) => b.version === r.version && b.phase === ph).map((b) => charName.get(b.character_id) ?? "?").join(", ");
    return { key: `${r.version}-${ph}`, label: `${r.version}${r.estimate ? "?" : ""} Phase ${ph}`, day, featured, end: ph === 1 ? r.start + 20 : r.end };
  })).filter((p) => p.end >= today).slice(0, 8).map((p) => ({ key: p.key, label: p.label, day: p.day, featured: p.featured }));

  const versions = [...new Set(items.map((i) => i.version))].sort((a, b) => vkey(b) - vkey(a));
  const acc = (account.settings ?? {}) as Record<string, unknown>;
  const raw = (acc.income ?? {}) as Record<string, unknown>;
  const untilParam = typeof sp.until === "string" ? parseDay(sp.until) : NaN;
  const nextV = rows.find((r) => r.start > today);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold">Primogem forecast · {account.name}</h1>
        <Link href={`/accounts/${id}`} className="text-sm underline">← account</Link>
        <Link href={`/calendar?game=${account.game_id}&account=${id}`} className="text-sm underline">banner calendar</Link>
        <Link href={`/income?game=${account.game_id}`} className="text-sm underline">where the numbers come from</Link>
      </div>
      <IncomePlanner
        key={saved}
        accountId={id} canEdit={canEdit} items={slim} marks={Object.fromEntries(marks)} raw={raw} defaultCaughtUp={defaultCaughtUp(items, current)}
        rows={rows} today={today} phases={phases} versions={versions} error={error} hasSettings={Object.keys(raw).length > 0}
        initialUntil={Number.isFinite(untilParam) ? untilParam : nextV ? nextV.end : today + 30}
      />
    </div>
  );
}
