import "server-only";
import type { GameId } from "./types";

/**
 * Reads a player's in-game signature through Enka.Network's public API — the
 * same source most Genshin / HSR / ZZZ trackers use. WuWa has no public API.
 * Enka caches profiles for ~60 s, so a freshly changed signature can take a
 * minute to show up.
 */
export const VERIFIABLE_GAMES: GameId[] = ["genshin", "hsr", "zzz"];

const USER_AGENT = "GachaHQ/1.0 (+https://gacha-hq.vercel.app)";

type SignatureResult =
  | { ok: true; signature: string; nickname: string | null }
  | { ok: false; error: string };

export async function fetchSignature(game: GameId, uid: string): Promise<SignatureResult> {
  if (!/^\d{5,12}$/.test(uid)) return { ok: false, error: "UID must be 5–12 digits." };

  const base = "https://enka.network/api";
  const url =
    game === "genshin" ? `${base}/uid/${uid}?info`
    : game === "hsr" ? `${base}/hsr/uid/${uid}?info`
    : game === "zzz" ? `${base}/zzz/uid/${uid}?info`
    : null;
  if (!url) return { ok: false, error: "This game has no public profile API; verification is not available." };

  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
  } catch {
    return { ok: false, error: "Could not reach Enka.Network. Try again in a minute." };
  }

  if (res.status === 400) return { ok: false, error: "Enka rejected that UID format." };
  if (res.status === 404) return { ok: false, error: "Enka has no profile for that UID (is the UID right, and is 'Show Character Details' on?)." };
  if (res.status === 424) return { ok: false, error: "Enka is under maintenance (game update). Try later." };
  if (res.status === 429) return { ok: false, error: "Enka rate limit hit. Wait a minute and try again." };
  if (!res.ok) return { ok: false, error: `Enka returned HTTP ${res.status}.` };

  const json = (await res.json()) as Record<string, unknown>;
  const get = (path: string[]) => path.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), json);

  const signature =
    game === "genshin" ? get(["playerInfo", "signature"])
    : game === "hsr" ? get(["detailInfo", "signature"])
    : get(["PlayerInfo", "SocialDetail", "Desc"]);
  const nickname =
    game === "genshin" ? get(["playerInfo", "nickname"])
    : game === "hsr" ? get(["detailInfo", "nickname"])
    : get(["PlayerInfo", "SocialDetail", "ProfileDetail", "Nickname"]);

  return {
    ok: true,
    signature: typeof signature === "string" ? signature : "",
    nickname: typeof nickname === "string" ? nickname : null,
  };
}

/** True when the signature contains the challenge code (case/whitespace-insensitive). */
export function signatureMatches(signature: string, code: string) {
  const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
  return norm(signature).includes(norm(code));
}
