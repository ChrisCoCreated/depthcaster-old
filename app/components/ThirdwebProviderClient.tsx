"use client";

import { ThirdwebProvider } from "thirdweb/react";

export function ThirdwebProviderClient({ children }: { children: React.ReactNode }) {
  return (
    <ThirdwebProvider>
      {children}
    </ThirdwebProvider>
  );
}
