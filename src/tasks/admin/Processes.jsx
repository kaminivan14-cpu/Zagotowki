import { tr } from "../../i18n/runtime";
import ProcessList from "../processes/ProcessList";
import ProcessView from "../processes/ProcessView";
import ProcessWizard from "../processes/ProcessWizard";
import ProcessLaunch from "../processes/ProcessLaunch";
import { P } from "../processes/labels";
import { isFinished } from "../processes/model";
import "../processes/processes.css";
import { useEffect, useState } from "react";
import { read, errorText } from "../client";
import { blankProcess } from "./labels";
import TasksButton from "../components/ui/TasksButton";
import TasksTabs from "../components/ui/TasksTabs";
export default function Processes({
  context,
  directory,
  run,
  busy,
  revision,
  people,
  onDetails,
}) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("templates"),
    [editor, setEditor] = useState(null),
    [launch, setLaunch] = useState(null),
    [instance, setInstance] = useState(null);
  useEffect(() => {
    let live = true;
    read("tasks_processes")
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [revision]);
  return (
    <section className="process-workspace">
      <div className="admin-toolbar">
        <div>
          <h3>{tr("Процеси")}</h3>
          <p>{tr("Керуйте шаблонами процесів та відстежуйте їх виконання")}</p>
        </div>
        {context.capabilities.includes("processes.manage") && (
          <TasksButton
            type="submit"
            variant="primary"
            className="primary"
            onClick={() => setEditor({ definition: blankProcess() })}
          >
            {tr("Створити процес")}
          </TasksButton>
        )}
      </div>
      {/* Process views use the shared Tasks tabs (same component as the task list). */}
      <TasksTabs
        label={tr("Перегляд процесів")}
        value={tab}
        onChange={setTab}
        items={[
          ["templates", P.templates],
          ["active", P.active],
          ["done", P.history],
        ].map(([k, v]) => ({
          id: k,
          label: v,
          count:
            data && k !== "templates"
              ? data.instances.filter((i) => isFinished(i) === (k === "done"))
                  .length
              : undefined,
        }))}
      />
      <p role="alert">{error}</p>
      {!data ? (
        <p>{tr("Завантаження…")}</p>
      ) : (
        <>
          <ProcessList
            {...{
              data,
              tab,
              directory,
              context,
              busy,
              run,
              setEditor,
              setLaunch,
              setInstance,
            }}
          />
          {editor && (
            <ProcessWizard
              key={editor.id || "new"}
              initial={editor}
              {...{ context, directory, run, busy, people }}
              onClose={() => setEditor(null)}
              roles={data.positions || []}
            />
          )}
          {launch && (
            <ProcessLaunch
              initial={launch}
              {...{ people, context, directory, busy, run }}
              onClose={() => setLaunch(null)}
              onLaunched={() => {
                setLaunch(null);
                setTab("active");
              }}
            />
          )}
          {instance && (
            <ProcessView
              {...{ instance, data, directory }}
              onClose={() => setInstance(null)}
              onDetails={onDetails}
              onEdit={setEditor}
              canManage={context.capabilities.includes("processes.manage")}
              run={run}
              busy={busy}
            />
          )}
        </>
      )}
    </section>
  );
}
