import { createPortal } from "react-dom";
import {
  useRef,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import { modalStore, type ModalEntry } from "./modalStore";
import {
  Check,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Pencil,
  X,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import {
  feedbackStore,
  notify,
  dismissFeedback,
  type FeedbackNotice,
} from "./feedback";
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
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const id = useRef(crypto.randomUUID()).current;
  useLayoutEffect(() => () => modalStore.remove(id), [id]);
  useLayoutEffect(() => {
    modalStore.set({ id, title, children, onClose, wide, className });
  }, [id, title, children, onClose, wide, className]);
  return null;
}
const smoothTransition = { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const };
function ModalSurface({
  title,
  children,
  onClose,
  wide,
  className,
}: ModalEntry) {
  const dialog = useRef<HTMLElement>(null);
  const present = useIsPresent();
  const reduced = useReducedMotion();
  useDialog(present, onClose, dialog);
  return (
    <motion.div
      className="overlay"
      onSubmit={(e) => e.stopPropagation()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24 }}
    >
      <motion.section
        ref={dialog}
        className={"modal " + (wide ? "wide " : "") + (className ?? "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: reduced ? 0 : 14, scale: reduced ? 1 : 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduced ? 0 : 8, scale: reduced ? 1 : 0.985 }}
        transition={smoothTransition}
        style={{ pointerEvents: present ? "auto" : "none" }}
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
    </motion.div>
  );
}
export function ModalLayer() {
  const entries = useSyncExternalStore(
    modalStore.subscribe,
    modalStore.getSnapshot,
  );
  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {entries.map((entry, index) => (
          <div
            key={entry.id}
            style={{ position: "relative", zIndex: 30 + index }}
          >
            <ModalSurface {...entry} />
          </div>
        ))}
      </AnimatePresence>
    </MotionConfig>,
    document.body,
  );
}
export function ConfirmationDialog({
  title,
  description,
  children,
  onClose,
  onConfirm,
  busy = false,
  confirmDisabled = false,
  confirmLabel = "Sí, eliminar",
  tone = "danger",
}: {
  title: string;
  description: string;
  children?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
  confirmDisabled?: boolean;
  confirmLabel?: string;
  tone?: "danger" | "warning";
}) {
  const Icon = tone === "danger" ? Trash2 : AlertTriangle;
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !confirmDisabled) onConfirm();
        }}
      >
        <div className={"modal-body confirmation-body confirmation-" + tone}>
          <span className="confirmation-emblem">
            <Icon size={30} aria-hidden="true" />
          </span>
          <h3>¿Estás seguro de que quieres continuar?</h3>
          <p>{description}</p>
          {children}
        </div>
        <div className="modal-actions modal-footer">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className={"confirmation-submit confirmation-" + tone}
            disabled={busy || confirmDisabled}
          >
            {busy ? <Spinner /> : <Icon size={16} />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function FeedbackCard({
  notice,
  queued,
}: {
  notice: FeedbackNotice;
  queued: number;
}) {
  const dialog = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const dismiss = () => dismissFeedback(notice.id);
  useDialog(true, dismiss, dialog);
  useEffect(() => {
    if (notice.loading) return;
    const timer = setTimeout(() => dismissFeedback(notice.id), 10000);
    return () => clearTimeout(timer);
  }, [notice.id, notice.loading]);
  useEffect(() => {
    dialog.current
      ?.querySelector(".feedback-steps li:last-child")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [notice.steps.length]);
  const Icon = notice.loading
    ? LoaderCircle
    : {
        success: CheckCircle2,
        edit: Pencil,
        warning: AlertTriangle,
        error: XCircle,
      }[notice.kind];
  return (
    <motion.div
      className="feedback-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24 }}
    >
      <motion.section
        ref={dialog}
        className={"feedback-card feedback-" + notice.kind}
        role="dialog"
        aria-modal="true"
        aria-labelledby={"feedback-title-" + notice.id}
        aria-describedby={
          notice.description ? "feedback-description-" + notice.id : undefined
        }
        layout="size"
        initial={{ opacity: 0, y: reduced ? 0 : 12, scale: reduced ? 1 : 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduced ? 0 : 6, scale: reduced ? 1 : 0.985 }}
        transition={smoothTransition}
      >
        <button
          className="feedback-close icon-button"
          aria-label="Cerrar alerta"
          onClick={dismiss}
        >
          <X size={20} />
        </button>
        <div className="feedback-emblem">
          <Icon
            size={42}
            className={notice.loading ? "spin" : ""}
            aria-hidden="true"
          />
        </div>
        <div
          role={notice.kind === "error" && !notice.loading ? "alert" : "status"}
          aria-live={notice.kind === "error" ? "assertive" : "polite"}
        >
          <h2 id={"feedback-title-" + notice.id}>{notice.title}</h2>
          {notice.description && (
            <p id={"feedback-description-" + notice.id}>{notice.description}</p>
          )}
        </div>
        {!!notice.steps.length && (
          <ol className="feedback-steps" aria-label="Progreso de la operación">
            {notice.steps.map((step, index) => {
              const current = index === notice.steps.length - 1;
              const complete =
                !current ||
                (!notice.loading &&
                  !notice.failed &&
                  notice.kind !== "warning");
              return (
                <li
                  key={index}
                  className={complete ? "complete" : "current"}
                  aria-current={current && notice.loading ? "step" : undefined}
                >
                  <span>
                    {complete ? (
                      <Check size={14} />
                    ) : notice.loading ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : notice.kind === "warning" ? (
                      <AlertTriangle size={14} />
                    ) : (
                      <X size={14} />
                    )}
                  </span>
                  <small>{step}</small>
                </li>
              );
            })}
          </ol>
        )}
        <button className="feedback-done" onClick={dismiss}>
          {notice.loading ? "Ocultar progreso" : "Entendido"}
        </button>
        <small className="feedback-footnote">
          {notice.loading
            ? "Puedes ocultar esta alerta; la operación continuará."
            : "Esta alerta se cierra automáticamente en 10 segundos."}
        </small>
        {queued > 0 && (
          <small className="feedback-footnote">
            {queued} aviso(s) más por revisar
          </small>
        )}
        {!notice.loading && (
          <motion.div
            className="feedback-countdown"
            key={"countdown-" + notice.id}
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: 10, ease: "linear" }}
          />
        )}
      </motion.section>
    </motion.div>
  );
}
export function useNotices() {
  const notices = useSyncExternalStore(
    feedbackStore.subscribe,
    feedbackStore.getSnapshot,
  );
  const Toasts = createPortal(
    <AnimatePresence mode="wait">
      {notices[0] && (
        <FeedbackCard
          key={notices[0].id}
          notice={notices[0]}
          queued={notices.length - 1}
        />
      )}
    </AnimatePresence>,
    document.body,
  );
  return { notify, Toasts };
}
