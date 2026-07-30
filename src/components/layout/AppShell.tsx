"use client";

import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";

/** Persistent app chrome: sidebar (md+) / bottom nav (mobile) around the page canvas. */
export function AppShell({
  signInSlot,
  children,
}: {
  signInSlot: React.ReactNode;
  viewer: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen md:grid-cols-[232px_1fr]">
      <div className="hidden md:block">
        <Sidebar signInSlot={signInSlot} />
      </div>
      <main className="min-w-0">
        <div className="mx-auto max-w-[1080px] px-5 pb-28 pt-8 sm:px-10 md:pb-16">{children}</div>
      </main>
      <MobileNav />
    </div>
  );
}
