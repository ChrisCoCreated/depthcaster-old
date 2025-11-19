"use client";

import { useState, useEffect } from "react";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";
import { useOnboarding } from "@/lib/hooks/useOnboarding";
import { analytics } from "@/lib/analytics";

interface OnboardingStep {
  title: string;
  content: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void | Promise<void>;
    variant?: "primary" | "secondary";
  };
}

export function OnboardingFlow() {
  const { showOnboarding, completeOnboarding, skipOnboarding } = useOnboarding();
  const { isGranted, requestPermission } = useNotificationPermission();
  const [currentStep, setCurrentStep] = useState(0);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  const handleRequestNotificationPermission = async () => {
    setIsRequestingPermission(true);
    try {
      await requestPermission();
    } catch (error) {
      console.error("Failed to request permission:", error);
    } finally {
      setIsRequestingPermission(false);
    }
    // Move to next step regardless of result
    setCurrentStep((prev) => prev + 1);
  };

  const steps: OnboardingStep[] = [
    {
      title: "Welcome to Depthcaster",
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            A Farcaster client focused on deep thoughts, philosophy, art, and meaningful conversations.
          </p>
          <p className="text-gray-600 dark:text-gray-400">
            You&apos;ve installed Depthcaster as a Progressive Web App. Let&apos;s get you started!
          </p>
        </div>
      ),
    },
    {
      title: "Enable Notifications",
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Stay updated with device notifications when you receive new follows, likes, replies, and mentions.
          </p>
          {!isGranted && (
            <p className="text-sm text-gray-500 dark:text-gray-500">
              You can enable this later in Settings if you skip now.
            </p>
          )}
        </div>
      ),
      action: {
        label: isGranted ? "Notifications Enabled ✓" : isRequestingPermission ? "Requesting..." : "Enable Notifications",
        onClick: handleRequestNotificationPermission,
        variant: isGranted ? "secondary" : "primary",
      },
    },
    {
      title: "Explore the Feed",
      content: (
        <div className="space-y-4">
                      <div className="space-y-2">
            <p className="font-medium text-gray-900 dark:text-gray-100">• Curated</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              High-quality content from curated users
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-medium text-gray-900 dark:text-gray-100">• For You</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your normal feed - personalized content based on your activity
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-gray-900 dark:text-gray-100">• My 37</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your favorite people - a feed of your most important connections
            </p>
          </div>

        </div>
      ),
    },
    {
      title: "You're All Set!",
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Start exploring Depthcaster. You can customize your notification preferences and feed settings anytime in Settings.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Tip: The app works offline and can be used like a native app!
          </p>
        </div>
      ),
    },
  ];

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      analytics.trackOnboardingStep("complete");
      completeOnboarding();
    } else {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      analytics.trackOnboardingStep(`step_${nextStep}`);
    }
  };

  const handleSkip = () => {
    analytics.trackOnboardingStep("skip");
    skipOnboarding();
  };

  // Track initial step
  useEffect(() => {
    if (showOnboarding && currentStep === 0) {
      analytics.trackOnboardingStep("start");
    }
  }, [showOnboarding, currentStep]);

  if (!showOnboarding) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {currentStepData.title}
            </h2>
            <button
              onClick={handleSkip}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Skip onboarding"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Progress indicator */}
          <div className="flex gap-1 mt-4">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 rounded ${
                  index <= currentStep
                    ? "bg-blue-600 dark:bg-blue-500"
                    : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="min-h-[200px] flex flex-col justify-center">
            {currentStepData.content}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-4">
          {currentStep > 0 && (
            <button
              onClick={() => setCurrentStep((prev) => prev - 1)}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          <div className="flex gap-2">
            {currentStepData.action && (
              <button
                onClick={currentStepData.action.onClick}
                disabled={isRequestingPermission || isGranted}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  currentStepData.action.variant === "primary"
                    ? "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                {currentStepData.action.label}
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {isLastStep ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

