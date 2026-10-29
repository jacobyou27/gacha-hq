import { signIn, signUp } from "./actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const message = typeof params.message === "string" ? params.message : null;
  const next = typeof params.next === "string" ? params.next : "/dashboard";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Gacha HQ</h1>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">
          {message}
        </p>
      )}

      <form action={signIn} className="card flex flex-col gap-3">
        <h2 className="font-medium">Sign in</h2>
        <input type="hidden" name="next" value={next} />
        <label className="label">
          Email
          <input className="input" type="email" name="email" required autoComplete="email" />
        </label>
        <label className="label">
          Password
          <input className="input" type="password" name="password" required autoComplete="current-password" />
        </label>
        <button className="btn" type="submit">Sign in</button>
      </form>

      <form action={signUp} className="card flex flex-col gap-3">
        <h2 className="font-medium">Create an account</h2>
        <label className="label">
          Display name
          <input className="input" type="text" name="display_name" />
        </label>
        <label className="label">
          Email
          <input className="input" type="email" name="email" required autoComplete="email" />
        </label>
        <label className="label">
          Password (6+ characters)
          <input className="input" type="password" name="password" required minLength={6} autoComplete="new-password" />
        </label>
        <button className="btn-secondary" type="submit">Sign up</button>
      </form>
    </main>
  );
}
