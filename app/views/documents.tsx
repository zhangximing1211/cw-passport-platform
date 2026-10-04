import { useRef, useState } from "react";
import { DOCUMENT_KINDS, type DocumentKind, type DocumentOwnerType } from "../../shared/api";
import { ApiError } from "../../src/api/client";
import { deleteDocument, formatBytes, formatHkDateTime, listDocuments, uploadDocument } from "../../src/api/data";
import { EmptyState, ErrorState, LoadingState, PanelHead, useAction, useApiData, useApp } from "../ui";

const KIND_ZH: Record<DocumentKind, string> = {
  "Material Declaration": "材料申報", "Transfer Document": "轉運文件", "Inspection Report": "檢驗報告",
  "Receiving Certificate": "收貨證明", "Processing Record": "處理記錄", "Material Photo": "材料照片", "Other": "其他",
};

export function kindLabel(kind: DocumentKind, L: (en: string, zh: string) => string) {
  return L(kind, KIND_ZH[kind]);
}

/** Documents attached to a passport, transfer or listing: list, upload, open, delete. */
export function DocumentsPanel({ ownerType, ownerId, canUpload, defaultKind = "Material Declaration", title, subtitle }: {
  ownerType: DocumentOwnerType; ownerId: string; canUpload: boolean; defaultKind?: DocumentKind; title?: string; subtitle?: string;
}) {
  const { L, user, isAdmin, version, refresh } = useApp();
  const docs = useApiData(`docs|${ownerType}|${ownerId}|${version}`, (signal) => listDocuments(ownerType, ownerId, signal));
  const [kind, setKind] = useState<DocumentKind>(defaultKind);
  const fileInput = useRef<HTMLInputElement>(null);
  const { busy, run } = useAction();

  const upload = async () => {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    const done = await run(() => uploadDocument(ownerType, ownerId, file, kind), L(`Uploaded ${file.name}`, `已上傳 ${file.name}`));
    if (fileInput.current) fileInput.current.value = "";
    if (done) refresh();
  };
  const remove = async (id: string, filename: string) => {
    if (!window.confirm(L(`Delete ${filename}?`, `確定刪除 ${filename}？`))) return;
    if (await run(() => deleteDocument(id), L("Document deleted", "文件已刪除")) !== undefined) refresh();
  };

  const restricted = docs.error instanceof ApiError && docs.error.status === 403;
  return <section className="documents-panel">
    <PanelHead title={title ?? L("Documents", "文件")} subtitle={subtitle ?? L("PDF, PNG, JPEG or WebP, up to 10 MB each", "PDF、PNG、JPEG 或 WebP，每份不超過 10 MB")} />
    {canUpload && <div className="upload-row">
      <select aria-label={L("Document type", "文件類別")} value={kind} onChange={(event) => setKind(event.target.value as DocumentKind)}>
        {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{kindLabel(k, L)}</option>)}
      </select>
      <input ref={fileInput} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" aria-label={L("Choose file", "選擇檔案")} />
      <button type="button" className="primary-btn" disabled={busy} onClick={upload}>{busy ? L("Uploading...", "上傳中...") : L("Upload", "上傳")}</button>
    </div>}
    {restricted ? <p className="muted-note">{L("Only the owning organisation and regulators can see these documents.", "只有所屬機構及監管機構可查看這些文件。")}</p>
      : docs.error ? <ErrorState error={docs.error} onRetry={docs.reload} />
      : !docs.data ? <LoadingState compact />
      : docs.data.items.length === 0 ? <EmptyState title={L("No documents yet", "尚未有文件")} hint={canUpload ? L("Upload the first document above.", "請在上方上傳第一份文件。") : L("Nothing has been attached to this record.", "此記錄尚未附加文件。")} />
      : <div className="doc-list">{docs.data.items.map((doc) => <div className="doc-row" key={doc.id}>
        <span className="doc-type">{doc.contentType === "application/pdf" ? "PDF" : "IMG"}</span>
        <div><a href={doc.url} target="_blank" rel="noopener noreferrer">{doc.filename}</a><small>{kindLabel(doc.kind, L)} · {formatBytes(doc.size)} · {formatHkDateTime(doc.createdAt)}</small></div>
        {(isAdmin || doc.uploadedBy === user.id) && <button type="button" className="text-btn danger" onClick={() => remove(doc.id, doc.filename)}>{L("Delete", "刪除")}</button>}
      </div>)}</div>}
  </section>;
}
