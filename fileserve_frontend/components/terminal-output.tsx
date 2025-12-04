"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2, Terminal, X } from "lucide-react";

interface StreamEvent {
  type: "output" | "error" | "complete";
  message: string;
  success?: boolean;
}

interface TerminalOutputProps {
  url: string;
  onComplete?: (success: boolean) => void;
  onClose?: () => void;
  title?: string;
}

export function TerminalOutput({ url, onComplete, onClose, title = "Installation Progress" }: TerminalOutputProps) {
  const [lines, setLines] = useState<{ text: string; type: "output" | "error" }[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [finalMessage, setFinalMessage] = useState<string>("");
  const outputRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const processLine = useCallback((line: string) => {
    if (!line.startsWith("data: ")) return;

    try {
      const jsonStr = line.substring(6); // Remove "data: " prefix
      const data: StreamEvent = JSON.parse(jsonStr);

      if (data.type === "complete") {
        setIsComplete(true);
        setSuccess(data.success ?? false);
        setFinalMessage(data.message);
        onComplete?.(data.success ?? false);
      } else {
        setLines((prev) => [
          ...prev,
          { text: data.message, type: data.type as "output" | "error" },
        ]);
      }
    } catch (e) {
      console.error("Failed to parse SSE data:", e, line);
    }
  }, [onComplete]);

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const startStream = async () => {
      try {
        // Get the auth token from localStorage
        const token = localStorage.getItem("auth_token");

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Accept": "text/event-stream",
            ...(token ? { "Authorization": `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Process any remaining data in buffer
            if (buffer.trim()) {
              const lines = buffer.split("\n");
              for (const line of lines) {
                if (line.trim()) {
                  processLine(line);
                }
              }
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines (SSE format: "data: {...}\n\n")
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || ""; // Keep incomplete part in buffer

          for (const part of parts) {
            const lines = part.split("\n");
            for (const line of lines) {
              if (line.trim()) {
                processLine(line);
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return; // Ignore abort errors
        }
        console.error("Stream error:", error);
        setLines((prev) => [...prev, { text: `Error: ${error}`, type: "error" }]);
        setIsComplete(true);
        setSuccess(false);
        setFinalMessage("Connection to server lost");
        onComplete?.(false);
      }
    };

    startStream();

    return () => {
      controller.abort();
    };
  }, [url, processLine, onComplete]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <Card className="border-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          <span className="font-medium text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {!isComplete ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running
            </Badge>
          ) : success ? (
            <Badge variant="default" className="bg-green-600 gap-1">
              <CheckCircle className="h-3 w-3" />
              Complete
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              Failed
            </Badge>
          )}
          {isComplete && onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Terminal Output */}
      <div
        ref={outputRef}
        className="bg-black text-green-400 p-4 font-mono text-sm overflow-auto max-h-96 min-h-48"
        style={{ fontFamily: "'Fira Code', 'Consolas', monospace" }}
      >
        {lines.map((line, idx) => (
          <div
            key={idx}
            className={`whitespace-pre-wrap ${
              line.type === "error" ? "text-red-400" : ""
            }`}
          >
            {line.text}
          </div>
        ))}
        {!isComplete && (
          <div className="inline-block animate-pulse">_</div>
        )}
      </div>

      {/* Footer with final message */}
      {isComplete && finalMessage && (
        <div
          className={`px-4 py-2 text-sm border-t ${
            success
              ? "bg-green-500/10 text-green-600"
              : "bg-red-500/10 text-red-600"
          }`}
        >
          {finalMessage}
        </div>
      )}
    </Card>
  );
}
