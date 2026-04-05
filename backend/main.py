import asyncio
import json
import os
from typing import AsyncGenerator

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

# ---------- In-memory state ----------
messages: list[dict] = []
sentiment_scores: list[float] = []
sse_queues: list[asyncio.Queue] = []
session_active: bool = True

# ---------- Hardcoded customer history ----------
CUSTOMER_HISTORY = {
    "name": "Jordan M.",
    "platform": "DoorDash",
    "prior_contacts": 3,
    "open_issue": "Unresolved refund on order #48821, initiated 14 days ago",
    "sentiment_trajectory": "Neutral → Frustrated → Angry",
    "last_interaction": "Requested human agent, was told to wait",
}

CHAT_SYSTEM_PROMPT = """You are a Giga AI support agent deployed for DoorDash.

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
- Do not over-apologize; take action"""


# ---------- SSE broadcast ----------
async def broadcast(event: dict) -> None:
    data = json.dumps(event)
    dead: list[asyncio.Queue] = []
    for q in sse_queues:
        try:
            q.put_nowait(data)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        sse_queues.remove(q)


# ---------- Sentiment scoring ----------
async def score_sentiment(user_message: str) -> float:
    context = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in messages[-6:]
    )
    prompt = (
        "Score the emotional sentiment of the LATEST customer message in this "
        "support conversation. Reply with ONLY valid JSON: {\"score\": <float>} "
        "where 0.0 is most negative/angry and 1.0 is most positive/calm.\n\n"
        f"Conversation context:\n{context}\n\nLatest customer message: {user_message}"
    )
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=64,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text.strip()
    try:
        score = float(json.loads(raw)["score"])
    except Exception:
        # fallback: extract first float found
        import re
        m = re.search(r"[0-9]*\.?[0-9]+", raw)
        score = float(m.group()) if m else 0.5
    return max(0.0, min(1.0, score))


# ---------- Endpoints ----------

class ChatRequest(BaseModel):
    message: str


@app.get("/api/session")
async def get_session():
    return {"active": session_active}


@app.post("/api/reset")
async def reset_session():
    global session_active
    messages.clear()
    sentiment_scores.clear()
    session_active = True
    await broadcast({"type": "session_reset"})
    return {"ok": True}


@app.post("/api/end-session")
async def end_session():
    global session_active
    session_active = False

    # Broadcast to all SSE subscribers (customer + admin)
    await broadcast({"type": "session_ended"})

    # Build full conversation transcript for summary
    transcript = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in messages
    )
    history = CUSTOMER_HISTORY
    prompt = (
        f"A customer support session just ended. Here is the full context:\n\n"
        f"Customer: {history['name']} | Platform: {history['platform']}\n"
        f"Prior contacts: {history['prior_contacts']} over 14 days\n"
        f"Ongoing issue: {history['open_issue']}\n"
        f"Pre-session sentiment trajectory: {history['sentiment_trajectory']}\n\n"
        f"Session transcript:\n{transcript if transcript else '(no messages exchanged)'}\n\n"
        f"Write a post-session summary with exactly these two sections:\n\n"
        f"**What the customer faced:**\n"
        f"1-2 sentences describing the core issue and experience in this session.\n\n"
        f"**Session summary:**\n"
        f"2-3 sentences covering what was discussed, any resolution or next steps, "
        f"and overall sentiment shift during the session. Be specific and factual."
    )

    async def generate() -> AsyncGenerator[bytes, None]:
        with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            for text in stream.text_stream:
                yield text.encode()

    return StreamingResponse(generate(), media_type="text/plain")


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not session_active:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Session has ended")
    user_message = req.message
    messages.append({"role": "user", "content": user_message})

    async def generate() -> AsyncGenerator[bytes, None]:
        collected = []
        with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=512,
            system=CHAT_SYSTEM_PROMPT,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                collected.append(text)
                yield text.encode()

        full_reply = "".join(collected)
        messages.append({"role": "assistant", "content": full_reply})

        # Score sentiment and broadcast update
        score = await score_sentiment(user_message)
        sentiment_scores.append(score)

        await broadcast(
            {
                "type": "conversation_update",
                "messages": messages,
                "sentimentScore": score,
            }
        )

    return StreamingResponse(generate(), media_type="text/plain")


@app.get("/api/stream")
async def stream():
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    sse_queues.append(q)

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            while True:
                data = await q.get()
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            if q in sse_queues:
                sse_queues.remove(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/conversation")
async def get_conversation():
    return {"messages": messages, "sentimentScores": sentiment_scores}


@app.post("/api/context-brief")
async def context_brief():
    history = CUSTOMER_HISTORY
    prompt = (
        f"You are analyzing a customer support case. Based on the following customer history, "
        f"write a concise 4-line context brief for the support agent. Use exactly these 4 lines:\n"
        f"1. What the customer is contacting about\n"
        f"2. Current emotional state and trajectory\n"
        f"3. What the agent must NOT do\n"
        f"4. Recommended approach for this session\n\n"
        f"Customer history:\n"
        f"- Name: {history['name']}\n"
        f"- Platform: {history['platform']}\n"
        f"- Prior contacts: {history['prior_contacts']} over 14 days\n"
        f"- Open issue: {history['open_issue']}\n"
        f"- Sentiment trajectory: {history['sentiment_trajectory']}\n"
        f"- Last interaction: {history['last_interaction']}\n\n"
        f"Write the brief now, numbered 1–4, one line each. Be direct and specific."
    )

    async def generate() -> AsyncGenerator[bytes, None]:
        with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            for text in stream.text_stream:
                yield text.encode()

    return StreamingResponse(generate(), media_type="text/plain")
