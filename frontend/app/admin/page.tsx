"use client";

import { useEffect, useState } from "react";
import ChatPane from "../components/ChatPane";
import MemoryPanel from "../components/MemoryPanel";
import { fetchConversation, subscribeToStream, endSession, type Message } from "../lib/api";

const INITIAL_SENTIMENT: number[] = [0.5, 0.25, 0.1];

export default function AdminPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sentimentScores, setSentimentScores] = useState<number[]>(INITIAL_SENTIMENT);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [ending, setEnding] = useState(false);
  const [sessionSummary, setSessionSummary] = useState("");
  const [sessionSummaryDone, setSessionSummaryDone] = useState(false);

  // Hydrate on mount — reflects whatever state the backend currently holds
  useEffect(() => {
    fetchConversation().then((data) => {
      setMessages(data.messages);
      setSentimentScores(
        data.sentimentScores.length > 0
          ? [...INITIAL_SENTIMENT, ...data.sentimentScores]
          : INITIAL_SENTIMENT
      );
    });
  }, []);

  // Subscribe to SSE stream
  useEffect(() => {
    const unsubscribe = subscribeToStream((event) => {
      if (event.type === "conversation_update") {
        setMessages(event.messages);
        setSentimentScores((prev) => [...prev, event.sentimentScore]);
      } else if (event.type === "session_ended") {
        setSessionEnded(true);
      } else if (event.type === "session_reset") {
        setMessages([]);
        setSentimentScores(INITIAL_SENTIMENT);
        setSessionEnded(false);
        setEnding(false);
        setSessionSummary("");
        setSessionSummaryDone(false);
      }
    });
    return unsubscribe;
  }, []);

  async function handleEndSession() {
    if (ending || sessionEnded) return;
    setEnding(true);
    setSessionEnded(true);
    setSessionSummary("");
    setSessionSummaryDone(false);
    try {
      await endSession((token) => {
        setSessionSummary((prev) => prev + token);
      });
    } finally {
      setSessionSummaryDone(true);
      setEnding(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 bg-gray-900 rounded-lg">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <circle cx="12" cy="8" r="4" />
              <path d="M20 21a8 8 0 1 0-16 0" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Giga AI — Agent Monitor</p>
            <p className="text-xs text-gray-400">DoorDash · Jordan M.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live / Ended badge */}
          {sessionEnded ? (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
              Session ended
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-200">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Live
            </div>
          )}

          {/* End Session button */}
          {!sessionEnded && (
            <button
              onClick={handleEndSession}
              disabled={ending}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {ending ? "Ending…" : "End Session"}
            </button>
          )}
        </div>
      </header>

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: conversation (60%) */}
        <div className="flex flex-col" style={{ width: "60%" }}>
          <div className="px-4 pt-3 pb-1 shrink-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Conversation
            </p>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatPane messages={messages} />
          </div>
          {/* Session ended overlay on conversation pane */}
          {sessionEnded && (
            <div className="shrink-0 px-4 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-center text-gray-400">
                Session ended — conversation is read-only
              </p>
            </div>
          )}
        </div>

        {/* Right: memory panel (40%) */}
        <div style={{ width: "40%" }} className="overflow-hidden">
          <MemoryPanel
            sentimentScores={sentimentScores}
            sessionEnded={sessionEnded}
            sessionSummary={sessionSummary}
            sessionSummaryDone={sessionSummaryDone}
          />
        </div>
      </div>
    </div>
  );
}
