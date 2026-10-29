import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/accounts", label: "Accounts" },
  { href: "/overview", label: "Overview" },
  { href: "/characters", label: "Characters" },
  { href: "/friends", label: "Friends" },
  { href: "/claim", label: "Claim UID" },
  { href: "/profile", label: "Profile" },
] as const;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, is_admin")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  return (
    <>
      <header className="border-b border-neutral-200">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3 text-sm">
          <Link href="/dashboard" className="font-semibold">
            Gacha HQ
          </Link>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:underline">
              {n.label}
            </Link>
          ))}
          <span className="ml-auto text-neutral-500">
            {profile?.display_name || user.email}
            {profile?.is_admin ? " (admin)" : ""}
          </span>
          <form action={signOut}>
            <button className="btn-secondary" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </>
  );
}
