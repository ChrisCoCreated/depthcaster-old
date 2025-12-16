"use client";

import { useEffect, useState, useCallback } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AvatarImage } from "@/app/components/AvatarImage";

interface UserWithRoles {
  fid: number;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
  roles: string[];
  lastActivity: string | null;
  hasSignedIn?: boolean;
}

interface FilteredUser {
  fid: number;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
  extractedFirstName: string;
}

const VALID_ROLES = ["tester", "curator", "admin", "superadmin", "plus", "collector"] as const;
type ValidRole = typeof VALID_ROLES[number];

export default function AdminRolesPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [addingRole, setAddingRole] = useState<{ userFid: number; role: string } | null>(null);
  const [removingRole, setRemovingRole] = useState<{ userFid: number; role: string } | null>(null);
  const [addUserQuery, setAddUserQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ fid: number; username: string; display_name: string; pfp_url?: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAddUserSection, setShowAddUserSection] = useState(false);
  const [lastCuratorAssigned, setLastCuratorAssigned] = useState<number | null>(null);
  const [sendingDm, setSendingDm] = useState<number | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [dmModalOpen, setDmModalOpen] = useState<boolean>(false);
  const [dmRecipientFid, setDmRecipientFid] = useState<number | null>(null);
  const [dmMessage, setDmMessage] = useState<string>("");
  
  // Bulk DM state
  const [bulkDmModalOpen, setBulkDmModalOpen] = useState<boolean>(false);
  const [selectedRole, setSelectedRole] = useState<ValidRole | "">("");
  const [filterSignedIn, setFilterSignedIn] = useState<"all" | "signed-in" | "not-signed-in">("all");
  const [filter14dActive, setFilter14dActive] = useState<"all" | "active" | "inactive">("all");
  const [salutation, setSalutation] = useState<string>("");
  const [bulkDmMessage, setBulkDmMessage] = useState<string>("");
  const [addCommaAfterName, setAddCommaAfterName] = useState<boolean>(false);
  const [filteredUsers, setFilteredUsers] = useState<FilteredUser[]>([]);
  const [selectedUserFids, setSelectedUserFids] = useState<Set<number>>(new Set());
  const [editedNames, setEditedNames] = useState<Map<number, string>>(new Map());
  const [recipientNamesText, setRecipientNamesText] = useState<string>("");
  const [sendingBulkDm, setSendingBulkDm] = useState<boolean>(false);
  const [extractingNames, setExtractingNames] = useState<boolean>(false);

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!user?.fid) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        const data = await response.json();
        
        if (data.isAdmin) {
          setIsAdmin(true);
          setIsSuperAdmin(data.isSuperAdmin || false);
          loadUsers();
        } else {
          setIsAdmin(false);
          setIsSuperAdmin(false);
          router.push("/");
        }
      } catch (error) {
        console.error("Failed to check admin access:", error);
        setIsAdmin(false);
        router.push("/");
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminAccess();
  }, [user, router]);

  const loadUsers = async () => {
    if (!user?.fid) return;
    
    setIsLoadingUsers(true);
    try {
      const url = searchQuery
        ? `/api/admin/roles?adminFid=${user.fid}&q=${encodeURIComponent(searchQuery)}`
        : `/api/admin/roles?adminFid=${user.fid}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (response.ok) {
        setUsers(data.users || []);
      } else {
        setMessage({ type: "error", text: data.error || "Failed to load users" });
      }
    } catch (error: any) {
      console.error("Failed to load users:", error);
      setMessage({ type: "error", text: error.message || "Failed to load users" });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isAdmin && user?.fid) {
      const timeoutId = setTimeout(() => {
        loadUsers();
      }, 300); // Debounce search
      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, isAdmin, user?.fid]);

  // Clear lastCuratorAssigned when search query changes
  useEffect(() => {
    if (searchQuery) {
      setLastCuratorAssigned(null);
    }
  }, [searchQuery]);

  const handleAddRole = async (userFid: number, role: ValidRole) => {
    if (!user?.fid) return;
    
    setAddingRole({ userFid, role });
    setMessage(null);
    
    try {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adminFid: user.fid,
          userFid,
          role,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: "success", text: data.message || `Role "${role}" added successfully` });
        // Track when curator role is assigned
        if (role === "curator") {
          setLastCuratorAssigned(userFid);
        }
        loadUsers();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to add role" });
      }
    } catch (error: any) {
      console.error("Failed to add role:", error);
      setMessage({ type: "error", text: error.message || "Failed to add role" });
    } finally {
      setAddingRole(null);
    }
  };

  const handleRemoveRole = async (userFid: number, role: string) => {
    if (!user?.fid) return;
    
    if (!confirm(`Are you sure you want to remove the "${role}" role from this user?`)) {
      return;
    }
    
    setRemovingRole({ userFid, role });
    setMessage(null);
    
    try {
      const response = await fetch(
        `/api/admin/roles?adminFid=${user.fid}&userFid=${userFid}&role=${encodeURIComponent(role)}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: "success", text: data.message || `Role "${role}" removed successfully` });
        loadUsers();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to remove role" });
      }
    } catch (error: any) {
      console.error("Failed to remove role:", error);
      setMessage({ type: "error", text: error.message || "Failed to remove role" });
    } finally {
      setRemovingRole(null);
    }
  };

  const searchFarcasterUsers = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Check if query is a FID (numeric)
      const fidMatch = query.match(/^\d+$/);
      if (fidMatch) {
        // Search by FID
        const fid = parseInt(fidMatch[0]);
        const response = await fetch(`/api/user/${fid}`);
        if (response.ok) {
          const user = await response.json();
          setSearchResults([{
            fid: user.fid,
            username: user.username || "",
            display_name: user.display_name || "",
            pfp_url: user.pfp_url,
          }]);
        } else {
          setSearchResults([]);
        }
      } else {
        // Search by username
        const params = new URLSearchParams({
          q: query,
          limit: "10",
        });
        if (user?.fid) {
          params.append("viewerFid", user.fid.toString());
        }

        const response = await fetch(`/api/user/search?${params}`);
        if (response.ok) {
          const data = await response.json();
          setSearchResults((data.users || []).map((u: any) => ({
            fid: u.fid,
            username: u.username || "",
            display_name: u.display_name || "",
            pfp_url: u.pfp_url,
          })));
        } else {
          setSearchResults([]);
        }
      }
    } catch (error) {
      console.error("Error searching users:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [user?.fid]);

  useEffect(() => {
    if (!showAddUserSection) {
      setAddUserQuery("");
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      if (addUserQuery) {
        searchFarcasterUsers(addUserQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [addUserQuery, showAddUserSection, searchFarcasterUsers]);

  const handleAddUserWithRole = async (userFid: number, role: ValidRole) => {
    if (!user?.fid) return;
    
    setAddingRole({ userFid, role });
    setMessage(null);
    
    try {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adminFid: user.fid,
          userFid,
          role,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: "success", text: data.message || `Role "${role}" added successfully` });
        // Track when curator role is assigned
        if (role === "curator") {
          setLastCuratorAssigned(userFid);
        }
        setAddUserQuery("");
        setSearchResults([]);
        loadUsers();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to add role" });
      }
    } catch (error: any) {
      console.error("Failed to add role:", error);
      setMessage({ type: "error", text: error.message || "Failed to add role" });
    } finally {
      setAddingRole(null);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "superadmin":
        return "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700";
      case "admin":
        return "bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700";
      case "curator":
        return "bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700";
      case "tester":
        return "bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-700";
      case "plus":
        return "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700";
      case "collector":
        return "bg-indigo-100 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700";
      default:
        return "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700";
    }
  };

  const handleOpenDmModal = (recipientFid: number) => {
    const defaultMessage = `Here's the app, currently in private beta.

www.sopha.social

I've given you Curator role - guide here: www.sopha.social/curators

I'd love any feedback, here, GC or by clicking the ? icon in the app header.

here is the group chat: https://farcaster.xyz/~/group/GpluEgXNiXtpW1XAO8ct5A

and lastly I recommend adding the mini-app so you get notifications over in Farcaster: https://farcaster.xyz/miniapps/HtUwgAw4iQ2x/sopha

thanks and looking forward to what you curate!`;
    
    setDmRecipientFid(recipientFid);
    setDmMessage(defaultMessage);
    setDmModalOpen(true);
  };

  const handleCloseDmModal = () => {
    setDmModalOpen(false);
    setDmRecipientFid(null);
    setDmMessage("");
  };

  const handleSendDm = async () => {
    if (!user?.fid || !dmRecipientFid) return;
    
    setSendingDm(dmRecipientFid);
    setMessage(null);
    
    try {
      const response = await fetch("/api/admin/send-dm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adminFid: user.fid,
          recipientFid: dmRecipientFid,
          message: dmMessage,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: "success", text: "DM sent successfully!" });
        handleCloseDmModal();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to send DM" });
      }
    } catch (error: any) {
      console.error("Failed to send DM:", error);
      setMessage({ type: "error", text: error.message || "Failed to send DM" });
    } finally {
      setSendingDm(null);
    }
  };

  const formatLastActivity = (lastActivity: string | null): string => {
    if (!lastActivity) return "Never";
    
    try {
      const date = new Date(lastActivity);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      // For older dates, show the date
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    } catch {
      return "Unknown";
    }
  };

  // Bulk DM handlers
  const handleOpenBulkDmModal = () => {
    setBulkDmModalOpen(true);
    setSelectedRole("");
    setFilterSignedIn("all");
    setFilter14dActive("all");
    setSalutation("");
    setBulkDmMessage("");
    setAddCommaAfterName(false);
    setFilteredUsers([]);
    setSelectedUserFids(new Set());
    setEditedNames(new Map());
    setRecipientNamesText("");
  };

  const handleCloseBulkDmModal = () => {
    setBulkDmModalOpen(false);
    setSelectedRole("");
    setFilterSignedIn("all");
    setFilter14dActive("all");
    setSalutation("");
    setBulkDmMessage("");
    setAddCommaAfterName(false);
    setFilteredUsers([]);
    setSelectedUserFids(new Set());
    setEditedNames(new Map());
    setRecipientNamesText("");
    setExtractingNames(false);
    setSendingBulkDm(false);
  };

  const extractFirstNames = async (usersToExtract: Array<{ fid: number; username: string | null; displayName: string | null }>) => {
    if (!user?.fid) return [];

    try {
      const response = await fetch("/api/admin/extract-first-names", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adminFid: user.fid,
          users: usersToExtract,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        return data.firstNames || [];
      } else {
        console.error("Failed to extract first names:", data.error);
        // Fallback to capitalized usernames
        return usersToExtract.map((u) => {
          const username = u.username || "";
          return username.charAt(0).toUpperCase() + username.slice(1);
        });
      }
    } catch (error: any) {
      console.error("Error extracting first names:", error);
      // Fallback to capitalized usernames
      return usersToExtract.map((u) => {
        const username = u.username || "";
        return username.charAt(0).toUpperCase() + username.slice(1);
      });
    }
  };

  const applyFiltersAndExtractNames = async (
    role: ValidRole | "",
    signedInFilter: typeof filterSignedIn,
    activeFilter: typeof filter14dActive
  ) => {
    setExtractingNames(true);
    setFilteredUsers([]);
    setSelectedUserFids(new Set());

    if (!role) {
      setExtractingNames(false);
      return;
    }

    // Filter users by role
    let usersWithRole = users.filter((u) => u.roles.includes(role));

    // Apply sign-in filter
    if (signedInFilter === "signed-in") {
      usersWithRole = usersWithRole.filter((u) => u.hasSignedIn === true);
    } else if (signedInFilter === "not-signed-in") {
      usersWithRole = usersWithRole.filter((u) => !u.hasSignedIn);
    }

    // Apply 14-day activity filter
    if (activeFilter === "active" || activeFilter === "inactive") {
      const now = new Date();
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      
      usersWithRole = usersWithRole.filter((u) => {
        if (!u.lastActivity) {
          return activeFilter === "inactive";
        }
        const lastActivityDate = new Date(u.lastActivity);
        const isActive14d = lastActivityDate >= fourteenDaysAgo;
        return activeFilter === "active" ? isActive14d : !isActive14d;
      });
    }

    if (usersWithRole.length === 0) {
      setExtractingNames(false);
      return;
    }

    // Extract first names
    const usersToExtract = usersWithRole.map((u) => ({
      fid: u.fid,
      username: u.username,
      displayName: u.displayName,
    }));

    const firstNames = await extractFirstNames(usersToExtract);

    // Create filtered users with extracted first names
    const filtered = usersWithRole.map((u, index) => ({
      fid: u.fid,
      username: u.username,
      displayName: u.displayName,
      pfpUrl: u.pfpUrl,
      extractedFirstName: firstNames[index] || (u.username ? u.username.charAt(0).toUpperCase() + u.username.slice(1) : "User"),
    }));

    setFilteredUsers(filtered);
    
    // Select all users by default
    const allFids = new Set(filtered.map((u) => u.fid));
    setSelectedUserFids(allFids);
    
    // Initialize edited names with extracted first names
    const initialEditedNames = new Map<number, string>();
    filtered.forEach((u) => {
      initialEditedNames.set(u.fid, u.extractedFirstName);
    });
    setEditedNames(initialEditedNames);
    
    // Update recipient names text
    const namesText = filtered.map((u) => u.extractedFirstName).join(", ");
    setRecipientNamesText(namesText);
    
    setExtractingNames(false);
  };

  const handleRoleChange = async (role: ValidRole | "") => {
    setSelectedRole(role);
    await applyFiltersAndExtractNames(role, filterSignedIn, filter14dActive);
  };

  const updateRecipientNamesText = (selectedFids: Set<number>) => {
    const selectedUsers = filteredUsers.filter((u) => selectedFids.has(u.fid));
    const names = selectedUsers.map((u) => {
      return editedNames.get(u.fid) || u.extractedFirstName;
    });
    setRecipientNamesText(names.join(", "));
  };

  const handleUserToggle = (fid: number) => {
    const newSelected = new Set(selectedUserFids);
    if (newSelected.has(fid)) {
      newSelected.delete(fid);
    } else {
      newSelected.add(fid);
    }
    setSelectedUserFids(newSelected);
    updateRecipientNamesText(newSelected);
  };

  const handleSelectAll = () => {
    const allFids = new Set(filteredUsers.map((u) => u.fid));
    setSelectedUserFids(allFids);
    updateRecipientNamesText(allFids);
  };

  const handleDeselectAll = () => {
    setSelectedUserFids(new Set());
    setRecipientNamesText("");
  };

  const handleRecipientNamesChange = (text: string) => {
    setRecipientNamesText(text);
    
    // Parse the text and update edited names map
    // Split by comma and map to users in order
    const names = text.split(",").map((n) => n.trim()).filter((n) => n.length > 0);
    const selectedUsers = filteredUsers.filter((u) => selectedUserFids.has(u.fid));
    
    const newEditedNames = new Map(editedNames);
    selectedUsers.forEach((user, index) => {
      if (index < names.length) {
        newEditedNames.set(user.fid, names[index]);
      } else {
        // If fewer names than users, keep original
        newEditedNames.set(user.fid, editedNames.get(user.fid) || user.extractedFirstName);
      }
    });
    setEditedNames(newEditedNames);
  };

  const assembleMessage = (fid: number, defaultFirstName: string): string => {
    const parts: string[] = [];
    if (salutation.trim()) {
      parts.push(salutation.trim());
    }
    // Use edited name if available, otherwise use default
    const firstName = editedNames.get(fid) || defaultFirstName;
    // Add firstName with optional comma
    const nameWithComma = addCommaAfterName ? `${firstName},` : firstName;
    parts.push(nameWithComma);
    
    // Add message body (preserve line breaks)
    if (bulkDmMessage.trim()) {
      // Join salutation and name with space, then add message with line breaks preserved
      const header = parts.join(" ");
      return `${header}\n${bulkDmMessage.trim()}`;
    }
    
    // If no message, just return salutation and name
    return parts.join(" ");
  };

  const handleSendBulkDm = async () => {
    if (!user?.fid || selectedUserFids.size === 0) return;

    setSendingBulkDm(true);
    setMessage(null);

    try {
      const selectedUsers = filteredUsers.filter((u) => selectedUserFids.has(u.fid));
      let successCount = 0;
      let failureCount = 0;

      // Send individual DMs to each recipient with personalized message
      for (const selectedUser of selectedUsers) {
        try {
          const personalizedMessage = assembleMessage(selectedUser.fid, selectedUser.extractedFirstName);

          const response = await fetch("/api/admin/send-dm", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              adminFid: user.fid,
              recipientFid: selectedUser.fid,
              message: personalizedMessage,
            }),
          });

          const data = await response.json();

          if (response.ok) {
            successCount++;
          } else {
            failureCount++;
            console.error(`Failed to send DM to FID ${selectedUser.fid}:`, data.error);
          }

          // Small delay between requests to avoid rate limiting
          if (selectedUsers.length > 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (error: any) {
          failureCount++;
          console.error(`Error sending DM to FID ${selectedUser.fid}:`, error);
        }
      }

      if (failureCount === 0) {
        setMessage({ type: "success", text: `Successfully sent ${successCount} DM(s)!` });
      } else {
        setMessage({ type: "success", text: `Sent ${successCount} DM(s), ${failureCount} failed` });
      }
      handleCloseBulkDmModal();
    } catch (error: any) {
      console.error("Failed to send bulk DM:", error);
      setMessage({ type: "error", text: error.message || "Failed to send bulk DM" });
    } finally {
      setSendingBulkDm(false);
    }
  };

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Access Denied</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            User Roles Management
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Manage user roles: curator, admin, superadmin, tester, plus, and collector
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={handleOpenBulkDmModal}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base whitespace-nowrap"
          >
            Send Bulk DM
          </button>
        )}
      </div>

        {message && (
          <div
            className={`mb-6 p-3 sm:p-4 rounded-lg border text-sm sm:text-base ${
              message.type === "success"
                ? "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700"
                : "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
            <input
              type="text"
              placeholder="Search users by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2.5 sm:py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent text-sm sm:text-base"
            />
            <button
              onClick={loadUsers}
              disabled={isLoadingUsers}
              className="px-4 py-2.5 sm:py-2 bg-accent text-white rounded-lg hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm sm:text-base whitespace-nowrap"
            >
              {isLoadingUsers ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">
              Add Farcaster User
            </h2>
            <button
              onClick={() => {
                setShowAddUserSection(!showAddUserSection);
                if (showAddUserSection) {
                  setAddUserQuery("");
                  setSearchResults([]);
                }
              }}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm sm:text-base"
            >
              {showAddUserSection ? "Cancel" : "+ Add User"}
            </button>
          </div>

          {showAddUserSection && (
            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="Search by username or enter FID (e.g., @username or 12345)"
                  value={addUserQuery}
                  onChange={(e) => setAddUserQuery(e.target.value)}
                  className="w-full px-4 py-2.5 sm:py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
                />
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Search for any Farcaster user by username or FID. You can add roles to users even if they&apos;re not in the database yet.
                </p>
              </div>

              {isSearching && (
                <div className="text-center py-4 text-gray-500">Searching...</div>
              )}

              {!isSearching && searchResults.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {searchResults.map((result) => {
                    // Check if user already has roles
                    const existingUser = users.find((u) => u.fid === result.fid);
                    const existingRoles = existingUser?.roles || [];

                    return (
                      <div
                        key={result.fid}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                          <div className="flex items-center gap-3 flex-1 w-full sm:w-auto">
                            <Link href={`/profile/${result.fid}`} className="flex-shrink-0">
                              <AvatarImage
                                src={result.pfp_url}
                                alt={result.username || "User"}
                                size={40}
                                className="w-10 h-10 rounded-full hover:opacity-80 transition-opacity cursor-pointer"
                              />
                            </Link>
                            <div className="flex-1">
                              <Link 
                                href={`/profile/${result.fid}`}
                                className="font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                              >
                                {result.display_name || result.username || `FID: ${result.fid}`}
                              </Link>
                              {result.username && (
                                <Link 
                                  href={`/profile/${result.fid}`}
                                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline block"
                                >
                                  @{result.username}
                                </Link>
                              )}
                              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                FID: {result.fid}
                              </div>
                              {existingUser?.lastActivity && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Last active: {formatLastActivity(existingUser.lastActivity)}
                                </div>
                              )}
                              {existingRoles.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {existingRoles.map((role) => (
                                    <span
                                      key={role}
                                      className={`px-2 py-0.5 rounded text-xs font-medium border ${getRoleColor(role)}`}
                                    >
                                      {role}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                            {VALID_ROLES.filter(
                              (role) => !existingRoles.includes(role)
                            ).map((role) => (
                              <button
                                key={role}
                                onClick={() => handleAddUserWithRole(result.fid, role)}
                                disabled={
                                  addingRole?.userFid === result.fid &&
                                  addingRole?.role === role
                                }
                                className="px-3 py-1.5 sm:py-1 text-xs sm:text-xs bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-green-300 dark:border-green-700 min-h-[32px] touch-manipulation"
                              >
                                {addingRole?.userFid === result.fid &&
                                addingRole?.role === role
                                  ? "Adding..."
                                  : `+ ${role}`}
                              </button>
                            ))}
                            {existingRoles.length === VALID_ROLES.length && (
                              <span className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
                                All roles assigned
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!isSearching && addUserQuery.length >= 2 && searchResults.length === 0 && (
                <div className="text-center py-4 text-gray-500">
                  No users found. Try a different search term or FID.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Users ({users.length})
          </h2>

          {isLoadingUsers ? (
            <div className="text-center py-8 text-gray-500">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? "No users found matching your search." : "No users found."}
            </div>
          ) : (
            <div className="space-y-4">
              {(() => {
                // Sort users so lastCuratorAssigned appears first
                const sortedUsers = [...users];
                if (lastCuratorAssigned) {
                  const curatorIndex = sortedUsers.findIndex(u => u.fid === lastCuratorAssigned);
                  if (curatorIndex > 0) {
                    const [curatorUser] = sortedUsers.splice(curatorIndex, 1);
                    sortedUsers.unshift(curatorUser);
                  }
                }
                return sortedUsers;
              })().map((userWithRoles) => (
                <div
                  key={userWithRoles.fid}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 w-full sm:w-auto">
                      <Link href={`/profile/${userWithRoles.fid}`} className="flex-shrink-0">
                        <AvatarImage
                          src={userWithRoles.pfpUrl}
                          alt={userWithRoles.username || "User"}
                          size={40}
                          className="w-10 h-10 rounded-full hover:opacity-80 transition-opacity cursor-pointer"
                        />
                      </Link>
                      <div className="flex-1">
                        <Link 
                          href={`/profile/${userWithRoles.fid}`}
                          className="font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                        >
                          {userWithRoles.displayName || userWithRoles.username || `FID: ${userWithRoles.fid}`}
                        </Link>
                        {userWithRoles.username && (
                          <Link 
                            href={`/profile/${userWithRoles.fid}`}
                            className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline block"
                          >
                            @{userWithRoles.username}
                          </Link>
                        )}
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          FID: {userWithRoles.fid}
                        </div>
                        {userWithRoles.lastActivity && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Last active: {formatLastActivity(userWithRoles.lastActivity)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 items-start sm:items-end w-full sm:w-auto">
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        {userWithRoles.roles.length > 0 ? (
                          userWithRoles.roles.map((role) => (
                            <div
                              key={role}
                              className={`px-3 py-1.5 sm:py-1 rounded-full text-xs font-medium border ${getRoleColor(role)} flex items-center gap-2 min-h-[32px]`}
                            >
                              <span>{role}</span>
                              <button
                                onClick={() => handleRemoveRole(userWithRoles.fid, role)}
                                disabled={
                                  removingRole?.userFid === userWithRoles.fid &&
                                  removingRole?.role === role
                                }
                                className="hover:opacity-70 disabled:opacity-50 text-base leading-none touch-manipulation"
                                title={`Remove ${role} role`}
                              >
                                ×
                              </button>
                            </div>
                          ))
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-gray-400">No roles</span>
                        )}
                      </div>

                      <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                        {VALID_ROLES.filter(
                          (role) => !userWithRoles.roles.includes(role)
                        ).map((role) => (
                          <button
                            key={role}
                            onClick={() => handleAddRole(userWithRoles.fid, role)}
                            disabled={
                              addingRole?.userFid === userWithRoles.fid &&
                              addingRole?.role === role
                            }
                            className="px-3 py-1.5 sm:py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[32px] touch-manipulation"
                          >
                            {addingRole?.userFid === userWithRoles.fid &&
                            addingRole?.role === role
                              ? "Adding..."
                              : `+ ${role}`}
                          </button>
                        ))}
                        {userWithRoles.roles.includes("curator") && isSuperAdmin && (
                          <button
                            onClick={() => handleOpenDmModal(userWithRoles.fid)}
                            disabled={sendingDm === userWithRoles.fid}
                            className={`px-3 py-1.5 sm:py-1 text-xs rounded-lg transition-colors min-h-[32px] touch-manipulation ${
                              lastCuratorAssigned === userWithRoles.fid
                                ? "bg-accent text-white hover:bg-accent-dark font-medium"
                                : "bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700 hover:bg-blue-200 dark:hover:bg-blue-900/30"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title="Send welcome DM"
                          >
                            Share DM
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DM Edit Modal */}
        {dmModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
              <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Edit DM Message
                  </h3>
                  <button
                    onClick={handleCloseDmModal}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    disabled={sendingDm !== null}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Message
                  </label>
                  <textarea
                    value={dmMessage}
                    onChange={(e) => setDmMessage(e.target.value)}
                    className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                    rows={12}
                    disabled={sendingDm !== null}
                    placeholder="Enter your message..."
                  />
                </div>
              </div>

              <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-800 flex gap-3 justify-end">
                <button
                  onClick={handleCloseDmModal}
                  disabled={sendingDm !== null}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendDm}
                  disabled={sendingDm !== null || !dmMessage.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sendingDm !== null ? "Sending..." : "Send DM"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk DM Modal */}
        {bulkDmModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
              <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Send Bulk DM
                  </h3>
                  <button
                    onClick={handleCloseBulkDmModal}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    disabled={sendingBulkDm || extractingNames}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4">
                {/* Role Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Select Role
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => handleRoleChange(e.target.value as ValidRole | "")}
                    disabled={extractingNames || sendingBulkDm}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">-- Select a role --</option>
                    {VALID_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filters */}
                {selectedRole && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Sign-in Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Sign-in Status
                      </label>
                      <select
                        value={filterSignedIn}
                        onChange={async (e) => {
                          const newFilter = e.target.value as "all" | "signed-in" | "not-signed-in";
                          setFilterSignedIn(newFilter);
                          // Re-apply filters when filter changes
                          if (selectedRole) {
                            await applyFiltersAndExtractNames(selectedRole, newFilter, filter14dActive);
                          }
                        }}
                        disabled={extractingNames || sendingBulkDm}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="all">All users</option>
                        <option value="signed-in">Signed in</option>
                        <option value="not-signed-in">Not signed in</option>
                      </select>
                    </div>

                    {/* 14-day Activity Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        14-Day Activity
                      </label>
                      <select
                        value={filter14dActive}
                        onChange={async (e) => {
                          const newFilter = e.target.value as "all" | "active" | "inactive";
                          setFilter14dActive(newFilter);
                          // Re-apply filters when filter changes
                          if (selectedRole) {
                            await applyFiltersAndExtractNames(selectedRole, filterSignedIn, newFilter);
                          }
                        }}
                        disabled={extractingNames || sendingBulkDm}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="all">All users</option>
                        <option value="active">Active (14d)</option>
                        <option value="inactive">Inactive (14d)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* User Selection List */}
                {selectedRole && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Select Recipients ({selectedUserFids.size} of {filteredUsers.length} selected)
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSelectAll}
                          disabled={extractingNames || sendingBulkDm || filteredUsers.length === 0}
                          className="px-3 py-1 text-xs text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Select All
                        </button>
                        <button
                          onClick={handleDeselectAll}
                          disabled={extractingNames || sendingBulkDm || selectedUserFids.size === 0}
                          className="px-3 py-1 text-xs text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>
                    {extractingNames ? (
                      <div className="text-center py-8 text-gray-500">Extracting first names...</div>
                    ) : filteredUsers.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">No users found with this role.</div>
                    ) : (
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-64 overflow-y-auto">
                        {filteredUsers.map((filteredUser) => (
                          <div
                            key={filteredUser.fid}
                            className="flex items-center gap-3 p-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          >
                            <input
                              type="checkbox"
                              checked={selectedUserFids.has(filteredUser.fid)}
                              onChange={() => handleUserToggle(filteredUser.fid)}
                              disabled={sendingBulkDm}
                              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-50"
                            />
                            <Link href={`/profile/${filteredUser.fid}`} className="flex-shrink-0">
                              <AvatarImage
                                src={filteredUser.pfpUrl}
                                alt={filteredUser.username || "User"}
                                size={32}
                                className="w-8 h-8 rounded-full"
                              />
                            </Link>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                {filteredUser.displayName || filteredUser.username || `FID: ${filteredUser.fid}`}
                              </div>
                              {filteredUser.username && (
                                <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                  @{filteredUser.username}
                                </div>
                              )}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {filteredUser.extractedFirstName}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Salutation */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Salutation
                  </label>
                  <input
                    type="text"
                    value={salutation}
                    onChange={(e) => setSalutation(e.target.value)}
                    disabled={sendingBulkDm}
                    placeholder="e.g., Hi"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <div className="mt-2 flex items-center">
                    <input
                      type="checkbox"
                      id="addCommaAfterName"
                      checked={addCommaAfterName}
                      onChange={(e) => setAddCommaAfterName(e.target.checked)}
                      disabled={sendingBulkDm}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-50"
                    />
                    <label htmlFor="addCommaAfterName" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      Add comma after name
                    </label>
                  </div>
                </div>

                {/* Recipient Names - Editable */}
                {selectedUserFids.size > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Recipient Names ({selectedUserFids.size} selected) - Editable
                    </label>
                    <textarea
                      value={recipientNamesText}
                      onChange={(e) => handleRecipientNamesChange(e.target.value)}
                      disabled={sendingBulkDm}
                      placeholder="Names will be auto-populated from selected users"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                      rows={2}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Edit names as needed (comma-separated). Each recipient will receive a personalized DM with their name from this list.
                    </p>
                  </div>
                )}

                {/* Message */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Message
                  </label>
                  <textarea
                    value={bulkDmMessage}
                    onChange={(e) => setBulkDmMessage(e.target.value)}
                    disabled={sendingBulkDm}
                    placeholder="Enter your message..."
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                    rows={6}
                  />
                </div>

                {/* Preview */}
                {salutation || bulkDmMessage ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Message Preview (example for one recipient)
                    </label>
                    <div className="p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                      {selectedUserFids.size > 0 && filteredUsers.length > 0
                        ? (() => {
                            const firstSelectedUser = filteredUsers.find((u) => selectedUserFids.has(u.fid));
                            if (firstSelectedUser) {
                              return assembleMessage(firstSelectedUser.fid, firstSelectedUser.extractedFirstName);
                            }
                            return assembleMessage(0, "Name");
                          })()
                        : assembleMessage(0, "Name")}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Each recipient will receive a personalized DM with their first name. Line breaks in the message will be preserved.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-800 flex gap-3 justify-end">
                <button
                  onClick={handleCloseBulkDmModal}
                  disabled={sendingBulkDm || extractingNames}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendBulkDm}
                  disabled={sendingBulkDm || extractingNames || selectedUserFids.size === 0 || !bulkDmMessage.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sendingBulkDm ? `Sending to ${selectedUserFids.size} user(s)...` : `Send to ${selectedUserFids.size} user(s)`}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

