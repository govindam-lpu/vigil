"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { FileText, Filter, Folder as FolderIcon, Grid2X2, List, Lock, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { createClient } from "@/lib/supabase/client";
import type { DocumentType, Folder, HydratedDocument } from "@/lib/types";
import { cn, formatShortDate } from "@/lib/utils";

type FolderWithCount = Folder & { item_count: number };
type DocumentMode = "list" | "grid";
type SmartView = "expiring" | "added" | "pinned";

export function DocumentsView() {
  const { activeCircle } = useActiveCircle();
  const [folders, setFolders] = useState<FolderWithCount[]>([]);
  const [documents, setDocuments] = useState<HydratedDocument[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [smartView, setSmartView] = useState<SmartView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<DocumentMode>("list");
  const [modalOpen, setModalOpen] = useState(false);

  const selected = documents.find((document) => document.id === selectedId) ?? documents[0] ?? null;

  const loadFolders = async () => {
    if (!activeCircle?.person) return;
    const response = await fetch(`/api/folders?careCircleId=${activeCircle.careCircle.id}&personId=${activeCircle.person.id}`);
    const json = (await response.json()) as { folders?: FolderWithCount[] };
    setFolders(json.folders ?? []);
    if (!selectedFolderId && !smartView) {
      const medical = json.folders?.find((folder) => folder.name === "Medical Records") ?? json.folders?.[0];
      setSelectedFolderId(medical?.id ?? null);
    }
  };

  const loadDocuments = async () => {
    if (!activeCircle?.person) return;
    const params = new URLSearchParams({
      careCircleId: activeCircle.careCircle.id,
      personId: activeCircle.person.id
    });
    if (selectedFolderId && !smartView) params.set("folderId", selectedFolderId);
    if (smartView) params.set("smartView", smartView);
    const response = await fetch(`/api/documents?${params.toString()}`);
    const json = (await response.json()) as { documents?: HydratedDocument[] };
    setDocuments(json.documents ?? []);
  };

  useEffect(() => {
    void loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCircle?.careCircle.id, activeCircle?.person?.id]);

  useEffect(() => {
    void loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCircle?.careCircle.id, activeCircle?.person?.id, selectedFolderId, smartView]);

  const systemFolders = useMemo(() => folders.filter((folder) => folder.folder_type === "system"), [folders]);
  const userFolders = useMemo(() => folders.filter((folder) => folder.folder_type === "user_created"), [folders]);

  if (!activeCircle?.person) return null;

  const selectFolder = (folderId: string) => {
    setSmartView(null);
    setSelectedFolderId(folderId);
  };

  const selectSmart = (view: SmartView) => {
    setSmartView(view);
    setSelectedFolderId(null);
  };

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <div className="sticky top-14 z-20 -mx-2 flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-2 py-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Documents</h1>
          <p className="text-sm text-neutral-500">Organize files by folder and crisis visibility.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Document
        </Button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)_320px]">
        <aside className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="space-y-1 border-b border-neutral-200 pb-3">
            <SmartButton active={smartView === "expiring"} label="Expiring Soon" onClick={() => selectSmart("expiring")} />
            <SmartButton active={smartView === "added"} label="Added This Week" onClick={() => selectSmart("added")} />
            <SmartButton active={smartView === "pinned"} label="Pinned for Crisis" onClick={() => selectSmart("pinned")} />
          </div>
          <FolderGroup folders={systemFolders} activeId={selectedFolderId} onSelect={selectFolder} system />
          {userFolders.length > 0 ? <FolderGroup folders={userFolders} activeId={selectedFolderId} onSelect={selectFolder} /> : null}
        </aside>

        <section className="rounded-lg border border-neutral-200 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-200 p-3">
            <p className="text-sm font-medium text-neutral-700">{documents.length} documents</p>
            <div className="rounded-lg border border-neutral-200 p-1">
              <button aria-label="List view" className={cn("h-8 w-8 rounded-md", mode === "list" && "bg-blue-50 text-blue-600")} onClick={() => setMode("list")}><List className="mx-auto h-4 w-4" /></button>
              <button aria-label="Grid view" className={cn("h-8 w-8 rounded-md", mode === "grid" && "bg-blue-50 text-blue-600")} onClick={() => setMode("grid")}><Grid2X2 className="mx-auto h-4 w-4" /></button>
            </div>
          </div>
          {documents.length === 0 ? (
            <div className="flex items-start gap-3 p-5 text-neutral-600">
              <FileText className="mt-1 h-5 w-5 text-neutral-400" />
              <p>No documents in this view.</p>
            </div>
          ) : mode === "list" ? (
            documents.map((document) => <DocumentRow key={document.id} document={document} selected={selected?.id === document.id} folders={folders} onSelect={() => setSelectedId(document.id)} onReload={async () => { await loadFolders(); await loadDocuments(); }} />)
          ) : (
            <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {documents.map((document) => <DocumentCard key={document.id} document={document} selected={selected?.id === document.id} onSelect={() => setSelectedId(document.id)} />)}
            </div>
          )}
        </section>

        <DocumentDetail key={selected?.id ?? "none"} document={selected} folders={folders} onReload={async () => { await loadFolders(); await loadDocuments(); }} />
      </div>

      {modalOpen ? (
        <DocumentModal
          careCircleId={activeCircle.careCircle.id}
          personId={activeCircle.person.id}
          folders={folders}
          defaultFolderId={selectedFolderId}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await loadFolders();
            await loadDocuments();
          }}
        />
      ) : null}
    </div>
  );
}

function FolderGroup({ folders, activeId, onSelect, system = false }: { folders: FolderWithCount[]; activeId: string | null; onSelect: (id: string) => void; system?: boolean }) {
  return (
    <div className="mt-3 space-y-1">
      {folders.map((folder) => (
        <button key={folder.id} className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-neutral-100", activeId === folder.id && "bg-blue-50 text-blue-600")} onClick={() => onSelect(folder.id)}>
          {system ? <Lock className="h-4 w-4" /> : <FolderIcon className="h-4 w-4" />}
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          <span className="text-xs text-neutral-400">{folder.item_count}</span>
        </button>
      ))}
    </div>
  );
}

function SmartButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-neutral-100", active && "bg-blue-50 text-blue-600")} onClick={onClick}><Filter className="h-4 w-4" />{label}</button>;
}

function DocumentRow({ document, selected, folders, onSelect, onReload }: { document: HydratedDocument; selected: boolean; folders: Folder[]; onSelect: () => void; onReload: () => Promise<void> }) {
  const expiring = isExpiring(document.expires_at);
  return (
    <div className={cn("grid cursor-pointer grid-cols-[32px_minmax(180px,1fr)_140px_140px_110px_130px_40px] items-center gap-3 border-b border-neutral-100 px-3 py-3 text-sm hover:bg-neutral-50", selected && "bg-blue-50")} onClick={onSelect}>
      <FileText className="h-5 w-5 text-neutral-500" />
      <div className="min-w-0">
        <p className="truncate font-semibold text-neutral-900">{document.title}</p>
        {document.tags && document.tags.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {document.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">{tag}</span>
            ))}
          </div>
        ) : null}
      </div>
      <Badge variant="neutral">{labelize(document.document_type ?? "other")}</Badge>
      <span className="text-neutral-600">{document.folder?.name ?? "No folder"}</span>
      <span className="text-neutral-500">{formatShortDate(document.created_at.slice(0, 10))}</span>
      <span className={cn(expiring && "font-semibold text-yellow-600")}>{document.expires_at ? formatShortDate(document.expires_at) : "No expiry"}</span>
      <ActionSelect document={document} folders={folders} onReload={onReload} />
    </div>
  );
}

function DocumentCard({ document, selected, onSelect }: { document: HydratedDocument; selected: boolean; onSelect: () => void }) {
  return <button className={cn("rounded-lg border border-neutral-200 p-4 text-left hover:bg-neutral-50", selected && "border-blue-600 bg-blue-50")} onClick={onSelect}><FileText className="h-6 w-6 text-neutral-500" /><p className="mt-3 font-semibold text-neutral-900">{document.title}</p><p className="mt-1 text-sm text-neutral-500">{document.folder?.name ?? "No folder"}</p></button>;
}

function DocumentDetail({ document, folders, onReload }: { document: HydratedDocument | null; folders: Folder[]; onReload: () => Promise<void> }) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setFileUrl(null);
    if (!document) return;
    void (async () => {
      const params = new URLSearchParams({ careCircleId: document.care_circle_id, personId: document.person_id, id: document.id });
      const response = await fetch(`/api/documents/signed-url?${params.toString()}`);
      const json = (await response.json()) as { url?: string };
      if (active) setFileUrl(json.url ?? null);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.id, document?.care_circle_id, document?.person_id]);

  if (!document) return <Card className="hidden h-fit lg:block">Select a document to view details.</Card>;
  const isImage = document.file_type?.startsWith("image/");
  const update = async (payload: Partial<HydratedDocument>) => {
    await fetch("/api/documents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: document.id,
        careCircleId: document.care_circle_id,
        personId: document.person_id,
        title: payload.title,
        description: payload.description,
        folderId: payload.folder_id,
        pinnedInCrisis: payload.pinned_in_crisis,
        tags: payload.tags,
        archive: payload.deleted_at !== undefined
      })
    });
    await onReload();
  };
  return (
    <aside className="h-fit rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-md font-semibold text-neutral-900">{document.title}</h2>
      <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        {fileUrl ? (
          isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl} alt={document.title} className="max-h-56 w-full object-contain" />
          ) : (
            <a className="text-sm font-medium text-blue-600" href={fileUrl} target="_blank" rel="noreferrer">
              Open in new tab
            </a>
          )
        ) : (
          <p className="text-sm text-neutral-400">Preparing secure preview…</p>
        )}
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <Meta label="Type" value={labelize(document.document_type ?? "other")} />
        <Meta label="Folder" value={document.folder?.name ?? "No folder"} />
        <Meta label="Uploaded by" value={document.uploader?.display_name ?? "Unknown"} />
        <Meta label="Uploaded" value={formatShortDate(document.created_at.slice(0, 10))} />
        <Meta label="Source" value={document.source_name ?? "Not set"} />
      </dl>
      <Field label="Notes about this document">
        <textarea className="min-h-24 w-full rounded border border-neutral-300 p-3" defaultValue={document.description ?? ""} onBlur={(event) => update({ description: event.target.value })} />
      </Field>
      <Field label="Move to folder">
        <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={document.folder_id ?? ""} onChange={(event) => update({ folder_id: event.target.value || null })}>
          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
      </Field>
      <Field label="Tags">
        <Input defaultValue={(document.tags ?? []).join(", ")} placeholder="Comma separated, max 5" onBlur={(event) => update({ tags: parseTags(event.target.value) })} />
        {document.tags && document.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {document.tags.map((tag) => <Badge key={tag} variant="neutral">{tag}</Badge>)}
          </div>
        ) : null}
      </Field>
      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-neutral-700"><input type="checkbox" checked={document.pinned_in_crisis} onChange={(event) => update({ pinned_in_crisis: event.target.checked })} /> Pin to Emergency Packet</label>
      <div className="mt-4 flex gap-2">
        {fileUrl ? (
          <Button size="sm" asChild><a href={fileUrl} download>Download</a></Button>
        ) : (
          <Button size="sm" disabled>Download</Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => update({ deleted_at: new Date().toISOString() })}>Archive</Button>
      </div>
    </aside>
  );
}

function DocumentModal({ careCircleId, personId, folders, defaultFolderId, onClose, onSaved }: { careCircleId: string; personId: string; folders: Folder[]; defaultFolderId: string | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("medical_record");
  const [folderId, setFolderId] = useState(defaultFolderId ?? folders[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [pinnedInCrisis, setPinnedInCrisis] = useState(false);
  const [tagsInput, setTagsInput] = useState("");

  const save = async () => {
    if (!file || !title.trim()) return;
    const supabase = createClient();
    const path = `${careCircleId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("documents").upload(path, file);
    if (error) return;
    const response = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ careCircleId, personId, folderId, title, description, documentType, storagePath: path, fileType: file.type, fileSizeBytes: file.size, sourceName, issuedAt: issuedAt || null, expiresAt: expiresAt || null, pinnedInCrisis, tags: parseTags(tagsInput) })
    });
    if (response.ok) await onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">Add Document</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="File"><Input type="file" onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); if (selected && !title) setTitle(selected.name.replace(/\.[^.]+$/, "")); }} /></Field></div>
          <Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
          <Field label="Document type"><select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={documentType} onChange={(event) => setDocumentType(event.target.value as DocumentType)}>{["medical_record","insurance","legal","financial","identification","care_plan","correspondence","other"].map((item) => <option key={item} value={item}>{labelize(item)}</option>)}</select></Field>
          <Field label="Folder"><select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={folderId} onChange={(event) => setFolderId(event.target.value)}>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></Field>
          <Field label="Source name"><Input value={sourceName} onChange={(event) => setSourceName(event.target.value)} /></Field>
          <Field label="Issued at"><Input type="date" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} /></Field>
          <Field label="Expires at"><Input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Description"><textarea className="min-h-24 w-full rounded border border-neutral-300 p-3" value={description} onChange={(event) => setDescription(event.target.value)} /></Field></div>
          <div className="sm:col-span-2"><Field label="Tags"><Input value={tagsInput} onChange={(event) => setTagsInput(event.target.value)} placeholder="Comma separated, max 5" /></Field></div>
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-700"><input type="checkbox" checked={pinnedInCrisis} onChange={(event) => setPinnedInCrisis(event.target.checked)} /> Pin to Emergency Packet</label>
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!file || !title.trim()}>Save</Button></div>
      </div>
    </div>
  );
}

function ActionSelect({ document, folders, onReload }: { document: HydratedDocument; folders: Folder[]; onReload: () => Promise<void> }) {
  const update = async (payload: { folderId?: string | null; pinnedInCrisis?: boolean; archive?: boolean }) => {
    await fetch("/api/documents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: document.id, careCircleId: document.care_circle_id, personId: document.person_id, ...payload }) });
    await onReload();
  };
  return <select aria-label="Document actions" className="h-8 w-8 rounded-md border border-neutral-200 bg-white" value="" onClick={(event) => event.stopPropagation()} onChange={(event) => { const value = event.target.value; if (value === "pin") void update({ pinnedInCrisis: !document.pinned_in_crisis }); if (value === "archive") void update({ archive: true }); if (value.startsWith("move:")) void update({ folderId: value.replace("move:", "") }); event.target.value = ""; }}><option value="">...</option><option value="pin">{document.pinned_in_crisis ? "Unpin" : "Pin to Emergency Packet"}</option>{folders.map((folder) => <option key={folder.id} value={`move:${folder.id}`}>Move to {folder.name}</option>)}<option value="archive">Archive</option></select>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-medium text-neutral-700">{label}</span>{children}</label>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[96px_1fr] gap-2"><dt className="text-neutral-500">{label}</dt><dd className="font-medium text-neutral-800">{value}</dd></div>;
}

function isExpiring(value: string | null): boolean {
  if (!value) return false;
  const expires = new Date(`${value}T00:00:00`).getTime();
  const soon = Date.now() + 30 * 86400000;
  return expires <= soon;
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseTags(value: string): string[] {
  return Array.from(new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))).slice(0, 5);
}
