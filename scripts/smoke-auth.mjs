// End-to-end smoke test for auth + core CRUD against a real Supabase project.
// Usage: BASE_URL=http://localhost:3000 node scripts/smoke-auth.mjs
// Needs: the dev server running with NEXT_PUBLIC_SUPABASE_* set, and
// "Confirm email" turned off in Supabase (otherwise sign-up needs an email click).
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const stamp = Date.now();
const email = process.env.TEST_EMAIL ?? `smoke+${stamp}@gachahq.test`;
const password = process.env.TEST_PASSWORD ?? `Smoke-${stamp}-pw`;

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  // 1. protected page while signed out -> /login
  await page.goto(`${BASE}/dashboard`);
  check("signed-out /dashboard redirects to /login", page.url().includes("/login?next=%2Fdashboard"), page.url());

  // 2. sign up
  await page.goto(`${BASE}/login`);
  const signUp = page.locator("form").nth(1);
  await signUp.locator('input[name="display_name"]').fill("Smoke Tester");
  await signUp.locator('input[name="email"]').fill(email);
  await signUp.locator('input[name="password"]').fill(password);
  await signUp.locator('button[type="submit"]').click();
  await page.waitForLoadState("networkidle");
  const afterSignUp = page.url();
  check("sign-up submits without error", !afterSignUp.includes("error="), afterSignUp);

  // 3. sign in (works whether or not sign-up auto-confirmed)
  if (!afterSignUp.includes("/dashboard")) {
    await page.goto(`${BASE}/login`);
    const signIn = page.locator("form").nth(0);
    await signIn.locator('input[name="email"]').fill(email);
    await signIn.locator('input[name="password"]').fill(password);
    await signIn.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");
  }
  check("signed in lands on /dashboard", page.url().includes("/dashboard"), page.url());
  check("nav shows display name", (await page.textContent("header")).includes("Smoke Tester"));

  // 4. games seeded
  const dash = await page.textContent("main");
  check("dashboard lists Genshin (seed ran)", dash.includes("Genshin"));

  // 5. create an account
  await page.goto(`${BASE}/accounts?game=genshin`);
  const add = page.locator("form").last();
  await add.locator('select[name="game_id"]').selectOption("genshin");
  await add.locator('input[name="name"]').fill("main");
  await add.locator('input[name="server"]').fill("Asia");
  await add.locator('button[type="submit"]').click();
  await page.waitForURL(/\/accounts\/[0-9a-f-]{36}/, { timeout: 15000 });
  check("account created and opened", /\/accounts\/[0-9a-f-]{36}/.test(page.url()), page.url());

  // 6. add a character row
  const addChar = page.locator("form").last();
  await addChar.locator('select[name="character_id"]').selectOption({ index: 1 });
  await addChar.locator('input[name="owned"]').check();
  await addChar.locator('button[type="submit"]').click();
  await page.waitForLoadState("networkidle");
  const rows = await page.locator("table tbody tr").count();
  check("character row added", rows >= 1, `${rows} row(s)`);

  // 7. RLS: a second user cannot see the first user's account
  const accountUrl = page.url();
  const page2 = await browser.newPage();
  await page2.goto(`${BASE}/login`);
  const su2 = page2.locator("form").nth(1);
  await su2.locator('input[name="email"]').fill(`smoke2+${stamp}@gachahq.test`);
  await su2.locator('input[name="password"]').fill(password);
  await su2.locator('button[type="submit"]').click();
  await page2.waitForLoadState("networkidle");
  if (!page2.url().includes("/dashboard")) {
    const si2 = page2.locator("form").nth(0);
    await si2.locator('input[name="email"]').fill(`smoke2+${stamp}@gachahq.test`);
    await si2.locator('input[name="password"]').fill(password);
    await si2.locator('button[type="submit"]').click();
    await page2.waitForLoadState("networkidle");
  }
  const resp = await page2.goto(accountUrl);
  check("second user gets 404 on first user's account (RLS)", resp.status() === 404, `status ${resp.status()}`);
  const dash2 = await page2.textContent("main");
  check("second user sees no accounts", dash2.includes("No accounts yet"));

  // 8. sign out
  await page.goto(`${BASE}/dashboard`);
  await page.locator('header form button[type="submit"]').click();
  await page.waitForLoadState("networkidle");
  check("sign out returns to /login", page.url().includes("/login"), page.url());
  await page.goto(`${BASE}/accounts`);
  check("signed-out /accounts redirects to /login", page.url().includes("/login"), page.url());
} catch (e) {
  check("no unexpected exception", false, String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
