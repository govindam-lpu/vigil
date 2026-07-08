"use client";

import { Check, Copy, Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type PacketResponse = { url: string; fileName: string; expiresAt: string };

// Generates the Emergency Packet on open (spec: spinner, max ~10s), then offers a
// download and a 24h read-only share link.
export function EmergencyPacketModal({
  careCircleId,
  personId,
  onClose
}: {
  careCircleId: string;
  personId: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [packet, setPacket] = useState<PacketResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/emergency-packet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ careCircleId, personId })
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(json.error ?? "We couldn't generate the packet.");
        setStatus("error");
        return;
      }
      const data = (await response.json()) as PacketResponse;
      setPacket(data);
      setStatus("ready");
    } catch {
      setErrorMessage("We couldn't generate the packet. Check your connection and try again.");
      setStatus("error");
    }
  }, [careCircleId, personId]);

  useEffect(() => {
    void generate();
  }, [generate]);

  const download = async () => {
    if (!packet) return;
    try {
      const response = await fetch(packet.url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = packet.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(packet.url, "_blank", "noopener,noreferrer");
    }
  };

  const copyLink = async () => {
    if (!packet) return;
    try {
      await navigator.clipboard.writeText(packet.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the link is still shown for manual copy.
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">Emergency Packet</h2>

        {status === "loading" ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-hidden="true" />
            <p className="text-sm text-neutral-600">Preparing the Emergency Packet…</p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="mt-4">
            <p className="text-sm text-red-600">{errorMessage}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => void generate()}>Try again</Button>
            </div>
          </div>
        ) : null}

        {status === "ready" && packet ? (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void download()}>
                <Download className="h-4 w-4" aria-hidden="true" />
                Download PDF
              </Button>
              <Button variant="secondary" onClick={() => void copyLink()}>
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? "Copied" : "Copy share link"}
              </Button>
            </div>
            <div className="mt-4 rounded-lg border border-yellow-600/40 bg-yellow-50 p-3">
              <p className="text-xs text-yellow-800">
                This link expires in 24 hours. Anyone with the link can view it.
              </p>
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="ghost" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
