// ⚠️ IMPORTANT:
// This component must remain client-only.
// Do not import into Server Components.
// Thirdweb → WalletConnect pulls in Node-only deps (pino/thread-stream).
// Always use dynamic import with ssr: false when importing this component.

"use client";

import { ConnectButton } from "thirdweb/react";
import { createThirdwebClient } from "thirdweb";
import { base } from "thirdweb/chains";

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "",
});

export function WalletClient() {
  return (
    <ConnectButton
      client={client}
      chain={base}
      connectModal={{ size: "compact" }}
    />
  );
}
