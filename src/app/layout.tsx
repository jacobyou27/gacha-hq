import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gacha HQ",
  description: "Accounts, characters and planners for Genshin, HSR, ZZZ and WuWa.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-neutral-900">
        {children}
      </body>
    </html>
  );
}
