# Giga AI — Agent Memory Demo
**Product Requirements Document**
Built by Shakeb Mohammed | [shakeb.tech](https://shakeb.tech) | [linkedin.com/in/shakeb](https://linkedin.com/in/shakeb)

---

## 1. Overview

This document defines the requirements for a targeted engineering demo built for Giga AI. The demo is an unsolicited prototype that brings to life one of Giga's roadmap features: agent memory with real-time contextual awareness.

The goal is to show Varun Vummadi (CEO) and Esha Manideep (CTO) that Shakeb can ship production-quality AI infrastructure independently and quickly, targeting one of the exact problems Giga is solving.

---

## 2. System Description

The demo has two views served from the same Next.js app, sharing a single FastAPI backend session.

**Customer view (`/`)** — A minimal DoorDash-branded support chat widget. The user types as Jordan M. Every message is sent to FastAPI, which automatically generates and streams an AI agent reply using the Anthropic API with full memory context injected. No memory panel, no brief visible to the customer.

**Admin view (`/admin`)** — The full agent monitoring interface. Two-panel layout: live conversation on the left, memory panel with sentiment graph and context brief on the right. Reads the same conversation in real time via SSE. Sentiment graph updates automatically after every customer message.

On Loom: both views open in split screen. You type on the customer side, the admin side reacts live.

> **Demo Scenario:** Customer: Jordan M. | Account: DoorDash | 3 prior contacts over 14 days | Unresolved refund on order #48821 | Sentiment trajectory: Neutral → Frustrated → Angry

---

## 3. Features

### 3.1 Customer View (`/`)

A clean, minimal chat interface. Looks like a DoorDash support widget.

- No memory panel or agent tooling visible
- Customer types a message and hits send
- Message is POST'd to `/api/chat` on FastAPI
- Agent reply streams back token by token
- No system context exposed on the customer side

### 3.2 Admin View (`/admin`) — Memory Panel

A persistent right-side panel displaying the customer's static profile data on load.

- Customer name and account platform (DoorDash)
- Total prior contact count
- Open issue summary: unresolved refund, order number, days outstanding

### 3.3 Admin View — Sentiment Graph

A Recharts line chart inside the memory panel showing sentiment score across all interactions including the live session.

- Three hardcoded historical data points on load: Neutral (0.5), Frustrated (0.25), Angry (0.1)
- After every customer message, FastAPI re-scores sentiment and broadcasts the new score via SSE
- Admin view appends the new data point and re-renders the chart
- Chart color shifts warmer (toward red) as sentiment drops; cooler (toward green) as it recovers
- X-axis: interaction index. Y-axis: normalized sentiment score 0.0 to 1.0

### 3.4 Admin View — Context Brief

On `/admin` page load, the frontend calls `POST /api/context-brief`. FastAPI sends the full prior interaction history to Anthropic and streams back a structured 4-line brief:

- What the customer is contacting about
- Current emotional state and trajectory
- What the agent must NOT do (e.g. ask them to re-explain the issue)
- Recommended approach for this session

Streams token by token into the memory panel. No pre-filled opener on admin — the agent reply is fully autonomous.

### 3.5 Autonomous Agent Reply

The agent reply is AI-generated automatically after every customer message. No manual trigger required.

- FastAPI receives the customer message via `POST /api/chat`
- Injects full memory context into the system prompt
- Calls Anthropic API and streams the reply back to the customer view
- After streaming completes, scores sentiment and broadcasts a `conversation_update` event to all SSE subscribers (admin view)

### 3.6 Real-Time Sync via SSE

Both views connect to a shared SSE stream at `GET /api/stream`. FastAPI maintains an in-memory list of messages and sentiment scores for the session.

- When a new customer message arrives and agent reply is generated, FastAPI pushes an event to all SSE subscribers
- Admin view receives the event and updates the conversation thread and sentiment graph without a page reload
- No database, no websockets — SSE only

---

## 4. Tech Stack

### 4.1 Frontend — Vercel

| | |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts (sentiment line graph, admin only) |
| Real-time | `EventSource` API subscribing to FastAPI SSE stream |
| Streaming | `fetch()` with `ReadableStream` for agent reply on customer view |
| State | React `useState` — all session data in memory, no persistence |
| Deployment | Vercel, deployed directly from GitHub (no CI/CD) |
| Env Var | `NEXT_PUBLIC_API_URL` — points to Railway FastAPI service |

### 4.2 Backend — Railway

| | |
|---|---|
| Framework | FastAPI (Python) |
| LLM SDK | Anthropic Python SDK (streaming) |
| Real-time | SSE via `asyncio.Queue` — one queue per connected admin client |
| CORS | Configured to allow Vercel frontend domain |
| Deployment | Railway, deployed directly from GitHub (no CI/CD) |
| Env Var | `ANTHROPIC_API_KEY` |
| Data | Hardcoded customer history dict + in-memory message list — no database |

### 4.3 File Structure

```
/backend
  main.py              # FastAPI app — all endpoints, SSE broadcast logic
  requirements.txt     # fastapi, uvicorn, anthropic, sse-starlette
  railway.toml         # start command: uvicorn main:app --host 0.0.0.0 --port 8000

/frontend
  app/page.tsx                      # customer view — DoorDash support widget
  app/admin/page.tsx                # admin view — two-panel agent monitoring UI
  app/components/MemoryPanel.tsx    # memory panel, sentiment graph, context brief
  app/components/ChatPane.tsx       # shared message thread component
  app/lib/api.ts                    # fetch wrappers for all backend calls
```

---

## 5. API Endpoints

### `POST /api/chat`

Called by the customer view on every message send.

**Request body:**
```json
{ "message": "string" }
```

**Response:** SSE stream. Streams the agent reply token by token back to the customer view. After streaming completes, FastAPI scores sentiment and broadcasts a `conversation_update` event to all SSE subscribers.

### `GET /api/stream`

Subscribed to by the admin view on page load. Keeps the connection open and pushes events as they occur.

**Event shape:**
```json
{
  "type": "conversation_update",
  "messages": [{ "role": "user|assistant", "content": "string" }],
  "sentimentScore": 0.0
}
```

### `GET /api/conversation`

Called by the admin view on initial page load to hydrate the conversation history and existing sentiment scores before the SSE stream takes over.

**Response:**
```json
{
  "messages": [{ "role": "user|assistant", "content": "string" }],
  "sentimentScores": [0.5, 0.25, 0.1]
}
```

### `POST /api/context-brief`

Called once by the admin view on page load. No request body — customer history is hardcoded server-side.

**Response:** SSE stream. Streams the 4-line context brief token by token.

### `POST /api/sentiment`

Internal — called by FastAPI itself after each chat exchange, not by the frontend directly. Scores the latest customer message and returns a normalized float.

**Response:**
```json
{ "score": 0.0 }
```
Score normalized 0.0 (most negative) to 1.0 (most positive).

---

## 6. System Prompt (Chat Turns)

Injected into every Anthropic API call inside `/api/chat`:

```
You are a Giga AI support agent deployed for DoorDash.

Customer memory:
- Name: Jordan M.
- 3 prior contacts over 14 days
- Unresolved refund: order #48821, initiated 14 days ago
- Sentiment trend: Neutral → Frustrated → Angry
- Last interaction: requested human agent, was told to wait

Rules:
- Never ask Jordan to explain their issue again
- Proactively acknowledge the refund is pending
- Be concise, empathetic, and resolution-focused
- Do not over-apologize; take action
```

---

## 7. Out of Scope

- Authentication or route protection on `/admin`
- Multiple customer profiles or sessions
- Database or persistent storage — session memory only
- Websockets — SSE is sufficient
- Typing indicators
- Mobile responsive design — desktop Loom only

---

*Shakeb Mohammed | shakeb.tech | linkedin.com/in/shakeb*