"use client";

import { useState, useEffect, useRef } from "react";
import { useNeynarContext } from "@neynar/react";
import { AvatarImage } from "./AvatarImage";

interface UserSuggestion {
  username: string;
  pfp_url?: string;
  display_name: string;
  fid?: number;
  viewer_context?: {
    following?: boolean;
    followed_by?: boolean;
    blocking?: boolean;
    blocked_by?: boolean;
  };
}

interface UserSearchInputProps {
  selectedUsers: UserSuggestion[];
  onSelectUsers: (users: UserSuggestion[]) => void;
  placeholder?: string;
  className?: string;
}

export function UserSearchInput({ 
  selectedUsers, 
  onSelectUsers, 
  placeholder = "Search users...",
  className = ""
}: UserSearchInputProps) {
  const { user } = useNeynarContext();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<UserSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchTerm.length === 0) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    if (searchTerm.length < 2) {
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: searchTerm,
          limit: "10",
        });
        if (user?.fid) {
          params.append("viewerFid", user.fid.toString());
        }

        const response = await fetch(`/api/user/search?${params}`);
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.users || []);
          setShowDropdown(true);
        }
      } catch (error) {
        console.error("Error searching users:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, user?.fid]);

  const handleSelectUser = (user: UserSuggestion) => {
    if (!selectedUsers.find((u) => u.fid === user.fid)) {
      onSelectUsers([...selectedUsers, user]);
    }
    setSearchTerm("");
    setShowDropdown(false);
  };

  const handleRemoveUser = (fid: number) => {
    onSelectUsers(selectedUsers.filter((u) => u.fid !== fid));
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent dark:focus:ring-accent focus:border-transparent"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}
      </div>

      {/* Dropdown Results - positioned above selected users when they exist */}
      {showDropdown && searchResults.length > 0 && (
        <div className={`absolute z-[100] w-full ${selectedUsers.length > 0 ? 'top-full mt-2' : 'mt-2'} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-80 overflow-y-auto`}>
          {searchResults.map((resultUser) => {
            const isSelected = selectedUsers.some((u) => u.fid === resultUser.fid);
            return (
              <button
                key={resultUser.fid}
                onClick={() => !isSelected && handleSelectUser(resultUser)}
                disabled={isSelected}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-b border-gray-100 dark:border-gray-700 last:border-b-0"
              >
                <AvatarImage
                  src={resultUser.pfp_url}
                  alt={resultUser.username}
                  size={40}
                  className="w-10 h-10 rounded-full flex-shrink-0"
                />
                <div className="flex-1 text-left min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {resultUser.display_name || resultUser.username}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    @{resultUser.username}
                  </div>
                  {resultUser.viewer_context?.following && resultUser.viewer_context?.followed_by && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Following each other
                    </div>
                  )}
                  {resultUser.viewer_context?.following && !resultUser.viewer_context?.followed_by && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Following
                    </div>
                  )}
                </div>
                {isSelected && (
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Users - moved after dropdown to prevent overlap */}
      {selectedUsers.length > 0 && (
        <div className={`mt-3 flex flex-wrap gap-2 ${showDropdown ? 'mb-80' : ''}`}>
          {selectedUsers.map((selectedUser) => (
            <div
              key={selectedUser.fid}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-full"
            >
              <AvatarImage
                src={selectedUser.pfp_url}
                alt={selectedUser.username}
                size={20}
                className="w-5 h-5 rounded-full"
              />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {selectedUser.display_name || selectedUser.username}
              </span>
              <button
                onClick={() => handleRemoveUser(selectedUser.fid!)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Remove user"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

