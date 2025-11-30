"use client";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Simple markdown parser for basic syntax
  const parseMarkdown = (text: string): JSX.Element[] => {
    const lines = text.split("\n");
    const elements: JSX.Element[] = [];
    let currentList: string[] = [];
    let currentParagraph: string[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const paragraphText = currentParagraph.join(" ");
        if (paragraphText.trim()) {
          elements.push(
            <p key={`p-${elements.length}`} className="mb-4 text-gray-700 dark:text-gray-300 leading-relaxed">
              {parseInlineMarkdown(paragraphText)}
            </p>
          );
        }
        currentParagraph = [];
      }
    };

    const flushList = () => {
      if (currentList.length > 0) {
        elements.push(
          <ul key={`ul-${elements.length}`} className="mb-4 ml-6 list-disc space-y-2">
            {currentList.map((item, idx) => (
              <li key={idx} className="text-gray-700 dark:text-gray-300">
                {parseInlineMarkdown(item)}
              </li>
            ))}
          </ul>
        );
        currentList = [];
      }
    };

    lines.forEach((line, index) => {
      // Handle code blocks
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          // End code block
          elements.push(
            <pre key={`code-${elements.length}`} className="mb-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-x-auto">
              <code className="text-sm">{codeBlockContent.join("\n")}</code>
            </pre>
          );
          codeBlockContent = [];
          inCodeBlock = false;
        } else {
          // Start code block
          flushParagraph();
          flushList();
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        return;
      }

      const trimmed = line.trim();

      // Headers
      if (trimmed.startsWith("# ")) {
        flushParagraph();
        flushList();
        elements.push(
          <h1 key={`h1-${index}`} className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6 mt-8">
            {parseInlineMarkdown(trimmed.substring(2))}
          </h1>
        );
        return;
      }
      if (trimmed.startsWith("## ")) {
        flushParagraph();
        flushList();
        elements.push(
          <h2 key={`h2-${index}`} className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4 mt-6">
            {parseInlineMarkdown(trimmed.substring(3))}
          </h2>
        );
        return;
      }
      if (trimmed.startsWith("### ")) {
        flushParagraph();
        flushList();
        elements.push(
          <h3 key={`h3-${index}`} className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3 mt-5">
            {parseInlineMarkdown(trimmed.substring(4))}
          </h3>
        );
        return;
      }

      // Horizontal rule
      if (trimmed === "---" || trimmed === "***") {
        flushParagraph();
        flushList();
        elements.push(
          <hr key={`hr-${index}`} className="my-8 border-gray-300 dark:border-gray-700" />
        );
        return;
      }

      // List items (handle both - and * and also nested lists with indentation)
      // Check original line for nested lists (before trimming)
      if (/^\s{2,}- /.test(line) || /^\s{2,}\* /.test(line)) {
        flushParagraph();
        // Nested list item - add with indentation styling
        const listItem = trimmed.substring(2);
        currentList.push(listItem);
        return;
      }
      
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        flushParagraph();
        // Remove leading dash/asterisk and space
        const listItem = trimmed.substring(2);
        currentList.push(listItem);
        return;
      }

      // Empty line
      if (trimmed === "") {
        flushParagraph();
        flushList();
        return;
      }

      // Regular paragraph
      if (trimmed) {
        flushList();
        currentParagraph.push(trimmed);
      }
    });

    // Flush remaining content
    flushParagraph();
    flushList();

    return elements;
  };

  const parseInlineMarkdown = (text: string): (string | JSX.Element)[] => {
    if (!text) return [];
    
    const parts: (string | JSX.Element)[] = [];
    let currentIndex = 0;
    let lastIndex = 0;

    // Match bold text **text** or __text__
    const boldRegex = /\*\*(.+?)\*\*|__(.+?)__/g;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        const beforeText = text.substring(lastIndex, match.index);
        if (beforeText) {
          parts.push(beforeText);
        }
      }

      // Add bold text
      const boldText = match[1] || match[2];
      parts.push(
        <strong key={`bold-${currentIndex}`} className="font-semibold text-gray-900 dark:text-gray-100">
          {boldText}
        </strong>
      );

      lastIndex = match.index + match[0].length;
      currentIndex++;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      if (remainingText) {
        parts.push(remainingText);
      }
    }

    return parts.length > 0 ? parts : [text];
  };

  return (
    <div className="prose prose-lg dark:prose-invert max-w-none">
      {parseMarkdown(content)}
    </div>
  );
}
