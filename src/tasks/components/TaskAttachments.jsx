import { useEffect, useRef, useState } from "react";
import { tr } from "../../i18n/runtime";
import { supabase } from "../../supabase";
import TasksButton from "./ui/TasksButton";
import TasksIcon from "./ui/TasksIcon";
import TasksConfirmationDialog from "./ui/TasksConfirmationDialog";
import { instantLabel } from "../dateTime";
// Multi-file attachments (РБ-014) on the existing private bucket. Upload → file_register (server verifies
// object, MIME and size and records the activity event) → list with preview/open/remove. Each file
// tracks its own state; a retry re-registers the already uploaded object without duplicating it.
const attachmentLimit = 20971520;
const attachmentAccept = ".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx,.xls,.docx,.doc";
const allowed = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Legacy Word / Excel (RB-014, D-26); the server checks the same list against the bucket configuration.
  "application/msword",
  "application/vnd.ms-excel",
];
const formatSize = (bytes) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
const isImage = (mime) => ["image/jpeg", "image/png", "image/webp"].includes(mime);
function Thumbnail({ objectKey }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    supabase.storage
      .from("tasks-private")
      .createSignedUrl(objectKey, 300)
      .then(({ data }) => {
        if (live && data?.signedUrl) setUrl(data.signedUrl);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [objectKey]);
  return url ? <img src={url} alt="" className="task-attachment-thumb" /> : <TasksIcon name="image" size={22} />;
}
export default function TaskAttachments({ task, attachments, canAttach, run, busy, zone }) {
  const input = useRef(null);
  const [queue, setQueue] = useState([]),
    [removing, setRemoving] = useState(null),
    [error, setError] = useState("");
  const [keys, setKeys] = useState({});
  useEffect(() => {
    // Signed URLs need the object key, which the details RPC omits on purpose; resolve lazily through tasks_file.
    let live = true;
    const missing = attachments.filter((a) => isImage(a.mime) && !keys[a.id]);
    if (!missing.length) return;
    Promise.all(
      missing.map((a) =>
        supabase
          .rpc("tasks_file", { p_id: a.id })
          .then(({ data }) => [a.id, data?.object_key])
          .catch(() => [a.id, null]),
      ),
    ).then((pairs) => {
      if (live) setKeys((old) => ({ ...old, ...Object.fromEntries(pairs) }));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments.map((a) => a.id).join(",")]);
  // Open and download both pass the server read check (tasks_file) before a short-lived signed URL is issued.
  async function openFile(file, download = false) {
    setError("");
    const { data, error: rpcError } = await supabase.rpc("tasks_file", { p_id: file.id });
    if (rpcError || !data) return setError(tr("Файл недоступний"));
    const { data: signed, error: signError } = await supabase.storage
      .from("tasks-private")
      .createSignedUrl(data.object_key, 60, download ? { download: file.name } : undefined);
    if (signError) return setError(download ? tr("Не вдалося завантажити файл") : tr("Не вдалося відкрити файл"));
    window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
  }
  async function register(item) {
    const saved = await run("file_register", item.payload);
    if (saved) setQueue((q) => q.filter((x) => x.key !== item.key));
    else setQueue((q) => q.map((x) => (x.key === item.key ? { ...x, state: "failed" } : x)));
  }
  async function upload(files) {
    setError("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    for (const file of files) {
      const key = crypto.randomUUID();
      if (file.size > attachmentLimit || file.size < 1 || (file.type && !allowed.includes(file.type))) {
        setQueue((q) => [...q, { key, name: file.name, state: "rejected" }]);
        continue;
      }
      setQueue((q) => [...q, { key, name: file.name, state: "uploading" }]);
      try {
        const objectKey = `${user.id}/${key}`;
        const { error: uploadError } = await supabase.storage.from("tasks-private").upload(objectKey, file, { upsert: false });
        if (uploadError) throw uploadError;
        const payload = { id: key, object_key: objectKey, name: file.name, mime: file.type || "application/octet-stream", size_bytes: file.size, task_id: task.id };
        const item = { key, name: file.name, state: "registering", payload };
        setQueue((q) => q.map((x) => (x.key === key ? item : x)));
        await register(item);
      } catch {
        setQueue((q) => q.map((x) => (x.key === key ? { ...x, state: "upload_failed" } : x)));
      }
    }
  }
  const states = {
    uploading: tr("Завантаження…"),
    registering: tr("Збереження…"),
    failed: tr("Не вдалося зберегти файл"),
    upload_failed: tr("Не вдалося завантажити файл"),
    rejected: tr("Непідтримуваний тип або розмір понад 20 МБ"),
  };
  return (
    <div className="task-attachments">
      {error && (
        <p role="alert" className="tk-inline-error">
          {error}
        </p>
      )}
      {!attachments.length && !queue.length && <p className="tk-muted">{tr("Вкладень поки немає.")}</p>}
      <ul className="task-attachment-list">
        {attachments.map((a) => (
          <li key={a.id} className="task-attachment">
            <span className="task-attachment-preview" aria-hidden="true">
              {isImage(a.mime) && keys[a.id] ? <Thumbnail objectKey={keys[a.id]} /> : <TasksIcon name={isImage(a.mime) ? "image" : "file"} size={22} />}
            </span>
            <span className="task-attachment-info">
              <button type="button" className="task-attachment-name" title={a.name} onClick={() => openFile(a)}>
                {a.name}
              </button>
              <small>
                {formatSize(a.size_bytes)} · {a.uploaded_by?.name} · {instantLabel(a.created_at, zone)}
              </small>
            </span>
            <span className="task-attachment-actions">
              <TasksButton size="sm" variant="ghost" icon="open" iconOnly onClick={() => openFile(a)}>
                {tr("Відкрити {name}", { name: a.name })}
              </TasksButton>
              <TasksButton size="sm" variant="ghost" icon="download" iconOnly onClick={() => openFile(a, true)}>
                {tr("Завантажити {name}", { name: a.name })}
              </TasksButton>
              {a.can_remove && (
                <TasksButton size="sm" variant="ghost" icon="trash" iconOnly disabled={busy} onClick={() => setRemoving(a)}>
                  {tr("Видалити {name}", { name: a.name })}
                </TasksButton>
              )}
            </span>
          </li>
        ))}
        {queue.map((q) => (
          <li key={q.key} className={`task-attachment task-attachment-${q.state}`}>
            <span className="task-attachment-preview" aria-hidden="true">
              <TasksIcon name={q.state.includes("fail") || q.state === "rejected" ? "alert" : "spinner"} size={20} className={["uploading", "registering"].includes(q.state) ? "tk-spin" : ""} />
            </span>
            <span className="task-attachment-info">
              <span className="task-attachment-name">{q.name}</span>
              <small role={q.state.includes("fail") || q.state === "rejected" ? "alert" : "status"}>{states[q.state]}</small>
            </span>
            <span className="task-attachment-actions">
              {q.state === "failed" && (
                <TasksButton size="sm" onClick={() => register(q)} disabled={busy}>
                  {tr("Повторити")}
                </TasksButton>
              )}
              {(q.state.includes("fail") || q.state === "rejected") && (
                <TasksButton size="sm" variant="ghost" icon="close" iconOnly onClick={() => setQueue((list) => list.filter((x) => x.key !== q.key))}>
                  {tr("Прибрати")}
                </TasksButton>
              )}
            </span>
          </li>
        ))}
      </ul>
      {canAttach && (
        <div className="task-attachment-add">
          <TasksButton size="sm" icon="paperclip" disabled={busy} onClick={() => input.current?.click()}>
            {tr("Додати файли (до 20 МБ)")}
          </TasksButton>
          <input
            ref={input}
            hidden
            type="file"
            multiple
            accept={attachmentAccept}
            aria-label={tr("Файли для завантаження")}
            onChange={(e) => {
              const files = [...(e.target.files || [])];
              e.target.value = "";
              if (files.length) void upload(files);
            }}
          />
          <small className="tk-muted">PDF, JPG, PNG, WebP, TXT, CSV, DOC, DOCX, XLS, XLSX</small>
        </div>
      )}
      {removing && (
        <TasksConfirmationDialog
          danger
          title={tr("Видалити вкладення?")}
          text={tr("«{name}» буде вилучено із завдання. Запис про видалення збережеться в історії.", { name: removing.name })}
          confirmLabel={tr("Видалити")}
          busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const ok = await run("attachment_remove", { task_id: task.id, version: task.version, file_id: removing.id });
            if (ok) setRemoving(null);
          }}
        />
      )}
    </div>
  );
}
