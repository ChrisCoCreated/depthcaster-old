"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";

export function ConditionalHeader() {
  const pathname = usePathname();
  const isMiniapp = pathname?.startsWith("/miniapp");
  const isShare = pathname?.startsWith("/share");

  // Don't render Header in miniapp or share context
  if (isMiniapp || isShare) {
    return null;
  }

  return <Header />;
}
