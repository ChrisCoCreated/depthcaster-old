"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";

export function PushSubscriptionManager() {
  const { user } = useNeynarContext();
  const { isGranted } = useNotificationPermission();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user?.fid || !isGranted || typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const registerPushSubscription = async () => {
      try {
        setIsLoading(true);
        const registration = await navigator.serviceWorker.ready;

        // Get existing subscription
        let subscription = await registration.pushManager.getSubscription();

        // If no subscription exists, create one
        if (!subscription) {
          // Get VAPID public key from server
          const vapidResponse = await fetch("/api/push/vapid-public-key");
          if (!vapidResponse.ok) {
            console.warn("VAPID public key not available, skipping push subscription");
            setIsLoading(false);
            return;
          }

          const { publicKey } = await vapidResponse.json();
          if (!publicKey) {
            console.warn("VAPID public key not configured");
            setIsLoading(false);
            return;
          }

          try {
            // Convert base64 URL to Uint8Array
            const applicationServerKey = urlBase64ToUint8Array(publicKey);

            // Subscribe - this may fail if VAPID keys are invalid or browser doesn't support push
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey,
            });
          } catch (subscribeError: any) {
            // Handle subscription errors gracefully
            console.error("Failed to subscribe to push notifications:", subscribeError);
            // Check if it's a known error type
            if (subscribeError.name === "AbortError" || subscribeError.name === "NotAllowedError") {
              console.warn("Push subscription not available - browser may not support it or user denied permission");
            } else {
              console.error("Unexpected error during push subscription:", subscribeError);
            }
            setIsLoading(false);
            return; // Exit early if subscription fails
          }
        }

        // Send subscription to server
        const response = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userFid: user.fid,
            subscription: {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: arrayBufferToBase64(subscription.getKey("p256dh")!),
                auth: arrayBufferToBase64(subscription.getKey("auth")!),
              },
            },
            userAgent: navigator.userAgent,
          }),
        });

        if (response.ok) {
          setIsSubscribed(true);
          console.log("Push subscription registered successfully");
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error("Failed to register push subscription:", errorData.error || "Unknown error");
        }
      } catch (error: any) {
        // Handle errors gracefully - push notifications are optional
        console.error("Error registering push subscription:", error);
        // Don't throw - allow the app to continue without push notifications
        // The badge will still update via polling
      } finally {
        setIsLoading(false);
      }
    };

    registerPushSubscription();
  }, [user?.fid, isGranted]);

  return null; // This component doesn't render anything
}

// Helper function to convert base64 URL to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}



