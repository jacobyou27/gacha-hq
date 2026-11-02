/**
 * Version calendar for any game: every known game_versions row, then 42-day projections after the latest one.
 * Days are integers (days since the Unix epoch, UTC) like the planner.
 */
import type { GameVersion } from "@/lib/types";
import { parseDay } from "@/lib/farm/schedule";

export type VersionRow = { version: string; start: number; end: number; estimate: boolean; projected: boolean };

/** minor versions per major: Genshin x.0–x.7 (8 minors), others x.0–x.8 */
export const minorsPerMajor = (gameId: string) => (gameId === "genshin" ? 8 : 9);
export const vkey = (v: string) => { const [a, b] = v.replace(/[^\d.]/g, "").split(".").map(Number); return (a || 0) * 100 + (b || 0); };

export function versionRows(versions: GameVersion[], gameId: string, future = 8, length = 42): VersionRow[] {
  const known = versions.filter((x) => x.game_id === gameId && x.starts_on).sort((a, b) => parseDay(a.starts_on!) - parseDay(b.starts_on!));
  if (!known.length) return [];
  const rows: VersionRow[] = known.map((k, i) => {
    const start = parseDay(k.starts_on!);
    const next = known[i + 1];
    const end = k.ends_on ? parseDay(k.ends_on) : next ? parseDay(next.starts_on!) - 1 : start + length - 1;
    return { version: k.version, start, end, estimate: k.is_estimate, projected: false };
  });
  const per = minorsPerMajor(gameId);
  const last = rows[rows.length - 1];
  const [maj, min] = last.version.split(".").map(Number);
  let s = last.end + 1;
  for (let n = 1; n <= future; n++) {
    const i = maj * per + min + n;
    rows.push({ version: `${Math.floor(i / per)}.${i % per}`, start: s, end: s + length - 1, estimate: true, projected: true });
    s += length;
  }
  return rows;
}

export const versionAt = (rows: VersionRow[], day: number) => rows.find((r) => day >= r.start && day <= r.end) ?? null;
