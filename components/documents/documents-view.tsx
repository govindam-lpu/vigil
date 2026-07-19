"use client";

import type { ReactNode } from "react";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Filter, Folder as FolderIcon, Grid2X2, List, Lock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailSheet } from "@/components/ui/detail-sheet";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { SuggestionBanner } from "@/components/documents/suggestion-banner";
import { CrisisDocumentsView } from "@/components/crisis/crisis-documents-view";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { useCrisisMode } from "@/components/shell/crisis-mode-provider";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/query/fetch";
import type { DocumentType, Folder, HydratedDocument } from "@/lib/types";
import { cn, formatShortDate } from "@/lib/utils";

type FolderWithCount = Folder & { item_count: number };
type DocumentMode = "list" | "grid";
type SmartView = "expiring" | "added" | "pinned";

export function DocumentsView() {
  const { crisisMode } = useCrisisMode();

  // Crisis mode scopes Documents to the Emergency Packet (pinned) only.
  if (crisisMode) {
    return <CrisisDocumentsView />;
  }

  return (
    <Suspense fallback={<DocumentsSkeleton />}>
      <DocumentsContent />
    </Suspense>
  );
}

function DocumentsSkeleton() {
  return (
    <div className="mx-auto max-w-[1280px] p-4 sm:p-6" aria-busy="true">
      <div className="flex items-center justify-between border-b border-neutral-200 py-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="mt-5">
        <SkeletonRows rows={6} />
      </div>
    </div>
  );
}

function DocumentsContent() {
  const { activeCircle } = useActiveCircle();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const documentParam = searchParams.get("document");
  const smartViewParam = searchParams.get("smartView");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [smartView, setSmartView] = useState<SmartView | null>(
    smartViewParam === "expiring" || smartViewParam === "added" || smartViewParam === "pinned" ? smartViewParam : null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [mode, setMode] = useState<DocumentMode>("list");
  const [modalOpen, setModalOpen] = useState(false);

  const careCircleId = activeCircle?.careCircle.id ?? null;
  const personId = activeCircle?.person?.id ?? null;

  const foldersQuery = useQuery({
    queryKey: ["folders", careCircleId, personId],
    queryFn: () => fetchJson<{ folders?: FolderWithCount[] }>(`/api/folders?careCircleId=${careCircleId}&personId=${personId}`),
    enabled: Boolean(careCircleId && personId)
  });
  const folders = useMemo(() => foldersQuery.data?.folders ?? [], [foldersQuery.data]);

  // Deep link from timeline/search: resolve the document first (documents load
  // per-folder, so we must find its home folder before we can show it selected).
  const deepLinkQuery = useQuery({
    queryKey: ["documents", careCircleId, personId, { id: documentParam }],
    queryFn: () =>
      fetchJson<{ documents?: HydratedDocument[] }>(
        `/api/documents?${new URLSearchParams({ careCircleId: careCircleId ?? "", personId: personId ?? "", id: documentParam ?? "" })}`
      ),
    enabled: Boolean(careCircleId && personId && documentParam)
  });
  const deepLinked = documentParam ? deepLinkQuery.data?.documents?.[0] ?? null : null;

  // The active scope is derived, never effect-set: an explicit pick wins, then a
  // deep-linked document's folder, then Medical Records / the first folder.
  const defaultFolderId =
    folders.find((folder) => folder.name === "Medical Records")?.id ?? folders[0]?.id ?? null;
  const activeFolderId = smartView ? null : selectedFolderId ?? deepLinked?.folder_id ?? defaultFolderId;

  const documentsQuery = useQuery({
    queryKey: ["documents", careCircleId, personId, { folderId: activeFolderId, smartView }],
    queryFn: () => {
      const params = new URLSearchParams({ careCircleId: careCircleId ?? "", personId: personId ?? "" });
      if (activeFolderId && !smartView) params.set("folderId", activeFolderId);
      if (smartView) params.set("smartView", smartView);
      return fetchJson<{ documents?: HydratedDocument[] }>(`/api/documents?${params.toString()}`);
    },
    enabled: Boolean(careCircleId && personId && (activeFolderId || smartView)),
    // While any document is still being OCR'd/extracted, poll until it settles.
    refetchInterval: (query) => {
      const processing = (query.state.data?.documents ?? []).some(
        (document) => document.processing_status === "pending" || document.processing_status === "processing"
      );
      return processing ? 4000 : false;
    }
  });

  const documents = useMemo(() => documentsQuery.data?.documents ?? [], [documentsQuery.data]);
  const loading = documentsQuery.isPending || foldersQuery.isPending;
  const selected =
    documents.find((document) => document.id === (selectedId ?? deepLinked?.id)) ?? documents[0] ?? null;

  const reload = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["documents", careCircleId, personId] }),
      queryClient.invalidateQueries({ queryKey: ["folders", careCircleId, personId] })
    ]);
  };

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

  const smartLabels: Record<SmartView, string> = {
    expiring: "Expiring Soon",
    added: "Added This Week",
    pinned: "Pinned for Crisis"
  };

  return (
    <div className="mx-auto max-w-[1280px] p-4 sm:p-6">
      <div className="sticky top-14 z-20 -mx-2 flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-2 py-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">Documents</h1>
          <p className="hidden text-sm text-neutral-500 sm:block">Organize files by folder and crisis visibility.</p>
        </div>
        <Button className="shrink-0" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Document
        </Button>
      </div>

      {documentsQuery.isError || foldersQuery.isError ? (
        <div className="mt-5">
          <LoadError
            message="We couldn't load documents. Check your connection and try again."
            onRetry={() => {
              void foldersQuery.refetch();
              void documentsQuery.refetch();
            }}
          />
        </div>
      ) : null}

      {/* Mobile: folders + smart views as one horizontally scrollable chip row
          (three stacked cards pushed the actual list below the fold on phones). */}
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {(Object.keys(smartLabels) as SmartView[]).map((view) => (
          <button
            key={view}
            onClick={() => selectSmart(view)}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium",
              smartView === view ? "border-brand-600 bg-brand-50 text-brand-600" : "border-neutral-200 bg-white text-neutral-600"
            )}
          >
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            {smartLabels[view]}
          </button>
        ))}
        <span className="my-1 w-px shrink-0 bg-neutral-200" aria-hidden="true" />
        {folders.map((folder) => (
          <button
            key={folder.id}
            onClick={() => selectFolder(folder.id)}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium",
              !smartView && activeFolderId === folder.id
                ? "border-brand-600 bg-brand-50 text-brand-600"
                : "border-neutral-200 bg-white text-neutral-600"
            )}
          >
            {folder.folder_type === "system" ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : <FolderIcon className="h-3.5 w-3.5" aria-hidden="true" />}
            {folder.name}
            <span className="text-xs text-neutral-400">{folder.item_count}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:mt-5 lg:grid-cols-[200px_minmax(0,1fr)_320px]">
        <aside className="hidden rounded-xl border border-neutral-200 bg-white p-3 lg:block">
          <div className="space-y-1 border-b border-neutral-200 pb-3">
            <SmartButton active={smartView === "expiring"} label="Expiring Soon" onClick={() => selectSmart("expiring")} />
            <SmartButton active={smartView === "added"} label="Added This Week" onClick={() => selectSmart("added")} />
            <SmartButton active={smartView === "pinned"} label="Pinned for Crisis" onClick={() => selectSmart("pinned")} />
          </div>
          {foldersQuery.isPending ? (
            <SkeletonRows rows={4} className="mt-3 space-y-2 [&>div]:h-8" />
          ) : (
            <>
              <FolderGroup folders={systemFolders} activeId={activeFolderId} onSelect={selectFolder} system />
              {userFolders.length > 0 ? <FolderGroup folders={userFolders} activeId={activeFolderId} onSelect={selectFolder} /> : null}
            </>
          )}
        </aside>

        <section className="min-w-0 rounded-xl border border-neutral-200 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-200 p-3">
            {loading ? (
              <Skeleton className="h-4 w-24" />
            ) : (
              <p className="text-sm font-medium text-neutral-700">{documents.length} documents</p>
            )}
            <div className="rounded-lg border border-neutral-200 p-1">
              <button aria-label="List view" className={cn("h-8 w-8 rounded-md", mode === "list" && "bg-brand-50 text-brand-600")} onClick={() => setMode("list")}><List className="mx-auto h-4 w-4" /></button>
              <button aria-label="Grid view" className={cn("h-8 w-8 rounded-md", mode === "grid" && "bg-brand-50 text-brand-600")} onClick={() => setMode("grid")}><Grid2X2 className="mx-auto h-4 w-4" /></button>
            </div>
          </div>
          {loading ? (
            <SkeletonRows rows={6} className="p-3" />
          ) : documents.length === 0 ? (
            <div className="flex items-start gap-3 p-5 text-neutral-600">
              <FileText className="mt-1 h-5 w-5 shrink-0 text-neutral-400" />
              <p className="font-display tracking-tight">No documents in this view.</p>
            </div>
          ) : mode === "list" ? (
            documents.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                selected={selected?.id === document.id}
                folders={folders}
                onSelect={() => {
                  setSelectedId(document.id);
                  setDetailOpen(true);
                }}
                onReload={reload}
              />
            ))
          ) : (
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {documents.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  selected={selected?.id === document.id}
                  onSelect={() => {
                    setSelectedId(document.id);
                    setDetailOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="hidden h-fit lg:block">
          <DocumentDetailCard
            key={selected?.id ?? "none"}
            document={selected}
            folders={folders}
            currentUserId={activeCircle.membership.user_id}
            canApply={activeCircle.membership.role === "owner" || activeCircle.membership.role === "coordinator" || activeCircle.membership.role === "contributor"}
            personName={activeCircle.person.preferred_name ?? activeCircle.person.first_name}
            onReload={reload}
          />
        </aside>
      </div>

      <DetailSheet open={detailOpen && Boolean(selected)} onClose={() => setDetailOpen(false)} title={selected?.title ?? "Document"}>
        <DocumentDetailBody
          key={selected?.id ?? "none"}
          document={selected}
          folders={folders}
          currentUserId={activeCircle.membership.user_id}
          canApply={activeCircle.membership.role === "owner" || activeCircle.membership.role === "coordinator" || activeCircle.membership.role === "contributor"}
          personName={activeCircle.person.preferred_name ?? activeCircle.person.first_name}
          onReload={reload}
        />
      </DetailSheet>

      {modalOpen ? (
        <DocumentModal
          careCircleId={activeCircle.careCircle.id}
          personId={activeCircle.person.id}
          folders={folders}
          defaultFolderId={activeFolderId}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await reload();
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
        <button key={folder.id} className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-neutral-100", activeId === folder.id && "bg-brand-50 text-brand-600")} onClick={() => onSelect(folder.id)}>
          {system ? <Lock className="h-4 w-4 shrink-0" /> : <FolderIcon className="h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          <span className="text-xs text-neutral-400">{folder.item_count}</span>
        </button>
      ))}
    </div>
  );
}

function SmartButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-neutral-100", active && "bg-brand-50 text-brand-600")} onClick={onClick}><Filter className="h-4 w-4 shrink-0" />{label}</button>;
}

// Compact, flexible row. The old fixed-column template needed ~844px, which never
// fit the center pane even on desktop; now the title flexes/truncates, secondary
// columns appear only where there's genuinely room (md single-column layouts), and
// the expiry stays visible from sm up.
function DocumentRow({ document, selected, folders, onSelect, onReload }: { document: HydratedDocument; selected: boolean; folders: Folder[]; onSelect: () => void; onReload: () => Promise<void> }) {
  const expiring = isExpiring(document.expires_at);
  return (
    <div className={cn("flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-3 text-sm hover:bg-neutral-50", selected && "bg-brand-50")} onClick={onSelect}>
      <FileText className="h-5 w-5 shrink-0 text-neutral-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-neutral-900">{document.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <ProcessingBadge document={document} />
          <span className="text-xs text-neutral-500 md:hidden">{document.folder?.name ?? "No folder"}</span>
          {document.expires_at ? (
            <span className={cn("font-mono text-xs sm:hidden", expiring ? "font-semibold text-yellow-600" : "text-neutral-500")}>
              Expires {formatShortDate(document.expires_at)}
            </span>
          ) : null}
          {(document.tags ?? []).slice(0, 3).map((tag) => (
            <span key={tag} className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">{tag}</span>
          ))}
        </div>
      </div>
      <span className="hidden shrink-0 md:block lg:hidden xl:block">
        <Badge variant="neutral">{labelize(document.document_type ?? "other")}</Badge>
      </span>
      <span className="hidden w-20 shrink-0 font-mono text-xs text-neutral-500 md:block lg:hidden xl:block">
        {formatShortDate(document.created_at.slice(0, 10))}
      </span>
      <span className={cn("hidden w-20 shrink-0 text-right font-mono text-xs sm:block", expiring ? "font-semibold text-yellow-600" : "text-neutral-500")}>
        {document.expires_at ? formatShortDate(document.expires_at) : "—"}
      </span>
      <ActionSelect document={document} folders={folders} onReload={onReload} />
    </div>
  );
}

function DocumentCard({ document, selected, onSelect }: { document: HydratedDocument; selected: boolean; onSelect: () => void }) {
  return <button className={cn("min-w-0 rounded-xl border border-neutral-200 p-4 text-left transition-shadow hover:border-neutral-300 hover:shadow-lift", selected && "border-brand-600 bg-brand-50 hover:border-brand-600")} onClick={onSelect}><FileText className="h-6 w-6 text-neutral-500" /><p className="mt-3 truncate font-semibold text-neutral-900">{document.title}</p><p className="mt-1 truncate text-sm text-neutral-500">{document.folder?.name ?? "No folder"}</p></button>;
}

type DocumentDetailProps = {
  document: HydratedDocument | null;
  folders: Folder[];
  currentUserId: string;
  personName: string;
  canApply: boolean;
  onReload: () => Promise<void>;
};

function DocumentDetailCard(props: DocumentDetailProps) {
  if (!props.document) return <Card className="h-fit">Select a document to view details.</Card>;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <DocumentDetailBody {...props} />
    </div>
  );
}

function DocumentDetailBody({ document, folders, currentUserId, personName, canApply, onReload }: DocumentDetailProps) {
  const signedUrlQuery = useQuery({
    queryKey: ["document-signed-url", document?.id],
    queryFn: () => {
      const params = new URLSearchParams({
        careCircleId: document?.care_circle_id ?? "",
        personId: document?.person_id ?? "",
        id: document?.id ?? ""
      });
      return fetchJson<{ url?: string }>(`/api/documents/signed-url?${params.toString()}`);
    },
    enabled: Boolean(document),
    // Signed URLs expire after 60s — keep this one short-lived.
    staleTime: 30_000,
    gcTime: 60_000
  });
  const fileUrl = signedUrlQuery.data?.url ?? null;

  if (!document) return null;
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
    <div>
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 break-words text-md font-semibold text-neutral-900">{document.title}</h2>
        <ProcessingBadge document={document} />
      </div>
      <SuggestionBanner document={document} personName={personName} currentUserId={currentUserId} canApply={canApply} onReload={onReload} />
      <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        {fileUrl ? (
          isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl} alt={document.title} className="max-h-56 w-full object-contain" />
          ) : (
            <a className="text-sm font-medium text-brand-600" href={fileUrl} target="_blank" rel="noreferrer">
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
        <div className="grid grid-cols-[96px_1fr] gap-2"><dt className="text-neutral-500">Uploaded</dt><dd className="font-mono font-medium text-neutral-800">{formatShortDate(document.created_at.slice(0, 10))}</dd></div>
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
    </div>
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
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">Add Document</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
  return <select aria-label="Document actions" className="h-8 w-8 shrink-0 rounded-md border border-neutral-200 bg-white" value="" onClick={(event) => event.stopPropagation()} onChange={(event) => { const value = event.target.value; if (value === "pin") void update({ pinnedInCrisis: !document.pinned_in_crisis }); if (value === "archive") void update({ archive: true }); if (value.startsWith("move:")) void update({ folderId: value.replace("move:", "") }); event.target.value = ""; }}><option value="">...</option><option value="pin">{document.pinned_in_crisis ? "Unpin" : "Pin to Emergency Packet"}</option>{folders.map((folder) => <option key={folder.id} value={`move:${folder.id}`}>Move to {folder.name}</option>)}<option value="archive">Archive</option></select>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-medium text-neutral-700">{label}</span>{children}</label>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[96px_1fr] gap-2"><dt className="text-neutral-500">{label}</dt><dd className="font-medium text-neutral-800">{value}</dd></div>;
}

function ProcessingBadge({ document }: { document: HydratedDocument }) {
  if (document.processing_status === "pending" || document.processing_status === "processing") {
    return <Badge variant="yellow">Processing</Badge>;
  }
  if (document.processing_status === "failed") {
    return <Badge variant="red">Failed</Badge>;
  }
  if (document.extracted_text) {
    return <Badge variant="green">Indexed</Badge>;
  }
  return null;
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
