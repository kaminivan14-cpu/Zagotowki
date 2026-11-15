import { tr } from "../../i18n/runtime";
import TasksButton from "./ui/TasksButton";
import PersonAvatar from "../employees/PersonAvatar";
import { instantLabel } from "../dateTime";
// Comments are COMMENT_ADDED activity events; posting uses the existing `comment` command.
export default function CommentsSection({ task, events, run, busy, zone }) {
  const comments = events.filter((e) => e.event_type === "COMMENT_ADDED");
  return (
    <div className="task-comments">
      {!comments.length && <p className="tk-muted">{tr("Коментарів поки немає.")}</p>}
      <ul className="task-comment-list">
        {comments.map((c) => (
          <li key={c.id} className="task-comment">
            <PersonAvatar person={c.actor || { name: "?" }} size={30} />
            <div>
              <p className="task-comment-meta">
                <strong>{c.actor?.name || tr("Система")}</strong>
                <time dateTime={c.created_at}>{instantLabel(c.created_at, zone)}</time>
              </p>
              <p className="task-comment-text">{c.metadata?.text}</p>
            </div>
          </li>
        ))}
      </ul>
      {!task.deleted_at && (
        <form
          className="tk-form task-comment-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = e.currentTarget;
            if (await run("comment", { task_id: task.id, version: task.version, text: new FormData(f).get("text") })) f.reset();
          }}
        >
          <label className="tk-field">
            <span className="tk-field-label">{tr("Додати коментар")}</span>
            <textarea name="text" required maxLength={10000} rows={3} placeholder={tr("Напишіть коментар...")} />
          </label>
          <div className="tk-row">
            <TasksButton type="submit" size="sm" variant="primary" icon="comment" disabled={busy}>
              {tr("Додати коментар")}
            </TasksButton>
          </div>
        </form>
      )}
    </div>
  );
}
