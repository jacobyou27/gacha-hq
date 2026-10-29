"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSignature, signatureMatches, VERIFIABLE_GAMES } from "@/lib/enka";
import type { GameId } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Where to send the user back to: the account page, or the Claim page. */
function target(form: FormData, accountId: string) {
  const rt = str(form, "return_to");
  if (rt.startsWith("/claim")) return rt;
  return `/accounts/${accountId}`;
}
function go(base: string, kind: "error" | "message", text: string): never {
  const sep = base.includes("?") ? "&" : "?";
  redirect(`${base}${sep}${kind}=${encodeURIComponent(text)}`);
}

/** Creates (or refreshes) the code the user must put in their in-game signature. */
export async function startVerification(form: FormData) {
  const supabase = await createClient();
  const accountId = str(form, "account_id");
  const back = target(form, accountId);
  const { error } = await supabase.rpc("start_verification", { acct: accountId });
  if (error) go(back, "error", error.message);
  revalidatePath(back);
  redirect(back);
}

/**
 * Reads the signature from Enka and, if it contains the code, marks the account
 * verified. If the prover is not the current owner, ownership moves to them
 * (previous owner becomes a viewer and gets a notice). The write happens with
 * the service-role client because the prover may not have any access yet.
 */
export async function checkVerification(form: FormData) {
  const supabase = await createClient();
  const accountId = str(form, "account_id");
  const back = target(form, accountId);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  if (!admin) go(back, "error", "Verification is not configured on this server (SUPABASE_SECRET_KEY missing).");

  const { data: challenge } = await supabase
    .from("verification_challenges")
    .select("id, code, expires_at")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; code: string; expires_at: string }>();
  if (!challenge) go(back, "error", "No verification in progress. Click “Start verification” first.");
  if (new Date(challenge.expires_at) < new Date()) go(back, "error", "That code expired. Start verification again.");

  const { data: account } = await admin
    .from("game_accounts")
    .select("id, game_id, uid, user_id, name")
    .eq("id", accountId)
    .maybeSingle<{ id: string; game_id: GameId; uid: string | null; user_id: string; name: string }>();
  if (!account) go(back, "error", "Account not found.");
  if (!account.uid) go(back, "error", "This account has no UID set.");
  if (!VERIFIABLE_GAMES.includes(account.game_id)) go(back, "error", "This game cannot be verified (no public profile API).");

  const sig = await fetchSignature(account.game_id, account.uid);
  if (!sig.ok) go(back, "error", sig.error);
  if (!signatureMatches(sig.signature, challenge.code)) {
    go(back, "error", `Signature does not contain ${challenge.code} yet. Enka caches for ~1 minute — save the signature in game, wait, then check again. (Enka currently sees: “${sig.signature || "(empty)"}”)`);
  }

  const now = new Date().toISOString();
  const takeover = account.user_id !== user.id;

  if (takeover) {
    const previousOwner = account.user_id;
    await admin.from("account_members").update({ role: "viewer" }).eq("account_id", accountId).eq("role", "owner");
    await admin
      .from("account_members")
      .upsert({ account_id: accountId, user_id: user.id, role: "owner" }, { onConflict: "account_id,user_id" });
    await admin
      .from("game_accounts")
      .update({ user_id: user.id, verified_at: now, verified_by: user.id })
      .eq("id", accountId);
    await admin.from("notices").insert({
      user_id: previousOwner,
      message: `Ownership of your account “${account.name}” (UID ${account.uid}) was transferred to the player who verified it with the in-game signature. You can still view it. If this is wrong, verify the UID yourself to take it back.`,
    });
  } else {
    await admin.from("game_accounts").update({ verified_at: now, verified_by: user.id }).eq("id", accountId);
  }
  await admin.from("verification_challenges").delete().eq("id", challenge.id);

  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  go(
    `/accounts/${accountId}`,
    "message",
    takeover
      ? `Verified${sig.nickname ? ` as ${sig.nickname}` : ""} — you are now the owner. You can remove the code from your signature.`
      : `Verified${sig.nickname ? ` as ${sig.nickname}` : ""}. You can remove the code from your signature.`,
  );
}
