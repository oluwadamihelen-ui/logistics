"use client";
import { signOut } from "next-auth/react";
import { unregisterPush } from "./push-registrar";
import { clearOfflineCaches } from "./offline-register";

export function SignOutButton({ className = "underline" }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={async () => {
      await Promise.all([unregisterPush(), clearOfflineCaches()]);
      await signOut({ callbackUrl: "/login" });
    }}>Sign out</button>
  );
}
