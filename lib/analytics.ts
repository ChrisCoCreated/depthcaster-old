"use client";

import { track } from "@vercel/analytics";

// Session tracking
const SESSION_START_KEY = "analytics_session_start";
const SESSION_COUNT_KEY = "analytics_session_count";
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds

/**
 * Get or initialize session count
 */
function getSessionCount(): number {
  if (typeof window === "undefined") return 0;
  
  const count = localStorage.getItem(SESSION_COUNT_KEY);
  if (!count) {
    localStorage.setItem(SESSION_COUNT_KEY, "1");
    return 1;
  }
  return parseInt(count, 10);
}

/**
 * Increment session count
 */
function incrementSessionCount(): number {
  if (typeof window === "undefined") return 0;
  
  const count = getSessionCount() + 1;
  localStorage.setItem(SESSION_COUNT_KEY, count.toString());
  return count;
}

/**
 * Start a new session
 */
export function startSession(): void {
  if (typeof window === "undefined") return;
  
  const sessionStart = Date.now();
  localStorage.setItem(SESSION_START_KEY, sessionStart.toString());
  const sessionCount = incrementSessionCount();
  
  track("session_start", {
    sessionCount,
    timestamp: sessionStart,
  });
}

/**
 * End current session and track duration
 */
export function endSession(): void {
  if (typeof window === "undefined") return;
  
  const sessionStartStr = localStorage.getItem(SESSION_START_KEY);
  if (!sessionStartStr) return;
  
  const sessionStart = parseInt(sessionStartStr, 10);
  const duration = Math.floor((Date.now() - sessionStart) / 1000); // Duration in seconds
  const sessionCount = getSessionCount();
  
  if (duration > 0) {
    track("session_end", {
      duration,
      sessionCount,
    });
  }
  
  localStorage.removeItem(SESSION_START_KEY);
}

/**
 * Track session time periodically or on demand
 */
export function trackSessionTime(): void {
  if (typeof window === "undefined") return;
  
  const sessionStartStr = localStorage.getItem(SESSION_START_KEY);
  if (!sessionStartStr) return;
  
  const sessionStart = parseInt(sessionStartStr, 10);
  const duration = Math.floor((Date.now() - sessionStart) / 1000); // Duration in seconds
  const sessionCount = getSessionCount();
  
  if (duration > 0) {
    track("session_time", {
      duration,
      sessionCount,
    });
  }
}

/**
 * Check if session should be considered new (inactivity timeout)
 */
export function shouldStartNewSession(): boolean {
  if (typeof window === "undefined") return false;
  
  const sessionStartStr = localStorage.getItem(SESSION_START_KEY);
  if (!sessionStartStr) return true;
  
  const sessionStart = parseInt(sessionStartStr, 10);
  const timeSinceStart = Date.now() - sessionStart;
  
  return timeSinceStart > INACTIVITY_TIMEOUT;
}

/**
 * Main track function wrapper
 */
export function trackEvent(
  name: string,
  properties?: Record<string, any>
): void {
  track(name, properties);
}

/**
 * Convenience functions for common event types
 */
export const analytics = {
  // Cast interactions
  trackCastLike: (castHash: string, authorFid: number, feedType?: string) => {
    track("cast_like", { castHash, authorFid, ...(feedType && { feedType }) });
  },
  trackCastUnlike: (castHash: string, authorFid: number, feedType?: string) => {
    track("cast_unlike", { castHash, authorFid, ...(feedType && { feedType }) });
  },
  trackCastRecast: (castHash: string, authorFid: number, feedType?: string) => {
    track("cast_recast", { castHash, authorFid, ...(feedType && { feedType }) });
  },
  trackCastUnrecast: (castHash: string, authorFid: number, feedType?: string) => {
    track("cast_unrecast", { castHash, authorFid, ...(feedType && { feedType }) });
  },
  trackCastReply: (castHash: string, authorFid: number, feedType?: string) => {
    track("cast_reply", { castHash, authorFid, ...(feedType && { feedType }) });
  },
  trackCastQuote: (castHash: string, authorFid: number, feedType?: string) => {
    track("cast_quote", { castHash, authorFid, ...(feedType && { feedType }) });
  },
  trackCastView: (castHash: string, authorFid: number, feedType?: string) => {
    track("cast_view", { castHash, authorFid, ...(feedType && { feedType }) });
  },
  trackConversationView: (castHash: string, authorFid: number) => {
    track("conversation_view", { castHash, authorFid });
  },
  
  // Curation actions
  trackCurateCast: (castHash: string, curatorFid: number) => {
    track("curate_cast", { castHash, curatorFid });
  },
  trackUncurateCast: (castHash: string, curatorFid: number) => {
    track("uncurate_cast", { castHash, curatorFid });
  },
  trackCuratePaste: (castHash: string, curatorFid: number) => {
    track("curate_paste", { castHash, curatorFid });
  },
  trackPackCreate: (packId: string, packName: string, userCount: number) => {
    track("pack_create", { packId, packName, userCount });
  },
  trackPackUpdate: (packId: string, packName: string, userCount: number) => {
    track("pack_update", { packId, packName, userCount });
  },
  trackPackDelete: (packId: string, packName: string) => {
    track("pack_delete", { packId, packName });
  },
  trackPackSubscribe: (packId: string, packName: string) => {
    track("pack_subscribe", { packId, packName });
  },
  trackPackUnsubscribe: (packId: string, packName: string) => {
    track("pack_unsubscribe", { packId, packName });
  },
  trackPackFavorite: (packId: string, packName: string) => {
    track("pack_favorite", { packId, packName });
  },
  trackPackUnfavorite: (packId: string, packName: string) => {
    track("pack_unfavorite", { packId, packName });
  },
  trackPackUse: (packId: string, packName: string) => {
    track("pack_use", { packId, packName });
  },
  trackCurationSettingsAutoLike: (enabled: boolean) => {
    track("curation_settings_auto_like", { enabled });
  },
  
  // Feed interactions
  trackFeedViewTime: (feedType: string, duration: number, sortBy?: string, curatorFids?: number[], packIds?: string[]) => {
    track("feed_view_time", { 
      feedType, 
      duration, 
      ...(sortBy && { sortBy }), 
      ...(curatorFids && curatorFids.length > 0 && { curatorFids: JSON.stringify(curatorFids) }), 
      ...(packIds && packIds.length > 0 && { packIds: JSON.stringify(packIds) }) 
    });
  },
  trackFeedSortChange: (feedType: string, sortBy: string) => {
    track("feed_sort_change", { feedType, sortBy });
  },
  trackFeedCuratorFilter: (feedType: string, curatorFids: number[]) => {
    track("feed_curator_filter", { feedType, curatorFids: JSON.stringify(curatorFids) });
  },
  trackFeedPackSelect: (feedType: string, packIds: string[]) => {
    track("feed_pack_select", { feedType, packIds: JSON.stringify(packIds) });
  },
  trackFeedScrollToTop: (feedType: string) => {
    track("feed_scroll_to_top", { feedType });
  },
  trackFeedLoadMore: (feedType: string) => {
    track("feed_load_more", { feedType });
  },
  
  // Cast creation
  trackCastPost: (castHash: string, parentHash?: string) => {
    track("cast_post", { castHash, ...(parentHash && { parentHash }) });
  },
  trackCastReplyPost: (castHash: string, parentHash: string) => {
    track("cast_reply_post", { castHash, parentHash });
  },
  trackCastQuotePost: (castHash: string, quotedHash: string) => {
    track("cast_quote_post", { castHash, quotedHash });
  },
  
  // Header actions
  trackFeedbackModalOpen: () => {
    track("feedback_modal_open");
  },
  trackUserSearch: (query: string) => {
    track("user_search", { query });
  },
  trackNavSettings: () => {
    track("nav_settings");
  },
  trackNavProfile: (fid: number) => {
    track("nav_profile", { fid });
  },
  
  // Settings
  trackSettingsFeedChange: (settingName: string, settingValue: any) => {
    track("settings_feed_change", { settingName, settingValue });
  },
  trackSettingsNotificationChange: (settingName: string, settingValue: any) => {
    track("settings_notification_change", { settingName, settingValue });
  },
  trackSettingsBotChange: (settingName: string, settingValue: any) => {
    track("settings_bot_change", { settingName, settingValue });
  },
  trackSettingsWatchChange: (settingName: string, settingValue: any) => {
    track("settings_watch_change", { settingName, settingValue });
  },
  trackSettingsCurationChange: (settingName: string, settingValue: any) => {
    track("settings_curation_change", { settingName, settingValue });
  },
  
  // Authentication
  trackAuthSignIn: (fid: number) => {
    track("auth_sign_in", { fid });
  },
  trackAuthSignOut: () => {
    track("auth_sign_out");
  },
  
  // Page views
  trackPageView: (pagePath: string, previousPath?: string) => {
    track("page_view", { pagePath, ...(previousPath && { previousPath }) });
  },
  
  // Other interactions
  trackFeedbackSubmit: (title: string, hasDescription: boolean, castHash?: string) => {
    track("feedback_submit", { title, hasDescription, ...(castHash && { castHash }) });
  },
  trackOnboardingStep: (step: string) => {
    track("onboarding_step", { step });
  },
};

