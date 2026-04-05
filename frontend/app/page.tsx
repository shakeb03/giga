"use client";

import { useState, useRef, useEffect } from "react";
import ChatPane from "./components/ChatPane";
import { sendMessage, resetSession, subscribeToStream, type Message } from "./lib/api";

export default function CustomerPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [sessionActive, setSessionActive] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset backend state on mount — customer page owns the session
  useEffect(() => {
    resetSession();
  }, []);

  // Listen for session_ended via SSE
  useEffect(() => {
    const unsubscribe = subscribeToStream((event) => {
      if (event.type === "session_ended") {
        setSessionActive(false);
        setSending(false);
        setStreaming(undefined);
      }
    });
    return unsubscribe;
  }, []);

  const disabled = sending || !sessionActive;

  async function handleSend() {
    const text = input.trim();
    if (!text || disabled) return;

    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setStreaming("");

    try {
      const stream = await sendMessage(text);
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setStreaming(full);
      }

      setMessages((prev) => [...prev, { role: "assistant", content: full }]);
    } catch {
      // session may have ended mid-stream — silently swallow
    } finally {
      setStreaming(undefined);
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-center w-8 h-8 bg-[#FF3008] rounded-lg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">DoorDash Support</p>
          {sessionActive ? (
            <p className="text-xs text-green-500 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full" />
              Agent online
            </p>
          ) : (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full" />
              Session ended
            </p>
          )}
        </div>
      </header>

      {/* Welcome banner */}
      {messages.length === 0 && sessionActive && (
        <div className="mx-4 mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
          <p className="text-sm text-gray-600">
            Hi <span className="font-semibold text-gray-800">Jordan</span>, welcome back.{" "}
            How can we help you today?
          </p>
        </div>
      )}

      {/* Chat */}
      <div className="flex-1 overflow-hidden">
        <ChatPane messages={messages} streamingContent={streaming} />
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-200 px-4 py-3 bg-white">
        {sessionActive ? (
          <>
            <div className="flex items-center gap-2 bg-gray-100 rounded-2xl px-4 py-2.5">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={disabled}
                className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || disabled}
                className="flex items-center justify-center w-8 h-8 bg-[#FF3008] text-white rounded-full disabled:opacity-40 transition-opacity hover:opacity-90 shrink-0"
                aria-label="Send"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <p className="text-center text-[10px] text-gray-400 mt-2">
              Powered by Giga AI
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 py-2">
            <p className="text-sm font-medium text-gray-500">This session has ended.</p>
            <p className="text-xs text-gray-400">Thank you for contacting DoorDash Support.</p>
          </div>
        )}
      </div>
    </div>
  );
}
