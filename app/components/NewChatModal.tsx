"use client";

import { useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { X } from "lucide-react";
import { useXmtp } from "../contexts/XmtpContext";
import { getAddress, type Address } from "viem";
import { getEthereumAddressFromFid } from "@/lib/farcaster-address";

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
  const { client, isInitialized } = useXmtp();
  const [chatType, setChatType] = useState<"1:1" | "group">("1:1");
  const [peerFid, setPeerFid] = useState("");
  const [peerAddress, setPeerAddress] = useState("");
  const [memberAddresses, setMemberAddresses] = useState<string[]>([]);
  const [newMemberAddress, setNewMemberAddress] = useState("");
  const [groupName, setGroupName] = useState("");
  const [initialMessage, setInitialMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate1to1 = async () => {
    if (!user?.fid || !client || !isInitialized || typeof window === "undefined") {
      setError("XMTP client not initialized");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let address: Address;

      // If FID provided, resolve to address
      if (peerFid.trim()) {
        const fid = parseInt(peerFid.trim(), 10);
        if (isNaN(fid)) {
          throw new Error("Invalid FID");
        }
        const resolvedAddress = await getEthereumAddressFromFid(fid);
        if (!resolvedAddress) {
          throw new Error("Could not resolve FID to Ethereum address");
        }
        address = getAddress(resolvedAddress);
      } else if (peerAddress.trim()) {
        address = getAddress(peerAddress.trim());
      } else {
        throw new Error("Please provide either FID or Ethereum address");
      }

      // Allow self-messaging (same address as wallet)
      const isSelfMessage = address.toLowerCase() === walletAddress.toLowerCase();
      
      if (!isSelfMessage) {
        // Check if address can receive messages
        const canMsgMap = await client.canMessage([{
          identifier: address,
          identifierKind: 'Ethereum',
        }]);
        const identifierKey = `${address}:Ethereum`;
        const canMsg = canMsgMap.get(identifierKey);
        if (!canMsg) {
          throw new Error("This address is not on the XMTP network");
        }
      }

      // Create conversation directly - browser SDK uses newDm for 1:1
      const conversation = await client.conversations.newDm(address);
      
      // Send initial message if provided
      if (initialMessage.trim()) {
        await conversation.send(initialMessage.trim());
      }

      // Browser SDK uses inboxId instead of topic
      const conversationId = String('inboxId' in conversation ? conversation.inboxId : ('topic' in conversation ? conversation.topic : ''));
      onConversationCreated?.(conversationId);
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.message || "Failed to create conversation");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!user?.fid || !client || !isInitialized || typeof window === "undefined") {
      setError("XMTP client not initialized");
      return;
    }

    if (memberAddresses.length === 0) {
      setError("Add at least one member to create a group");
      return;
    }

    if (!groupName.trim()) {
      setError("Group name is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convert member addresses to Address type (strings)
      const memberAddrs = memberAddresses.map((addr) => getAddress(addr));

      // Create group directly
      const group = await client.conversations.newGroup(memberAddrs);

      // Send initial message if provided
      if (initialMessage.trim()) {
        await group.send(initialMessage.trim());
      }

      // Browser SDK uses inboxId instead of topic
      const conversationId = String('inboxId' in group ? group.inboxId : ('topic' in group ? group.topic : ''));
      onConversationCreated?.(conversationId);
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
    setGroupName("");
    setInitialMessage("");
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
                  Farcaster FID or Ethereum Address
                </label>
                <input
                  type="text"
                  value={peerFid}
                  onChange={(e) => setPeerFid(e.target.value)}
                  placeholder="Enter FID"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 mb-2"
                />
                <input
                  type="text"
                  value={peerAddress}
                  onChange={(e) => setPeerAddress(e.target.value)}
                  placeholder="Or 0x..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Initial Message (optional)
                </label>
                <textarea
                  value={initialMessage}
                  onChange={(e) => setInitialMessage(e.target.value)}
                  placeholder="Say hello!"
                  rows={3}
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
                  Group Name
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="My Awesome Group"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                />
              </div>
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
              <div>
                <label className="block text-sm font-medium mb-1">
                  Initial Message (optional)
                </label>
                <textarea
                  value={initialMessage}
                  onChange={(e) => setInitialMessage(e.target.value)}
                  placeholder="Say hello!"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                />
              </div>
              <button
                onClick={handleCreateGroup}
                disabled={loading || memberAddresses.length === 0 || !groupName.trim()}
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

