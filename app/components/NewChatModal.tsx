"use client";

import { useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { X } from "lucide-react";

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  onConversationCreated?: (conversationId: string) => void;
}

export function NewChatModal({
  isOpen,
  onClose,
  walletAddress,
  onConversationCreated,
}: NewChatModalProps) {
  const { user } = useNeynarContext();
  const [chatType, setChatType] = useState<"1:1" | "group">("1:1");
  const [peerFid, setPeerFid] = useState("");
  const [peerAddress, setPeerAddress] = useState("");
  const [memberAddresses, setMemberAddresses] = useState<string[]>([]);
  const [newMemberAddress, setNewMemberAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate1to1 = async () => {
    if (!user?.fid) return;

    setLoading(true);
    setError(null);

    try {
      let address = peerAddress.trim();

      // If FID provided, resolve to address via API
      if (peerFid.trim() && !address) {
        const fid = parseInt(peerFid.trim(), 10);
        if (isNaN(fid)) {
          throw new Error("Invalid FID");
        }
        // Resolve FID to address via API
        const resolveResponse = await fetch(`/api/user/${fid}`);
        if (!resolveResponse.ok) {
          throw new Error("Could not resolve FID to user");
        }
        const userData = await resolveResponse.json();
        // Try to get address from user data (this would need to be added to the user API)
        // For now, we'll require direct address input
        throw new Error("Please provide Ethereum address directly. FID resolution coming soon.");
      }

      if (!address || !address.startsWith("0x")) {
        throw new Error("Valid Ethereum address or FID required");
      }

      // Allow self-messaging (same address as wallet)
      const isSelfMessage = address.toLowerCase() === walletAddress.toLowerCase();
      
      if (!isSelfMessage) {
        // Check if address can receive messages (skip for self-messaging)
        const canMsgResponse = await fetch(`/api/xmtp/can-message/${address}`);
        if (!canMsgResponse.ok) {
          throw new Error("Failed to check if address can receive messages");
        }
        const canMsgData = await canMsgResponse.json();
        if (!canMsgData.canMessage) {
          throw new Error("This address is not on the XMTP network");
        }
      }

      // Create conversation
      const response = await fetch("/api/xmtp/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userFid: user.fid,
          walletAddress,
          peerAddress: address,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create conversation");
      }

      const data = await response.json();
      onConversationCreated?.(data.conversationId);
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.message || "Failed to create conversation");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!user?.fid) return;

    if (memberAddresses.length === 0) {
      setError("Add at least one member to create a group");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/xmtp/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userFid: user.fid,
          walletAddress,
          memberAddresses,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create group");
      }

      const data = await response.json();
      onConversationCreated?.(data.conversationId);
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.message || "Failed to create group");
    } finally {
      setLoading(false);
    }
  };

  const addMember = () => {
    const address = newMemberAddress.trim();
    if (address && address.startsWith("0x") && !memberAddresses.includes(address)) {
      setMemberAddresses([...memberAddresses, address]);
      setNewMemberAddress("");
    }
  };

  const removeMember = (address: string) => {
    setMemberAddresses(memberAddresses.filter((a) => a !== address));
  };

  const resetForm = () => {
    setChatType("1:1");
    setPeerFid("");
    setPeerAddress("");
    setMemberAddresses([]);
    setNewMemberAddress("");
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-semibold">New Chat</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setChatType("1:1")}
              className={`flex-1 px-4 py-2 rounded-lg ${
                chatType === "1:1"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              1:1 Chat
            </button>
            <button
              onClick={() => setChatType("group")}
              className={`flex-1 px-4 py-2 rounded-lg ${
                chatType === "group"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              Group Chat
            </button>
          </div>

          {chatType === "1:1" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Farcaster FID (optional)
                </label>
                <input
                  type="text"
                  value={peerFid}
                  onChange={(e) => setPeerFid(e.target.value)}
                  placeholder="Enter FID"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Or Ethereum Address
                </label>
                <input
                  type="text"
                  value={peerAddress}
                  onChange={(e) => setPeerAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                />
              </div>
              <button
                onClick={handleCreate1to1}
                disabled={loading || (!peerFid.trim() && !peerAddress.trim())}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating..." : "Start Chat"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Add Members (Ethereum addresses)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMemberAddress}
                    onChange={(e) => setNewMemberAddress(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addMember()}
                    placeholder="0x..."
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                  />
                  <button
                    onClick={addMember}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg"
                  >
                    Add
                  </button>
                </div>
              </div>
              {memberAddresses.length > 0 && (
                <div className="space-y-2">
                  {memberAddresses.map((address) => (
                    <div
                      key={address}
                      className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-800 rounded"
                    >
                      <span className="text-sm">{address}</span>
                      <button
                        onClick={() => removeMember(address)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={handleCreateGroup}
                disabled={loading || memberAddresses.length === 0}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating..." : "Create Group"}
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

