// Tasks-owned copy of src/ui/ModalClose.jsx: the Tasks module styles and evolves it independently.
import { tr } from "../../../i18n/runtime";
import { useLocale } from "../../../i18n/useLocale";
// Use the dialog's existing cancel handler; never submit its form.
export default function TasksModalClose({ onClose, disabled = false }) {
  useLocale();
  return (
    <button
      type="button"
      className="tk-modal-close"
      aria-label={tr("Закрити")}
      disabled={disabled}
      onClick={onClose}
    >
      ×
    </button>
  );
}
