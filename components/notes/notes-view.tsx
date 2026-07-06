"use client";

import { useEffect, useState } from "react";
import { Lock, Mic, Plus, Sparkles, StickyNote, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { ConflictModal } from "@/components/ui/conflict-modal";
import { VoiceRecorder } from "@/components/notes/voice-recorder";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import type { HydratedNote, Note } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const TRANSCRIPTION_ENABLED = process.env.NEXT_PUBLIC_TRANSCRIPTION_ENABLED === "true";

export function NotesView() {
  const { activeCircle } = useActiveCircle();
  const [notes, setNotes] = useState<HydratedNote[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskSuggest, setTaskSuggest] = useState<{ noteId: string; suggestions: string[] } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const load = async (isCancelled?: () => boolean) => {
    if (!activeCircle?.person) return;
    try {
      setError(null);
      const response = await fetch(`/api/notes?careCircleId=${activeCircle.careCircle.id}&personId=${activeCircle.person.id}`);
      if (!response.ok) throw new Error("Request failed");
      const json = (await response.json()) as { notes?: HydratedNote[]; currentUserId?: string; currentRole?: string };
      if (isCancelled?.()) return;
      setNotes(json.notes ?? []);
      setCurrentUserId(json.currentUserId ?? "");
      setCurrentRole(json.currentRole ?? "");
    } catch {
      if (isCancelled?.()) return;
      setError("We couldn't load notes. Check your connection and try again.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCircle?.careCircle.id, activeCircle?.person?.id]);

  // §5: after a note is saved, ask the server for implied tasks; show a non-blocking toast.
  const fetchTaskSuggestions = async (noteId: string) => {
    if (!activeCircle?.person || !noteId) return;
    // Adding a task requires contributor+ — skip suggestions for lower roles.
    if (!["owner", "coordinator", "contributor"].includes(currentRole)) return;
    const response = await fetch("/api/ai/note-task-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ careCircleId: activeCircle.careCircle.id, personId: activeCircle.person.id, noteId })
    });
    if (!response.ok) return;
    const json = (await response.json()) as { suggestions?: string[] };
    const suggestions = json.suggestions ?? [];
    if (suggestions.length > 0) {
      setPanelOpen(false);
      setTaskSuggest({ noteId, suggestions });
    }
  };

  useEffect(() => {
    if (!taskSuggest || panelOpen) return;
    const timer = setTimeout(() => setTaskSuggest(null), 8000);
    return () => clearTimeout(timer);
  }, [taskSuggest, panelOpen]);

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

      {error ? (
        <div className="mt-5">
          <LoadError message={error} onRetry={() => void load()} />
        </div>
      ) : null}

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
          onSaved={async (noteId) => {
            setModalOpen(false);
            await load();
            void fetchTaskSuggestions(noteId);
          }}
        />
      ) : null}

      {taskSuggest && !panelOpen ? (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-lg">
          <Sparkles className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <p className="flex-1 text-sm text-neutral-700">We noticed some possible tasks in your note.</p>
          <button className="text-sm font-semibold text-blue-600 hover:underline" onClick={() => setPanelOpen(true)}>
            Show suggestions
          </button>
          <button aria-label="Dismiss" className="text-neutral-400 hover:text-neutral-700" onClick={() => setTaskSuggest(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {taskSuggest && panelOpen ? (
        <TaskSuggestionsPanel
          careCircleId={activeCircle.careCircle.id}
          personId={activeCircle.person.id}
          noteId={taskSuggest.noteId}
          suggestions={taskSuggest.suggestions}
          onClose={() => {
            setTaskSuggest(null);
            setPanelOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function NoteCard({ note, currentUserId, currentRole, onReload }: { note: HydratedNote; currentUserId: string; currentRole: string; onReload: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [conflict, setConflict] = useState<Note | null>(null);
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

  const saveContent = async (force: boolean, override?: string) => {
    const content = override ?? draft;
    const body: { id: string; careCircleId: string; personId: string; content: string; expectedUpdatedAt?: string } = {
      id: note.id,
      careCircleId: note.care_circle_id,
      personId: note.person_id,
      content
    };
    if (!force) body.expectedUpdatedAt = note.updated_at;
    const response = await fetch("/api/notes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (response.status === 409) {
      const json = (await response.json()) as { current?: Note };
      if (json.current) setConflict(json.current);
      return;
    }
    if (response.ok) {
      setEditing(false);
      await onReload();
    }
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
          <select className="h-8 w-8 rounded-md border border-neutral-200 bg-white" value="" onChange={(event) => { const value = event.target.value; if (value === "edit") { setDraft(note.content); setEditing(true); } if (value === "archive") void update({ archive: true }); if (value === "pin") void update({ pinnedInCrisis: !note.pinned_in_crisis }); event.target.value = ""; }}>
            <option value="">...</option>
            {canEdit ? <option value="edit">Edit</option> : null}
            {canPin ? <option value="pin">{note.pinned_in_crisis ? "Unpin from Crisis" : "Pin to Crisis"}</option> : null}
            {canEdit ? <option value="archive">Delete</option> : null}
          </select>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-3">
          <textarea
            className="min-h-28 w-full rounded border border-neutral-300 p-3 text-base"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => saveContent(false)} disabled={!draft.trim()}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft(note.content);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className={`mt-3 whitespace-pre-wrap text-base text-neutral-700 ${expanded ? "" : "line-clamp-3"}`}>{note.content}</p>
          {note.content.length > 180 ? (
            <button className="mt-2 text-sm font-medium text-blue-600 hover:underline" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "Show less" : "Show more"}
            </button>
          ) : null}
        </>
      )}

      {conflict ? (
        <ConflictModal
          fieldLabel="Note"
          yourValue={draft}
          theirValue={conflict.content}
          savedByLabel={`Current version (saved ${formatDateTime(conflict.updated_at)})`}
          onKeepTheirs={() => {
            setDraft(conflict.content);
            setConflict(null);
            setEditing(false);
            void onReload();
          }}
          onUseMine={() => {
            void saveContent(true);
            setConflict(null);
          }}
          onMerge={(merged) => {
            setDraft(merged);
            void saveContent(true, merged);
            setConflict(null);
          }}
          onClose={() => setConflict(null)}
        />
      ) : null}
    </article>
  );
}

function NoteModal({ careCircleId, personId, onClose, onSaved }: { careCircleId: string; personId: string; onClose: () => void; onSaved: (noteId: string) => Promise<void> }) {
  const [content, setContent] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [transcribed, setTranscribed] = useState(false);
  const save = async () => {
    const response = await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ careCircleId, personId, content, isPrivate }) });
    if (response.ok) {
      const json = (await response.json()) as { note?: { id: string } };
      await onSaved(json.note?.id ?? "");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">Add Note</h2>
        {TRANSCRIPTION_ENABLED ? (
          <div className="mt-3">
            {showRecorder ? (
              <VoiceRecorder
                careCircleId={careCircleId}
                onClose={() => setShowRecorder(false)}
                onTranscribed={(text) => {
                  setContent((previous) => (previous.trim() ? `${previous}\n${text}` : text));
                  setShowRecorder(false);
                  setTranscribed(true);
                }}
              />
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setShowRecorder(true)}>
                <Mic className="h-4 w-4" aria-hidden="true" />
                Record voice note
              </Button>
            )}
          </div>
        ) : null}
        {transcribed ? <p className="mt-3 text-sm text-neutral-500">Here&apos;s what we heard — edit before saving:</p> : null}
        <textarea className={`${transcribed ? "mt-2" : "mt-4"} min-h-40 w-full rounded border border-neutral-300 p-3 text-base`} value={content} onChange={(event) => setContent(event.target.value)} />
        <label className="mt-3 flex items-center gap-2 text-sm font-medium text-neutral-700"><input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} /> Private note</label>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!content.trim()}>Save</Button></div>
      </div>
    </div>
  );
}

function TaskSuggestionsPanel({
  careCircleId,
  personId,
  noteId,
  suggestions,
  onClose
}: {
  careCircleId: string;
  personId: string;
  noteId: string;
  suggestions: string[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-lg bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-md font-semibold text-neutral-900">Suggested tasks</h2>
          <button aria-label="Close" className="text-neutral-400 hover:text-neutral-700" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-neutral-500">Add any that are useful — each links back to your note.</p>
        <div className="mt-4 space-y-2">
          {suggestions.map((suggestion, index) => (
            <SuggestedTaskRow key={index} title={suggestion} careCircleId={careCircleId} personId={personId} noteId={noteId} />
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function SuggestedTaskRow({
  title: initialTitle,
  careCircleId,
  personId,
  noteId
}: {
  title: string;
  careCircleId: string;
  personId: string;
  noteId: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ careCircleId, personId, title: title.trim(), linkedObjectType: "note", linkedObjectId: noteId })
    });
    setBusy(false);
    if (response.ok) setAdded(true);
  };

  if (added) {
    return (
      <div className="flex items-center justify-between rounded-md border border-neutral-200 px-2 py-1.5 text-sm">
        <span className="text-neutral-700">{title}</span>
        <Badge variant="green">Added</Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className="h-9 flex-1 rounded-lg border border-neutral-300 px-3 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Button size="sm" onClick={() => void add()} disabled={busy || !title.trim()}>
        Add as task
      </Button>
    </div>
  );
}
