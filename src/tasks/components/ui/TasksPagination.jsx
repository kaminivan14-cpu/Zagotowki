// Tasks-owned copy of src/ui/Pagination.jsx: the Tasks module styles and evolves it independently.
import { tr } from "../../../i18n/runtime";
import TasksIcon from "./TasksIcon";
// Root-group pagination; the caller formats the summary text.
export default function TasksPagination({ page, pages, onChange, summary, label }) {
  const numbers = [...new Set([1, page - 1, page, page + 1, pages])].filter(
    (n) => n > 0 && n <= pages,
  );
  return (
    <footer className="tk-pagination">
      <span className="tk-pagination-summary">{summary}</span>
      <nav aria-label={label || tr("Сторінки")}>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label={tr("Попередня сторінка")}
        >
          <TasksIcon name="chevronLeft" size={16} />
        </button>
        {numbers.map((n, i) => (
          <span key={n} className="tk-pagination-step">
            {i > 0 && numbers[i - 1] !== n - 1 && <span aria-hidden="true">…</span>}
            <button
              type="button"
              aria-current={n === page ? "page" : undefined}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          </span>
        ))}
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label={tr("Наступна сторінка")}
        >
          <TasksIcon name="chevronRight" size={16} />
        </button>
      </nav>
    </footer>
  );
}
