"use client";

import { useEffect, useState } from "react";
import { Lock, Plus, StickyNote } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import type { HydratedNote } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export function NotesView() {
  const { activeCircle } = useActiveCircle();
  const [notes, setNotes] = useState<HydratedNote[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    if (!activeCircle?.person) return;
    const response = await fetch(`/api/notes?careCircleId=${activeCircle.careCircle.id}&personId=${activeCircle.person.id}`);
    const json = (await response.json()) as { notes?: HydratedNote[]; currentUserId?: string; currentRole?: string };
    setNotes(json.notes ?? []);
    setCurrentUserId(json.currentUserId ?? "");
    setCurrentRole(json.currentRole ?? "");
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCircle?.careCircle.id, activeCircle?.person?.id]);

  if (!activeCircle?.person) return null;

  return (
    <div className="mx-auto max-w-[960px] p-6">
      <div className="sticky top-14 z-20 -mx-2 flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-2 py-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Notes</h1>
          <p className="text-sm text-neutral-500">Capture shared context and private reminders.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Note
        </Button>
      </div>

      <section className="mt-5 space-y-3">
        {notes.length === 0 ? (
          <Card className="flex items-start gap-3">
            <StickyNote className="mt-1 h-5 w-5 text-neutral-400" />
            <p className="text-base text-neutral-600">No notes yet. Notes preserve context that does not fit into tasks or appointments.</p>
          </Card>
        ) : (
          notes.map((note) => <NoteCard key={note.id} note={note} currentUserId={currentUserId} currentRole={currentRole} onReload={load} />)
        )}
      </section>

      {modalOpen ? (
        <NoteModal
          careCircleId={activeCircle.careCircle.id}
          personId={activeCircle.person.id}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function NoteCard({ note, currentUserId, currentRole, onReload }: { note: HydratedNote; currentUserId: string; currentRole: string; onReload: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const canEdit = note.author_id === currentUserId;
  const canPin = currentRole === "owner" || currentRole === "coordinator";
  const hiddenPrivate = note.is_private && note.author_id !== currentUserId;

  const update = async (payload: { content?: string; pinnedInCrisis?: boolean; archive?: boolean }) => {
    await fetch("/api/notes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: note.id, careCircleId: note.care_circle_id, personId: note.person_id, ...payload })
    });
    await onReload();
  };

  return (
    <article className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Avatar name={note.author?.display_name ?? "Unknown"} src={note.author?.avatar_url ?? null} className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900">{note.author?.display_name ?? "Unknown member"}</p>
          <p className="text-xs text-neutral-400">{formatDateTime(note.created_at)}</p>
        </div>
        {note.is_private ? <Badge variant="neutral"><Lock className="mr-1 h-3 w-3" />Private</Badge> : null}
        {(canEdit || canPin) && !hiddenPrivate ? (
          <select className="h-8 w-8 rounded-md border border-neutral-200 bg-white" value="" onChange={(event) => { const value = event.target.value; if (value === "archive") void update({ archive: true }); if (value === "pin") void update({ pinnedInCrisis: !note.pinned_in_crisis }); event.target.value = ""; }}>
            <option value="">...</option>
            {canPin ? <option value="pin">{note.pinned_in_crisis ? "Unpin from Crisis" : "Pin to Crisis"}</option> : null}
            {canEdit ? <option value="archive">Delete</option> : null}
          </select>
        ) : null}
      </div>
      <p className={`mt-3 whitespace-pre-wrap text-base text-neutral-700 ${expanded ? "" : "line-clamp-3"}`}>{note.content}</p>
      {note.content.length > 180 ? (
        <button className="mt-2 text-sm font-medium text-blue-600 hover:underline" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </article>
  );
}

function NoteModal({ careCircleId, personId, onClose, onSaved }: { careCircleId: string; personId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [content, setContent] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const save = async () => {
    const response = await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ careCircleId, personId, content, isPrivate }) });
    if (response.ok) await onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">Add Note</h2>
        <textarea className="mt-4 min-h-40 w-full rounded border border-neutral-300 p-3 text-base" value={content} onChange={(event) => setContent(event.target.value)} />
        <label className="mt-3 flex items-center gap-2 text-sm font-medium text-neutral-700"><input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} /> Private note</label>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!content.trim()}>Save</Button></div>
      </div>
    </div>
  );
}
