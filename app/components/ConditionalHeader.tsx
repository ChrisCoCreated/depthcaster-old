"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";

export function ConditionalHeader() {
  const pathname = usePathname();
  const isMiniapp = pathname?.startsWith("/miniapp");

  // Don't render Header in miniapp context
  if (isMiniapp) {
    return null;
  }

  return <Header />;
}
