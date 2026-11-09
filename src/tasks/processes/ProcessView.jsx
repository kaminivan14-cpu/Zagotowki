import { tr } from "../../i18n/runtime";
import ProcessDiagram from "./ProcessDiagram";
import { assignmentName, responsiblePosition } from "./model";
import { useState } from "react";
import Dialog from "../components/Dialog";
import { dateLabel } from "../dateTime";
import {
  processSteps,
  processProgress,
  taskState,
  durationText,
  referenceName,
  dependencyEdges,
} from "./model";
import { P } from "./labels";

export default function ProcessView({
  instance,
  data,
  directory,
  onClose,
  onDetails,
  onEdit,
  canManage,
  run,
  busy,
}) {
  const [rating, setRating] = useState(instance.rating || 5),
    [comment, setComment] = useState(instance.rating_comment || "");

  const current = instance.template
    ? instance
    : data.instances.find((i) => i.id === instance.id) || instance;

  const version = data.versions.find((v) => v.id === current.version_id),
    doc = current.execution_snapshot ||
      version?.definition ||
      current.doc || { stages: [] },
    steps = processSteps(doc),
    tasks = current.tasks || [],
    progress = processProgress(tasks),
    edges = dependencyEdges(doc);

  const ends = tasks
      .map((t) => t.deadline_at)
      .filter(Boolean)
      .sort(),
    end = ends.at(-1);

  const rows = doc.stages.length
    ? doc.stages.map((s, i) => ({
        ...s,
        index: i,
        tasks: s.tasks.map((t) => {
          const live =
            tasks.find((x) => x.step_key === t.key || x.step?.key === t.key) ||
            tasks.find((x) => x.title === t.title && x.stage === s.name);
          return {
            ...t,
            ...live,
            step: live?.step || t,
            number: steps.find((x) => x.key === t.key)?.number,
          };
        }),
      }))
    : [...new Set(tasks.map((t) => t.stage))].map((name, i) => ({
        key: name,
        name,
        index: i,
        tasks: tasks.filter((t) => t.stage === name),
      }));

  return (
    <Dialog title={current.name} onClose={onClose}>
      <header className="process-view-heading">
        <div className="process-view-status-group">
          <span
            className={`process-badge ${current.template ? "status-active" : progress === 100 ? "status-completed" : "status-working"}`}
          >
            {current.template
              ? version?.status === "published"
                ? tr("Опублікована")
                : tr("Чернетка")
              : progress === 100
                ? tr("Виконано")
                : tr("В роботі")}
          </span>
          <span className="process-version-tag">
            {tr("Версія")} {version?.number || current.number}
          </span>
        </div>

        {!current.template && (
          <div className="process-view-dates-progress">
            <p className="process-dates-label">
              <span>
                {P.start}: <strong>{dateLabel(current.starts_on)}</strong>
              </span>
              <span className="separator">·</span>
              <span>
                {P.end}:{" "}
                <strong>{end ? dateLabel(end.slice(0, 10)) : P.noEnd}</strong>
              </span>
            </p>
            <div className="process-progress-wrapper">
              <span className="progress-value">
                {P.progress}: {progress}%
              </span>
              <progress max="100" value={progress} />
            </div>
          </div>
        )}

        {canManage && version && (
          <button
            className="secondary-action-btn"
            onClick={() => {
              onClose();
              onEdit(version);
            }}
          >
            {version.status === "draft"
              ? tr("Редагувати процес")
              : tr("Переглянути версію")}
          </button>
        )}
      </header>

      <details className="editor-expandable-section process-diagram-details">
        <summary>{tr("Діаграма процесу")}</summary>
        <div className="expandable-content">
          <ProcessDiagram
            doc={doc}
            employees={directory.employees}
            disabled
            onSelect={(key) => {
              const t = tasks.find((t) => t.step_key === key);
              if (t) {
                onClose();
                onDetails(t);
              }
            }}
          />
        </div>
      </details>

      {rows.map((s) => {
        const known = s.tasks.every(
            (t) => t.step?.duration_days != null || t.duration_days != null,
          ),
          days = s.tasks.reduce(
            (n, t) => n + Number(t.step?.duration_days ?? t.duration_days ?? 0),
            0,
          );
        return (
          <details
            open
            key={s.key || s.index}
            className={`process-operational-stage stage-tone-${s.index % 4}`}
          >
            <summary>
              <strong>
                {s.index + 1}. {s.name}
              </strong>{" "}
              · {tr("{n} завдань", { n: s.tasks.length })}{" "}
              {known && `· ~${tr("{n} дн.", { n: days })}`}{" "}
              {!current.template && `· ${processProgress(s.tasks)}%`}
            </summary>
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "#",
                      tr("Завдання"),
                      tr("Тривалість"),
                      P.dependencies,
                      tr("R · Виконавець"),
                      P.informed,
                      tr("Статус"),
                    ].map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.tasks.map((t, j) => (
                    <tr key={t.key || t.id}>
                      <td>{t.number || `${s.index + 1}.${j + 1}`}</td>
                      <td>
                        <details className="process-task-details">
                          <summary className="process-task-title">
                            {t.title}
                          </summary>
                          <div className="process-task-expanded-body">
                            {t.step?.description && (
                              <p className="task-desc">{t.step.description}</p>
                            )}
                            {t.step?.instruction && (
                              <div className="task-instruction-box">
                                <strong>Інструкція:</strong>
                                <p>{t.step.instruction}</p>
                              </div>
                            )}
                            {t.step?.expected_result && (
                              <p className="task-result-box">
                                <strong>Очікуваний результат:</strong>{" "}
                                {t.step.expected_result}
                              </p>
                            )}

                            <div className="process-raci-grid">
                              <p>
                                <span>{P.accountable}:</span>{" "}
                                <strong>
                                  {(t.step?.raci?.accountable || [])
                                    .map((r) => referenceName(r, directory))
                                    .join(", ") || P.none}
                                </strong>
                              </p>
                              <p>
                                <span>{P.consulted}:</span>{" "}
                                <strong>
                                  {(t.step?.raci?.consulted || [])
                                    .map((r) => referenceName(r, directory))
                                    .join(", ") || P.none}
                                </strong>
                              </p>
                            </div>

                            {t.step?.checklist?.length > 0 && (
                              <div className="process-task-checklist font-small">
                                <strong>Чекліст:</strong>
                                <ul>
                                  {t.step.checklist.map((x, k) => (
                                    <li key={k}>{x}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {t.id && (
                              <button
                                type="button"
                                className="primary-action-link"
                                onClick={() => {
                                  onClose();
                                  onDetails(t);
                                }}
                              >
                                {tr("Відкрити завдання")} →
                              </button>
                            )}
                          </div>
                        </details>
                      </td>
                      <td>{durationText(t.step || t)}</td>
                      <td>
                        {current.template
                          ? edges
                              .filter((e) => e.to === t.key)
                              .map(
                                (e) =>
                                  steps.find((x) => x.key === e.from)?.number ||
                                  e.from,
                              )
                              .join(", ") || "—"
                          : (t.dependencies || [])
                              .map((id) => {
                                const predecessor = tasks.find(
                                  (x) => x.id === id,
                                );
                                return (
                                  steps.find(
                                    (x) => x.key === predecessor?.step_key,
                                  )?.number ||
                                  predecessor?.title ||
                                  `#${id}`
                                );
                              })
                              .join(", ") || "—"}
                      </td>
                      <td>
                        {directory.employees.find(
                          (e) =>
                            e.id ===
                            (t.assigned_to_employee_id ||
                              t.step?.assigned_to_employee_id),
                        )?.name ||
                          (current.template && responsiblePosition(t)
                            ? assignmentName(responsiblePosition(t), doc)
                            : directory.departments.find(
                                (d) => d.id === t.step?.department_id,
                              )?.name) ||
                          P.none}
                      </td>
                      <td>
                        {(t.step?.raci?.informed || [])
                          .map((r) => referenceName(r, directory))
                          .join(", ") || P.none}
                      </td>
                      <td>
                        <span
                          className={`process-status status-${taskState(t)}`}
                        >
                          {P.states[taskState(t)]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}

      <small className="planning-help display-block margin-top-12">
        {P.stageSummary}
      </small>

      {!current.template &&
        canManage &&
        tasks.length > 0 &&
        tasks.every((t) => ["completed", "cancelled"].includes(t.status)) && (
          <form
            className="process-rating-form"
            onSubmit={async (e) => {
              e.preventDefault();
              await run("process_rate", {
                instance_id: current.id,
                rating: Number(rating),
                rating_comment: comment,
              });
            }}
          >
            <h3>{tr("Оцінити процес")}</h3>
            <div className="editor-grid">
              <label className="task-field-block">
                <span>{tr("Оцінка")}</span>
                <input
                  type="number"
                  min="1"
                  max="5"
                  step="0.5"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                />
              </label>
              <label className="task-field-block">
                <span>{tr("Коментар")}</span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={tr("Ваш коментар про хід виконання процесів...")}
                />
              </label>
            </div>
            <button disabled={busy} className="primary">
              {tr("Зберегти оцінку")}
            </button>
          </form>
        )}
    </Dialog>
  );
}
