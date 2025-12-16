"use client";

import Link from "next/link";

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Frequently Asked Questions
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Everything you need to know about Sopha
          </p>
        </div>

        <div className="space-y-8">
          {/* Why Sopha */}
          <section className="border-b border-gray-200 dark:border-gray-800 pb-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Why Sopha (the new name)
            </h2>
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                We chose Sopha for three key reasons:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                <li><strong>Wisdom, Comfort, and Friendship:</strong> The name embodies the concepts of wisdom, comfort, and friendship - core values of our community</li>
                <li><strong>Open Territory:</strong> It's wide open territory for us to define through our behavior - no one outside of Sofa companies uses it at all, giving us complete creative freedom</li>
                <li><strong>Meme Potential:</strong> Lots of meme potential - "on the Sopha with...", "Take a seat on my Sopha..." - it's fun and memorable</li>
              </ul>
            </div>
          </section>

          {/* Quality Scoring */}
          <section className="border-b border-gray-200 dark:border-gray-800 pb-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              How is quality scored?
            </h2>
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Sopha uses AI-powered quality analysis (DeepSeek) to score all casts and replies on a scale of 0-100. The scoring system analyzes:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                <li><strong>Cast Text:</strong> The main text content of the cast</li>
                <li><strong>Embedded Casts:</strong> The content of any quoted or embedded casts is included in the analysis</li>
                <li><strong>Links & Articles:</strong> Metadata from linked content, including Paragraph articles and blog posts</li>
                <li><strong>Images:</strong> Image alt text and visual content when present</li>
                <li><strong>Content Depth:</strong> Analyzes thoughtfulness, clarity, and value</li>
                <li><strong>Length:</strong> Longer, more detailed casts generally score higher</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 mt-4 mb-4">
                For quote casts, the system analyzes both the original cast's quality and any additional commentary added by the quoter. High-quality commentary can improve the score, while low-effort quotes receive penalties.
              </p>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                <strong>Curator Feedback:</strong> Curators who have curated a cast (or the root cast) can provide feedback to adjust the quality score. Click the quality score (Q: XX) or the edit button (✏️) next to it to provide feedback. The AI will re-evaluate the cast based on your feedback and update the score accordingly.
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                To provide quality feedback, you must first curate the cast (or the root cast if it's a reply). This ensures only engaged curators can influence quality scores.
              </p>
            </div>
          </section>

          {/* Get More Involved */}
          <section className="border-b border-gray-200 dark:border-gray-800 pb-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              How do I get more involved?
            </h2>
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                There are several ways to get more involved in the Sopha community:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                <li><strong>Become a Curator:</strong> Curate high-quality casts to your feed by clicking the curate button on casts you find valuable</li>
                <li><strong>Engage Thoughtfully:</strong> Leave meaningful replies and use the thanks icon to appreciate curators</li>
                <li><strong>Provide Feedback:</strong> Use the feedback button in the help menu to share your ideas and suggestions</li>
                <li><strong>Join the Community:</strong> Participate in conversations and help surface the best content</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                If you're interested in becoming a curator, you can request curator access through the feedback system or by reaching out to existing curators.
              </p>
            </div>
          </section>

          {/* How to Curate */}
          <section className="border-b border-gray-200 dark:border-gray-800 pb-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              How to curate
            </h2>
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Curating is the process of selecting high-quality casts to surface in the Sopha feed. As a curator, you help shape the content that others see by identifying thoughtful, meaningful casts worth sharing.
              </p>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                To curate a cast, you can:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                <li>Click the <strong>curate button</strong> on any cast you find valuable</li>
                <li>Use the <strong>paste button</strong> in the header to curate casts by link or hash</li>
                <li>Use the <strong>Sopha Mini-App</strong> in Farcaster to curate directly from other clients</li>
                <li>Mention <strong>@deepbot</strong> in a reply to automatically curate the parent cast</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                For detailed instructions, best practices, and more information about curation, see our{" "}
                <Link href="/curators" className="text-accent-dark dark:text-accent hover:underline">
                  complete Curator Guide
                </Link>.
              </p>
            </div>
          </section>

          {/* Invite People */}
          <section className="border-b border-gray-200 dark:border-gray-800 pb-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              How do I invite people in?
            </h2>
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                To invite others to Sopha:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                <li><strong>Click the Recommend Button:</strong> Use the recommend button to suggest people for access</li>
                <li><strong>Suggest to Chris:</strong> You can also suggest people directly to Chris for consideration</li>
              </ul>
            </div>
          </section>

          {/* Thanks Icon */}
          <section className="border-b border-gray-200 dark:border-gray-800 pb-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              What is the thanks icon?
            </h2>
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                The thanks icon (🙏) is a way to show appreciation to curators who have curated a cast to your feed. When you click the thanks icon on a curated cast:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                <li>All curators who curated that cast receive a notification</li>
                <li>It's a one-time action - you can thank once per cast</li>
                <li>It helps curators know their curation is valued</li>
                <li>It encourages quality curation by recognizing curators' efforts</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                The thanks feature is only available on casts that have been curated. If you don't see the thanks icon, it means the cast hasn't been curated yet.
              </p>
            </div>
          </section>

          {/* Add More Feeds */}
          <section className="border-b border-gray-200 dark:border-gray-800 pb-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              How to add more feeds
            </h2>
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Sopha offers multiple feed types to explore different content:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                <li><strong>Curated Feed:</strong> Hand-picked content from curators (default feed)</li>
                <li><strong>Trending:</strong> Quality-filtered trending content across Farcaster</li>
                <li><strong>For You:</strong> Personalized recommendations based on your interests</li>
                <li><strong>Following:</strong> Casts from users you follow</li>
                <li><strong>My 37:</strong> Personal feed with up to 37 carefully selected users (Plus feature)</li>
                <li><strong>1500+:</strong> Long-form casts over 1,500 characters</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                To add more feeds, click the "+" button next to the feed tabs at the top of your feed. You can enable or disable feeds at any time. Some feeds may require authentication or Plus membership.
              </p>
            </div>
          </section>

          {/* Blog Support */}
          <section className="border-b border-gray-200 dark:border-gray-800 pb-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Are blogs supported?
            </h2>
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Yes! Sopha supports blog content from multiple platforms:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                <li><strong>Paragraph:</strong> Full support for Paragraph publications and posts</li>
                <li><strong>Substack:</strong> Full support for Substack posts (note: Substack notes are not supported, only full posts)</li>
                <li><strong>Generic Articles:</strong> Support for extracting content from other article websites</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                When you share a blog link in a cast, Sopha will:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                <li><strong>Display full content:</strong> The complete article content is fetched and displayed directly in the cast</li>
                <li><strong>Expandable section:</strong> Long articles are shown in an expandable section that you can open to read the full content</li>
                <li><strong>Quality scoring:</strong> The article content is included in quality scoring analysis</li>
                <li><strong>Rich previews:</strong> Article previews include title, content, and metadata</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                Blog content is automatically analyzed as part of the quality scoring system, so thoughtful articles contribute to higher quality scores. You can read the full article content without leaving Sopha by expanding the article section.
              </p>
            </div>
          </section>

          {/* What's a Collection */}
          <section className="border-b border-gray-200 dark:border-gray-800 pb-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
              What's a collection?
            </h2>
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                <strong>Note: Collections are upcoming and not yet released.</strong>
              </p>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Collections will be curated sets of casts that you can organize, customize, and share. They'll be perfect for:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                <li><strong>Theming Content:</strong> Group related casts by topic, event, or theme</li>
                <li><strong>Custom Display:</strong> Choose how casts are displayed (text-only, image-focused, or image-text)</li>
                <li><strong>Auto-Curation:</strong> Set up rules to automatically add casts that match certain criteria</li>
                <li><strong>Sharing:</strong> Create public collections to share with others, or keep them private</li>
                <li><strong>Organization:</strong> Build your own curated library of favorite casts</li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                Collections will support open (publicly accessible), gated to specific users, or custom access rules. Stay tuned for updates!
              </p>
            </div>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
          <p className="text-gray-600 dark:text-gray-400 text-center">
            Still have questions? Use the Feedback option in the help menu (?) or check out{" "}
            <Link href="/curators" className="text-accent-dark dark:text-accent hover:underline">
              Curators Instructions
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

