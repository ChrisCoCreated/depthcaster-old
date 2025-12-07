"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import { AvatarImage } from "./AvatarImage";
import { analytics } from "@/lib/analytics";

interface UserSuggestion {
  username: string;
  pfp_url?: string;
  display_name: string;
  fid?: number;
  viewer_context?: {
    following?: boolean;
    followed_by?: boolean;
  };
}

export function HeaderUserSearch() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<UserSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const canRenderPortalsRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    canRenderPortalsRef.current = true;
  }, []);

  // Update dropdown position when it opens
  useEffect(() => {
    if (isExpanded && showDropdown && searchResults.length > 0 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isExpanded, showDropdown, searchResults.length]);

  // Also update position on window resize and scroll
  useEffect(() => {
    if (!isExpanded || !showDropdown || searchResults.length === 0) return;

    const updatePosition = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + 8,
          left: rect.left,
          width: rect.width,
        });
      }
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isExpanded, showDropdown, searchResults.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && 
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setShowDropdown(false);
        if (!searchTerm) {
          setIsExpanded(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchTerm]);

  // Reset item refs when search results change
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, searchResults.length);
  }, [searchResults]);

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
          setHighlightedIndex(-1); // Reset highlight when new results come in
          
          // Track analytics
          if (searchTerm.length >= 2) {
            analytics.trackUserSearch(searchTerm);
          }
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

  const handleSelectUser = (selectedUser: UserSuggestion) => {
    if (selectedUser.fid) {
      router.push(`/profile/${selectedUser.fid}`);
      setSearchTerm("");
      setShowDropdown(false);
      setIsExpanded(false);
      setHighlightedIndex(-1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const nextIndex = prev < searchResults.length - 1 ? prev + 1 : 0;
        // Scroll into view
        setTimeout(() => {
          itemRefs.current[nextIndex]?.scrollIntoView({
            block: "nearest",
            behavior: "smooth",
          });
        }, 0);
        return nextIndex;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const nextIndex = prev > 0 ? prev - 1 : searchResults.length - 1;
        // Scroll into view
        setTimeout(() => {
          itemRefs.current[nextIndex]?.scrollIntoView({
            block: "nearest",
            behavior: "smooth",
          });
        }, 0);
        return nextIndex;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        handleSelectUser(searchResults[highlightedIndex]);
      } else if (searchResults.length > 0) {
        // If no item is highlighted, select the first one
        handleSelectUser(searchResults[0]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setHighlightedIndex(-1);
      setShowDropdown(false);
      if (!searchTerm) {
        setIsExpanded(false);
      }
    }
  };

  const handleExpand = () => {
    setIsExpanded(true);
    // Focus after animation starts for smoother UX
    setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
  };

  const handleCollapse = () => {
    if (!searchTerm) {
      setIsExpanded(false);
      setShowDropdown(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Container with smooth width transition */}
      <div className={`relative overflow-hidden transition-all duration-300 ease-out ${
        isExpanded ? 'w-48 sm:w-64' : 'w-10 sm:w-10'
      }`}>
        {/* Icon button - always present but hidden when expanded */}
        <button
          onClick={handleExpand}
          className={`absolute inset-0 flex items-center justify-center p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-all duration-300 ${
            isExpanded ? 'opacity-0 pointer-events-none scale-90' : 'opacity-100 pointer-events-auto scale-100'
          }`}
          aria-label="Search users"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        {/* Search input - slides in when expanded */}
        <div className={`relative transition-all duration-300 ease-out ${
          isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'
        }`}>
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 z-10">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setHighlightedIndex(-1); // Reset highlight when typing
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (searchResults.length > 0) {
                setShowDropdown(true);
              }
            }}
            onBlur={() => {
              // Delay to allow click on dropdown items
              setTimeout(() => {
                handleCollapse();
              }, 200);
            }}
            placeholder="Search users..."
            className="w-full pl-8 sm:pl-10 pr-8 sm:pr-10 py-1.5 sm:py-2 text-xs sm:text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none transition-all duration-200"
          />
          {isSearching && (
            <div className="absolute right-8 sm:right-10 top-1/2 -translate-y-1/2 z-10">
              <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}
          <button
            onClick={handleCollapse}
            className={`absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity duration-200 z-10 ${
              isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-label="Close search"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Dropdown Results */}
      {isExpanded && showDropdown && searchResults.length > 0 && mounted && canRenderPortalsRef.current && typeof document !== "undefined" && document.body && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-48 sm:w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-80 overflow-y-auto z-[9998]"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
          }}
        >
          {searchResults.map((resultUser, index) => (
            <button
              key={resultUser.fid}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              onClick={() => handleSelectUser(resultUser)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`w-full px-4 py-3 flex items-center gap-3 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                highlightedIndex === index
                  ? "bg-gray-100 dark:bg-gray-700"
                  : "hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
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
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

