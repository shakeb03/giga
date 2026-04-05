"use client";

import { useEffect, useRef } from "react";
import type { Message } from "../lib/api";

// Renders **bold** and line breaks from plain text
function renderMarkdown(text: string): React.ReactNode {
  return text.split("\n").map((line, lineIdx, lines) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, partIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={partIdx}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
    return (
      <span key={lineIdx}>
        {rendered}
        {lineIdx < lines.length - 1 && <br />}
      </span>
    );
  });
}

interface ChatPaneProps {
  messages: Message[];
  streamingContent?: string;
}

export default function ChatPane({ messages, streamingContent }: ChatPaneProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const allMessages: Message[] = streamingContent
    ? [...messages, { role: "assistant", content: streamingContent }]
    : messages;

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto h-full">
      {allMessages.length === 0 && (
        <p className="text-gray-400 text-sm text-center mt-8">
          No messages yet.
        </p>
      )}
      {allMessages.map((msg, i) => (
        <div
          key={i}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-[#FF3008] text-white rounded-br-sm"
                : "bg-gray-100 text-gray-800 rounded-bl-sm"
            }`}
          >
            {renderMarkdown(msg.content)}
            {streamingContent &&
              i === allMessages.length - 1 &&
              msg.role === "assistant" && (
                <span className="inline-block w-1.5 h-3.5 bg-gray-500 ml-0.5 animate-pulse rounded-sm" />
              )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
