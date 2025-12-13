"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { use, useRouter } from "next/navigation";
import { WalletConnector } from "../../components/WalletConnector";
import { ChatList } from "../../components/ChatList";
import { ChatView } from "../../components/ChatView";
import { NewChatModal } from "../../components/NewChatModal";
import { MessageSquare, Plus, ArrowLeft } from "lucide-react";

export default function ChatDetailPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  const { user } = useNeynarContext();
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);

  useEffect(() => {
    // Check for connected wallet
    if (typeof window !== "undefined" && (window as any).ethereum) {
      checkWalletConnection();
    }
  }, []);

  const checkWalletConnection = async () => {
    try {
      const accounts = await (window as any).ethereum.request({
        method: "eth_accounts",
      });
      if (accounts.length > 0) {
        setWalletAddress(accounts[0]);
        checkXmtpInitialization(accounts[0]);
      }
    } catch (error) {
      console.error("Error checking wallet:", error);
    }
  };

  const checkXmtpInitialization = async (address: string) => {
    if (!user?.fid) return;

    try {
      const response = await fetch(
        `/api/xmtp/init?userFid=${user.fid}&walletAddress=${address}`
      );
      if (response.ok) {
        setIsInitialized(true);
      }
    } catch (error) {
      // Not initialized
    }
  };

  const handleWalletConnected = (address: string) => {
    setWalletAddress(address);
  };

  const handleXmtpInitialized = (address: string) => {
    setIsInitialized(true);
    setWalletAddress(address);
  };

  const handleConversationCreated = (newConversationId: string) => {
    router.push(`/chat/${newConversationId}`);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Sign In Required</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Please sign in with Farcaster to access chat.
          </p>
        </div>
      </div>
    );
  }

  if (!walletAddress || !isInitialized) {
    return (
      <div className="min-h-screen max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-2">
          <MessageSquare size={32} />
          Chat
        </h1>
        <WalletConnector
          onConnected={handleWalletConnected}
          onInitialized={handleXmtpInitialized}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-7xl mx-auto">
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-80 border-r border-gray-200 dark:border-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <MessageSquare size={24} />
              Messages
            </h1>
            <button
              onClick={() => setShowNewChat(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              title="New Chat"
            >
              <Plus size={20} />
            </button>
          </div>
          <ChatList
            walletAddress={walletAddress}
            onSelectConversation={(id) => router.push(`/chat/${id}`)}
          />
        </div>

        {/* Chat View */}
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-4">
            <button
              onClick={() => router.push("/chat")}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-lg font-semibold">Conversation</h2>
          </div>
          {user?.fid && (
            <ChatView
              conversationId={conversationId}
              walletAddress={walletAddress}
              userFid={user.fid}
            />
          )}
        </div>
      </div>

      <NewChatModal
        isOpen={showNewChat}
        onClose={() => setShowNewChat(false)}
        walletAddress={walletAddress}
        onConversationCreated={handleConversationCreated}
      />
    </div>
  );
}

