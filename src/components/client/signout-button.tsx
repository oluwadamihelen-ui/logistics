"use client";
import { signOut } from "next-auth/react";

export function SignOutButton({ className = "underline" }: { className?: string }) {
  return <button type="button" className={className} onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button>;
}
