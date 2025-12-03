"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import Link from "next/link";
import { FeedbackModal } from "../components/FeedbackModal";

export const dynamic = 'force-dynamic';

const ADMIN_FID = 5701;

export default function CuratorsPage() {
  const { user } = useNeynarContext();
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isCurator, setIsCurator] = useState<boolean | null>(null);
  const farcasterDmLink = user?.fid 
    ? `https://farcaster.xyz/~/inbox/${user.fid}-${ADMIN_FID}`
    : `https://farcaster.xyz/~/inbox/${ADMIN_FID}`;

  useEffect(() => {
    const checkCuratorStatus = async () => {
      if (!user?.fid) {
        setIsCurator(false);
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        if (response.ok) {
          const data = await response.json();
          // Check if user has curator role (admin/superadmin don't automatically confer curator)
          const roles = data.roles || [];
          setIsCurator(roles.includes("curator"));
        } else {
          setIsCurator(false);
        }
      } catch (error) {
        console.error("Failed to check curator status:", error);
        setIsCurator(false);
      }
    };

    checkCuratorStatus();
  }, [user?.fid]);

  return (
    <div className="min-h-screen">
      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Curator Guide
        </h1>

        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <strong>Note:</strong> Apologies in advance—this guide was written with an LLM. I&apos;m focused on building the product, so please forgive the shortcut. The information is accurate, but I&apos;ll improve the writing down the track. Thanks for understanding! 🙏
          </p>
        </div>

        <div className="space-y-6">
          {/* Invite Section - Only show if user is not already a curator */}
          {isCurator === false && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-6">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
                🎯 Become a Curator
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                We&apos;re looking for thoughtful curators to help surface the best conversations on Farcaster. 
                If you&apos;re passionate about philosophy, art, meaningful discussions, and have a good eye 
                for quality content, we&apos;d love to have you join our curation team!
              </p>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                As a curator, you&apos;ll help shape the Depthcaster feed by selecting casts that spark deep 
                conversations and meaningful engagement.
              </p>
              <div className="mt-4">
                <a
                  href={farcasterDmLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  DM me on Farcaster to get started →
                </a>
              </div>
            </div>
          )}

          {/* Instructions Section */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
              How to Curate
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  1. Find Quality Casts
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  Browse Farcaster and look for casts that:
                </p>
                <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-1 ml-4">
                  <li>Spark thoughtful conversations</li>
                  <li>Present interesting ideas or perspectives</li>
                  <li>Encourage meaningful engagement</li>
                  <li>Relate to philosophy, art, culture, or deep thinking</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  2. Curate the Cast
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  There are several ways to curate a cast:
                </p>
                
                <div className="ml-4 space-y-3 mt-3">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      Method 1: Curate Button
                    </h4>
                    <ol className="list-decimal list-inside text-gray-700 dark:text-gray-300 space-y-1 ml-4">
                      <li>Click the <strong>curate button</strong> (usually a star or bookmark icon) on the cast</li>
                      <li>The cast will be added to the curated feed</li>
                      <li>Your curation will be visible to all Depthcaster users</li>
                    </ol>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-2 italic">
                      Note: Only users with curator permissions can curate casts. If you don&apos;t see the curate button, 
                      you may need to be granted curator access first.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      Method 2: Paste Cast Link or Hash
                    </h4>
                    <ol className="list-decimal list-inside text-gray-700 dark:text-gray-300 space-y-1 ml-4">
                      <li>Copy a cast link (from Warpcast, Farcaster, or Base) or the cast hash</li>
                      <li>Click the <strong>paste button</strong> (clipboard icon) in the header</li>
                      <li>The cast will be automatically fetched and curated</li>
                    </ol>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">
                      This is useful for curating casts you see outside of Depthcaster or when you have a cast hash.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      Method 3: Depthcaster Mini-App
                    </h4>
                    <ol className="list-decimal list-inside text-gray-700 dark:text-gray-300 space-y-1 ml-4">
                      <li>Add the <a href="https://farcaster.xyz/miniapps/HtUwgAw4iQ2x/depthcaster" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Depthcaster Mini-App</a> to Farcaster</li>
                      <li>Open the Depthcaster Mini-App in Farcaster</li>
                      <li>Click the <strong>paste button</strong> (clipboard icon) in the top right of the mini-app</li>
                      <li>Alternatively, click the <strong>share button</strong> on any cast and select <strong>Depthcaster</strong> from the share menu</li>
                      <li>The cast will be automatically curated</li>
                    </ol>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">
                      This is the easiest way to curate directly from Farcaster without leaving the app.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      Method 4: Mention @deepbot
                    </h4>
                    <ol className="list-decimal list-inside text-gray-700 dark:text-gray-300 space-y-1 ml-4">
                      <li>Reply to a cast mentioning <strong>@deepbot</strong> in any client — the cast you&apos;re replying to will be automatically curated</li>
                    </ol>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-2 italic">
                      <strong>Important:</strong> Replies that mention @deepbot will not be added as a reply. The parent cast you&apos;re replying to will be curated, but your reply itself won&apos;t appear in the conversation thread.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  3. Multiple Curators
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  Multiple curators can curate the same cast. This helps surface the best content that 
                  resonates with multiple curators. When you curate a cast that&apos;s already been curated 
                  by others, it helps validate the quality of the content.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  4. Uncurate if Needed
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  If you change your mind about a cast you&apos;ve curated, you can uncurate it by clicking 
                  the curate button again. This will remove your curation, but won&apos;t affect curations 
                  from other curators.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  5. Auto-like Setting
                </h3>
                <p className="text-gray-700 dark:text-gray-300 mb-2">
                  Auto-like is turned on by default. When you curate a cast for the first time, you&apos;ll be 
                  asked if you want to automatically like curated casts. This helps show your appreciation 
                  for the content you&apos;re curating. You can toggle this setting on or off in your{" "}
                  <Link href="/settings" className="text-blue-600 dark:text-blue-400 hover:underline">Settings</Link> page.
                </p>
              </div>
            </div>
          </div>

          {/* Best Practices Section */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
              Best Practices
            </h2>

            <div className="space-y-4">
              <div className="flex gap-3">
                <span className="text-2xl">✨</span>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    Quality over Quantity
                  </h4>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">
                    Focus on curating casts that truly add value. It&apos;s better to curate fewer, high-quality 
                    casts than to curate everything.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-2xl">🎯</span>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    Diverse Perspectives
                  </h4>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">
                    Help surface a variety of voices and perspectives. Don&apos;t just curate from your immediate 
                    network—explore and discover new voices.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-2xl">💬</span>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    Conversation Starters
                  </h4>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">
                    Prioritize casts that encourage discussion and engagement. Questions, thought-provoking 
                    statements, and open-ended topics often make for great curated content.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-2xl">🔄</span>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    Regular Curation
                  </h4>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">
                    Try to curate regularly to keep the feed fresh and active. Even a few curations per week 
                    can make a big difference.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Section */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Questions or Feedback?
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              If you have questions about curating, suggestions for improving the curation process, or 
              need help with anything, feel free to reach out!
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setIsFeedbackModalOpen(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Submit Feedback
              </button>
              <a
                href={farcasterDmLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-medium text-center"
              >
                DM me on Farcaster
              </a>
            </div>
          </div>
        </div>
      </main>
      
      <FeedbackModal 
        isOpen={isFeedbackModalOpen} 
        onClose={() => setIsFeedbackModalOpen(false)} 
      />
    </div>
  );
}

