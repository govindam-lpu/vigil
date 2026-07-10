"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/shell/wordmark";
import type { Folder as FolderRecord, Person } from "@/lib/types";
import { formatPersonName } from "@/lib/utils";

type CreatedState = {
  person: Person;
  folders: FolderRecord[];
};

export default function OnboardingPage() {
  const router = useRouter();
  const [careCircleName, setCareCircleName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedState | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/care-circles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        careCircleName,
        person: {
          firstName,
          lastName,
          dateOfBirth,
          preferredName,
          pronouns
        }
      })
    });

    const result = (await response.json()) as { person?: Person; folders?: FolderRecord[]; error?: string };
    setLoading(false);

    if (!response.ok || !result.person || !result.folders) {
      setError(result.error ?? "Unable to create care circle.");
      return;
    }

    setCreated({ person: result.person, folders: result.folders });
  };

  if (created) {
    const personName = formatPersonName(
      created.person.first_name,
      created.person.last_name,
      created.person.preferred_name
    );

    return (
      <main className="min-h-screen bg-neutral-50 px-6 py-10">
        <div className="mx-auto max-w-2xl">
          <Wordmark className="mb-6 text-lg text-neutral-900" />
          <Card>
            <CardHeader>
              <p className="font-mono text-sm font-medium text-neutral-500">Step 2 of 2</p>
              <CardTitle className="font-display text-lg tracking-tight">
                Your care circle for {personName} is ready.
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {created.folders.map((folderRecord) => (
                  <div
                    key={folderRecord.id}
                    className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-700"
                  >
                    <Folder className="h-4 w-4 text-neutral-500" aria-hidden="true" />
                    <span className="font-medium text-neutral-900">{folderRecord.name}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button type="button" onClick={() => router.push("/dashboard")}>
                  Go to Dashboard
                </Button>
                <Link className="text-sm font-medium text-brand-600 hover:underline" href="/settings/members">
                  Invite a family member
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Wordmark className="mb-6 text-lg text-neutral-900" />
        <Card>
          <CardHeader>
            <p className="font-mono text-sm font-medium text-neutral-500">Step 1 of 2</p>
            <CardTitle className="font-display text-lg tracking-tight">Create your care circle</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="careCircleName">Care circle name</Label>
                <Input
                  id="careCircleName"
                  value={careCircleName}
                  onChange={(event) => setCareCircleName(event.target.value)}
                  placeholder="Chen Family Care"
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Person&apos;s first name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Person&apos;s last name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Person&apos;s date of birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={dateOfBirth}
                  onChange={(event) => setDateOfBirth(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="preferredName">Preferred name</Label>
                  <Input
                    id="preferredName"
                    value={preferredName}
                    onChange={(event) => setPreferredName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pronouns">Pronouns</Label>
                  <Input id="pronouns" value={pronouns} onChange={(event) => setPronouns(event.target.value)} />
                </div>
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create care circle"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
