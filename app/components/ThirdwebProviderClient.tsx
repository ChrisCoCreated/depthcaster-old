// ⚠️ IMPORTANT:
// This component must remain client-only.
// Do not import into Server Components.
// Thirdweb → WalletConnect pulls in Node-only deps (pino/thread-stream).
// This is used in layout.tsx which is a Server Component, so it's safe to import here
// because React will handle the client/server boundary automatically.

"use client";

import { ThirdwebProvider } from "thirdweb/react";

export function ThirdwebProviderClient({ children }: { children: React.ReactNode }) {
  return (
    <ThirdwebProvider>
      {children}
    </ThirdwebProvider>
  );
}

