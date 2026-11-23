import { createPortal } from "react-dom";
import { useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertCircle, X, LoaderCircle } from "lucide-react";
import { useDialog } from "./useDialog";
export const Spinner = () => <LoaderCircle size={17} className="spin" />;
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={"vgm-brand " + (compact ? "compact" : "")}>
      <img src="/vgm-icon.png" alt="Logo de VGM" />
      <div>
        <strong>VGM</strong>
        <span>HERRAMIENTAS Y SOLUCIONES</span>
      </div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  useDialog(true, onClose, dialog);
  return createPortal(
    <motion.div
      className="overlay"
      onSubmit={(e) => e.stopPropagation()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.section
        ref={dialog}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 22, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.22 }}
      >
        <div className="modal-header">
          <div>
            <small>VGM · HERRAMIENTAS Y SOLUCIONES</small>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar modal"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </motion.section>
    </motion.div>,
    document.body,
  );
}
type Notice = {
  id: string;
  title: string;
  description?: string;
  error?: boolean;
};
export function useNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const dismiss = (id: string) =>
    setNotices((n) => n.filter((x) => x.id !== id));
  const notify = (title: string, description?: string, error = false) =>
    setNotices((n) => [
      ...n.slice(-3),
      { id: crypto.randomUUID(), title, description, error },
    ]);
  const Toasts = (
    <div className="toast-stack" aria-live="polite">
      <AnimatePresence>
        {notices.map((n) => (
          <motion.div
            className={"toast " + (n.error ? "toast-error" : "")}
            key={n.id}
            role={n.error ? "alert" : "status"}
            initial={{ opacity: 0, x: 30, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30 }}
          >
            <span className="toast-icon">
              {n.error ? <AlertCircle size={21} /> : <CheckCircle2 size={21} />}
            </span>
            <div>
              <strong>{n.title}</strong>
              {n.description && <p>{n.description}</p>}
            </div>
            <button
              className="icon-button"
              aria-label="Cerrar notificación"
              onClick={() => dismiss(n.id)}
            >
              <X size={15} />
            </button>
            <motion.div
              className="toast-progress"
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: n.error ? 8 : 5, ease: "linear" }}
              onAnimationComplete={() => dismiss(n.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
  return { notify, Toasts };
}
