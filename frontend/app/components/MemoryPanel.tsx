"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Dot,
  ReferenceLine,
} from "recharts";
import { streamContextBrief } from "../lib/api";

interface MemoryPanelProps {
  sentimentScores: number[];
  sessionEnded: boolean;
  sessionSummary: string;
  sessionSummaryDone: boolean;
}

const CUSTOMER = {
  name: "Jordan M.",
  platform: "DoorDash",
  priorContacts: 3,
  openIssue: "Unresolved refund on order #48821",
  daysOutstanding: 14,
};

function scoreToColor(score: number): string {
  const r = Math.round(255 * Math.min(1, 2 * (1 - score)));
  const g = Math.round(255 * Math.min(1, 2 * score));
  return `rgb(${r}, ${g}, 60)`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomDot(props: any) {
  const { cx, cy, value } = props;
  return (
    <Dot cx={cx} cy={cy} r={4} fill={scoreToColor(value)} stroke="white" strokeWidth={1} />
  );
}

// Split the streamed summary into its two sections
function parseSummary(text: string): { faced: string; summary: string } {
  const facedMatch = text.match(/\*\*What the customer faced:\*\*\s*([\s\S]*?)(?=\*\*Session summary:\*\*|$)/i);
  const summaryMatch = text.match(/\*\*Session summary:\*\*\s*([\s\S]*)/i);
  return {
    faced: facedMatch ? facedMatch[1].trim() : "",
    summary: summaryMatch ? summaryMatch[1].trim() : "",
  };
}

export default function MemoryPanel({
  sentimentScores,
  sessionEnded,
  sessionSummary,
  sessionSummaryDone,
}: MemoryPanelProps) {
  const [brief, setBrief] = useState("");
  const [briefDone, setBriefDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    streamContextBrief((token) => {
      if (!cancelled) setBrief((prev) => prev + token);
    }).then(() => {
      if (!cancelled) setBriefDone(true);
    });
    return () => { cancelled = true; };
  }, []);

  const chartData = sentimentScores.map((score, i) => ({ index: i + 1, score }));
  const latestScore = sentimentScores[sentimentScores.length - 1] ?? 0.5;
  const lineColor = scoreToColor(latestScore);

  // Find where live session starts (after the 3 historical data points)
  const liveStartIndex = 4; // 1-based index where live session begins

  const { faced, summary } = parseSummary(sessionSummary);

  return (
    <div className="h-full flex flex-col gap-4 p-5 overflow-y-auto bg-gray-50 border-l border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${sessionEnded ? "bg-gray-400" : "bg-green-400 animate-pulse"}`} />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Agent Memory
          </span>
        </div>
        {sessionEnded && (
          <span className="text-[10px] font-semibold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full uppercase tracking-wider">
            Session Ended
          </span>
        )}
      </div>

      {/* Customer Profile */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-gray-900">{CUSTOMER.name}</span>
          <span className="text-xs bg-[#FF3008] text-white px-2 py-0.5 rounded-full font-medium">
            {CUSTOMER.platform}
          </span>
        </div>
        <div className="text-xs text-gray-500 space-y-1">
          <p>
            <span className="text-gray-400">Prior contacts:</span>{" "}
            <span className="text-gray-700 font-medium">
              {CUSTOMER.priorContacts} over 14 days
            </span>
          </p>
          <p>
            <span className="text-gray-400">Open issue:</span>{" "}
            <span className="text-gray-700 font-medium">{CUSTOMER.openIssue}</span>
          </p>
          <p>
            <span className="text-gray-400">Days outstanding:</span>{" "}
            <span className="text-red-600 font-semibold">{CUSTOMER.daysOutstanding} days</span>
          </p>
        </div>
      </div>

      {/* Overall Sentiment Graph */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {sessionEnded ? "Overall Sentiment" : "Sentiment Trend"}
          </p>
          {chartData.length > 0 && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: scoreToColor(latestScore) + "22",
                color: scoreToColor(latestScore),
              }}
            >
              {latestScore.toFixed(2)}
            </span>
          )}
        </div>
        {chartData.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Waiting for interactions...</p>
        ) : (
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
              <XAxis
                dataKey="index"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 1]}
                ticks={[0, 0.5, 1]}
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(val: number) => [val.toFixed(2), "Sentiment"]}
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                }}
              />
              {/* Divider between historical and live data */}
              {chartData.length >= liveStartIndex && (
                <ReferenceLine
                  x={liveStartIndex}
                  stroke="#d1d5db"
                  strokeDasharray="3 3"
                  label={{ value: "live", position: "top", fontSize: 9, fill: "#9ca3af" }}
                />
              )}
              <Line
                type="monotone"
                dataKey="score"
                stroke={lineColor}
                strokeWidth={2}
                dot={<CustomDot />}
                activeDot={{ r: 5 }}
                isAnimationActive={true}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>negative</span>
          <span>positive</span>
        </div>
      </div>

      {/* Session Summary (shown after session ends) */}
      {sessionEnded && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Session Summary
          </p>
          {!sessionSummary ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-3 bg-gray-100 rounded animate-pulse"
                  style={{ width: `${70 + (i % 3) * 10}%` }}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3 text-xs text-gray-700 leading-relaxed">
              {faced && (
                <div>
                  <p className="font-semibold text-gray-500 mb-1">What the customer faced</p>
                  <p className="whitespace-pre-wrap">
                    {faced}
                    {!sessionSummaryDone && !summary && (
                      <span className="inline-block w-1.5 h-3 bg-gray-400 ml-0.5 animate-pulse rounded-sm" />
                    )}
                  </p>
                </div>
              )}
              {summary && (
                <div>
                  <p className="font-semibold text-gray-500 mb-1">Conversation summary</p>
                  <p className="whitespace-pre-wrap">
                    {summary}
                    {!sessionSummaryDone && (
                      <span className="inline-block w-1.5 h-3 bg-gray-400 ml-0.5 animate-pulse rounded-sm" />
                    )}
                  </p>
                </div>
              )}
              {/* Show raw text if sections haven't parsed yet */}
              {!faced && !summary && sessionSummary && (
                <p className="whitespace-pre-wrap">
                  {sessionSummary}
                  {!sessionSummaryDone && (
                    <span className="inline-block w-1.5 h-3 bg-gray-400 ml-0.5 animate-pulse rounded-sm" />
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Context Brief */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Pre-Session Brief
        </p>
        {brief ? (
          <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
            {brief}
            {!briefDone && (
              <span className="inline-block w-1.5 h-3 bg-gray-400 ml-0.5 animate-pulse rounded-sm" />
            )}
          </p>
        ) : (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${75 + i * 5}%` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
