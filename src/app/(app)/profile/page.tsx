import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { updateProfile } from "./actions";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, is_admin")
    .eq("id", user!.id)
    .maybeSingle<Profile>();

  return (
    <div className="flex max-w-md flex-col gap-6">
      <h1 className="text-xl font-semibold">Profile</h1>
      <dl className="text-sm">
        <dt className="text-neutral-500">Email</dt>
        <dd>{user?.email}</dd>
        <dt className="mt-2 text-neutral-500">Role</dt>
        <dd>{profile?.is_admin ? "admin" : "member"}</dd>
      </dl>
      <form action={updateProfile} className="card flex flex-col gap-3">
        <label className="label">
          Display name
          <input className="input" name="display_name" defaultValue={profile?.display_name ?? ""} />
        </label>
        <button className="btn w-fit" type="submit">Save</button>
      </form>
    </div>
  );
}
