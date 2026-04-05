const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationResponse {
  messages: Message[];
  sentimentScores: number[];
}

export type StreamEvent =
  | { type: "conversation_update"; messages: Message[]; sentimentScore: number }
  | { type: "session_ended" }
  | { type: "session_reset" };

export async function sendMessage(message: string): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.body) throw new Error("No response body");
  return res.body;
}

export async function fetchConversation(): Promise<ConversationResponse> {
  const res = await fetch(`${API_URL}/api/conversation`);
  return res.json();
}

export function subscribeToStream(
  onEvent: (event: StreamEvent) => void
): () => void {
  const es = new EventSource(`${API_URL}/api/stream`);
  es.onmessage = (e) => {
    try {
      const data: StreamEvent = JSON.parse(e.data);
      onEvent(data);
    } catch {
      // ignore malformed
    }
  };
  return () => es.close();
}

export async function resetSession(): Promise<void> {
  await fetch(`${API_URL}/api/reset`, { method: "POST" });
}

export async function fetchSessionStatus(): Promise<{ active: boolean }> {
  const res = await fetch(`${API_URL}/api/session`);
  return res.json();
}

export async function endSession(onToken: (token: string) => void): Promise<void> {
  const res = await fetch(`${API_URL}/api/end-session`, { method: "POST" });
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }
}

export async function streamContextBrief(
  onToken: (token: string) => void
): Promise<void> {
  const res = await fetch(`${API_URL}/api/context-brief`, { method: "POST" });
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }
}
