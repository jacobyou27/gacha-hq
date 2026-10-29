import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";

export default async function Home() {
  const user = await getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Gacha HQ</h1>
      <p className="text-sm text-neutral-600">
        One place for your Genshin, HSR, ZZZ and WuWa accounts, characters and
        planners.
      </p>
      <Link href="/login" className="btn w-fit">
        Sign in
      </Link>
    </main>
  );
}
