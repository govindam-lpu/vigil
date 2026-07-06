"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/ui/load-error";
import type { AiProvider } from "@/lib/types";

type AiConfigPublic = {
  provider: AiProvider | null;
  keyLast4: string | null;
  hasKey: boolean;
  geminiFreeTierAck: boolean;
  modelOverrides: Record<string, string> | null;
  managedAvailable: boolean;
};

type CostEstimate = {
  provider: string;
  configured: boolean;
  documents30d: number;
  notes30d: number;
  summaries30d: number;
  perOp: { extraction: number; noteSuggestion: number; summary: number };
  estimatedMonthlyUsd: number;
  actualSpend30dUsd: number;
};

const PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: "Anthropic Claude",
  gemini: "Google Gemini",
  managed: "Managed (app-provided)"
};

function usd(value: number, digits = 2): string {
  return `$${value.toFixed(digits)}`;
}

export function AiSettings({ careCircleId, canManage }: { careCircleId: string; canManage: boolean }) {
  const [config, setConfig] = useState<AiConfigPublic | null>(null);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>("anthropic");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [geminiAck, setGeminiAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async (isCancelled?: () => boolean) => {
    if (!canManage) return;
    try {
      setError(null);
      const [configResponse, estimateResponse] = await Promise.all([
        fetch(`/api/ai/provider?careCircleId=${careCircleId}`),
        fetch(`/api/ai/cost-estimate?careCircleId=${careCircleId}`)
      ]);
      if (!configResponse.ok || !estimateResponse.ok) throw new Error("Request failed");
      const configJson = (await configResponse.json()) as { config: AiConfigPublic };
      const estimateJson = (await estimateResponse.json()) as { estimate: CostEstimate };
      if (isCancelled?.()) return;
      setConfig(configJson.config);
      setEstimate(estimateJson.estimate);
      if (configJson.config.provider) setSelectedProvider(configJson.config.provider);
      setGeminiAck(configJson.config.geminiFreeTierAck);
    } catch {
      if (isCancelled?.()) return;
      setError("We couldn't load AI settings. Check your connection and try again.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [careCircleId, canManage]);

  const keyOnFileForSelected = Boolean(config?.hasKey && config.provider === selectedProvider);
  const needsKey = selectedProvider !== "managed" && !apiKeyInput.trim() && !keyOnFileForSelected;
  const geminiBlocked = selectedProvider === "gemini" && !geminiAck;
  const managedBlocked = selectedProvider === "managed" && !config?.managedAvailable;
  const saveDisabled = saving || needsKey || geminiBlocked || managedBlocked;

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/ai/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careCircleId,
          provider: selectedProvider,
          apiKey: apiKeyInput.trim() ? apiKeyInput.trim() : undefined,
          geminiFreeTierAck: selectedProvider === "gemini" ? geminiAck : undefined
        })
      });
      const json = (await response.json()) as { config?: AiConfigPublic; error?: string };
      if (!response.ok) {
        setError(json.error ?? "We couldn't save the AI provider.");
        return;
      }
      setApiKeyInput("");
      setNotice("AI settings saved.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/ai/provider?careCircleId=${careCircleId}`, { method: "DELETE" });
      if (!response.ok) {
        setError("We couldn't remove the AI key.");
        return;
      }
      setApiKeyInput("");
      setNotice("AI features disabled and key removed.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-8">
      <div>
        <h2 className="text-md font-semibold text-neutral-900">AI Features</h2>
        <p className="text-sm text-neutral-500">
          AI features (document extraction, catch-up summaries, suggested tasks) are optional and run on an API key you
          provide. Every AI result is a suggestion you confirm — nothing is saved automatically.
        </p>
      </div>

      {!canManage ? (
        <Card className="mt-4">
          <p className="text-sm text-neutral-600">AI features are configured by coordinators and owners.</p>
        </Card>
      ) : config === null ? (
        <Card className="mt-4">
          <p className="text-sm text-neutral-500">Loading AI settings…</p>
        </Card>
      ) : (
        <>
          {error ? (
            <div className="mt-4">
              <LoadError message={error} onRetry={() => void load()} />
            </div>
          ) : null}

          <Card className="mt-4 flex items-center justify-between">
            <div className="text-sm">
              {config.provider ? (
                <span className="font-medium text-neutral-900">
                  AI is enabled via {PROVIDER_LABEL[config.provider]}
                  {config.keyLast4 ? <span className="text-neutral-500"> · key ····{config.keyLast4}</span> : null}
                </span>
              ) : (
                <span className="text-neutral-600">AI features are off — no provider configured.</span>
              )}
            </div>
            <Badge variant={config.provider ? "green" : "neutral"}>{config.provider ? "Enabled" : "Off"}</Badge>
          </Card>

          {notice ? <p className="mt-3 text-sm font-medium text-green-700">{notice}</p> : null}

          <div className="mt-4 space-y-3">
            <ProviderChoice
              selected={selectedProvider === "anthropic"}
              onSelect={() => setSelectedProvider("anthropic")}
              title="Anthropic Claude"
              badge={{ label: "Recommended", variant: "green" }}
              description="Your data is not used to train AI models. Anthropic's API has no permanent free tier — new accounts get a small trial credit, then it's pay-per-use. Most care circles spend well under $1/month."
              link={{ href: "https://console.anthropic.com/settings/keys", label: "Create an Anthropic API key" }}
            />

            <ProviderChoice
              selected={selectedProvider === "gemini"}
              onSelect={() => setSelectedProvider("gemini")}
              title="Google Gemini"
              badge={{ label: "Free tier available", variant: "yellow" }}
              description="Gemini has a free tier, but on the free tier Google may use the information you submit — including the contents of uploaded medical documents — to improve its models. If you add billing to your Google Cloud project, your data is not used for training."
              link={{ href: "https://aistudio.google.com/apikey", label: "Create a Gemini API key" }}
            >
              {selectedProvider === "gemini" ? (
                <div className="mt-3 border-l-4 border-orange-500 bg-neutral-50 p-4">
                  <p className="text-sm font-medium text-neutral-900">Health-data notice</p>
                  <p className="mt-1 text-sm text-neutral-600">
                    Only choose the free tier if you are comfortable with Google potentially using this person&apos;s
                    health information to improve its models.
                  </p>
                  <label className="mt-3 flex items-start gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={geminiAck}
                      onChange={(event) => setGeminiAck(event.target.checked)}
                    />
                    <span>
                      I understand that on Gemini&apos;s free tier, Google may use our uploaded health information to
                      improve its models.
                    </span>
                  </label>
                </div>
              ) : null}
            </ProviderChoice>

            {config.managedAvailable ? (
              <ProviderChoice
                selected={selectedProvider === "managed"}
                onSelect={() => setSelectedProvider("managed")}
                title="Managed (app-provided)"
                badge={{ label: "No setup", variant: "primary" }}
                description="Vigil supplies the AI key for your care circle. No key entry required."
              />
            ) : null}
          </div>

          {selectedProvider !== "managed" ? (
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">
                {keyOnFileForSelected ? "Replace API key" : "API key"}
              </span>
              <Input
                type="password"
                autoComplete="off"
                placeholder={keyOnFileForSelected ? "Enter a new key to replace the current one" : "Paste your API key"}
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
              />
              <span className="mt-1 block text-xs text-neutral-400">
                Keys are encrypted at rest and never shown again after saving.
                {keyOnFileForSelected && config.keyLast4 ? ` Current key ends in ····${config.keyLast4}.` : ""}
              </span>
            </label>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={save} disabled={saveDisabled}>
              {saving ? "Saving…" : "Save AI settings"}
            </Button>
            {config.provider ? (
              <Button variant="destructive" onClick={removeKey} disabled={saving}>
                Remove key &amp; disable
              </Button>
            ) : null}
          </div>

          {estimate ? <CostEstimateCard estimate={estimate} /> : null}
        </>
      )}
    </section>
  );
}

function ProviderChoice({
  selected,
  onSelect,
  title,
  badge,
  description,
  link,
  children
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  badge: { label: string; variant: "green" | "yellow" | "primary" };
  description: string;
  link?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <Card className={selected ? "border-blue-600 ring-1 ring-blue-600" : ""}>
      <button type="button" onClick={onSelect} className="flex w-full items-start gap-3 text-left">
        <span
          className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
            selected ? "border-blue-600" : "border-neutral-300"
          }`}
        >
          {selected ? <span className="h-2 w-2 rounded-full bg-blue-600" /> : null}
        </span>
        <span className="flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-900">{title}</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </span>
          <span className="mt-1 block text-sm text-neutral-600">{description}</span>
        </span>
      </button>
      {link ? (
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
        >
          {link.label}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      ) : null}
      {children}
    </Card>
  );
}

function CostEstimateCard({ estimate }: { estimate: CostEstimate }) {
  return (
    <Card className="mt-6">
      <h3 className="text-sm font-semibold text-neutral-900">Estimated monthly cost</h3>
      <p className="mt-1 text-sm text-neutral-500">
        Based on your last 30 days of activity. Most care circles spend well under $1/month.
      </p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-xl font-bold text-neutral-900">≈ {usd(estimate.estimatedMonthlyUsd)}</span>
        <span className="text-sm text-neutral-500">/ month</span>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-1 text-sm text-neutral-600 sm:grid-cols-2">
        <div className="flex justify-between gap-4">
          <dt>{estimate.documents30d} documents × {usd(estimate.perOp.extraction, 3)}</dt>
          <dd>{usd(estimate.documents30d * estimate.perOp.extraction)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{estimate.notes30d} notes × {usd(estimate.perOp.noteSuggestion, 3)}</dt>
          <dd>{usd(estimate.notes30d * estimate.perOp.noteSuggestion)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>{estimate.summaries30d} summaries × {usd(estimate.perOp.summary, 3)}</dt>
          <dd>{usd(estimate.summaries30d * estimate.perOp.summary)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Actual AI spend (last 30 days)</dt>
          <dd>{usd(estimate.actualSpend30dUsd)}</dd>
        </div>
      </dl>
    </Card>
  );
}
