export type NoticeKind = "success" | "edit" | "error" | "warning";
export type FeedbackNotice = {
  id: string;
  title: string;
  description?: string;
  kind: NoticeKind;
  loading: boolean;
  steps: string[];
  failed?: boolean;
};
let notices: FeedbackNotice[] = [];
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((listener) => listener());
export const feedbackStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => notices,
};
export function dismissFeedback(id: string) {
  notices = notices.filter((notice) => notice.id !== id);
  publish();
}
export function noticeKind(title: string): NoticeKind {
  if (/rechaz|anulad|error|no se pudo|no se pudieron/i.test(title))
    return "error";
  if (
    /pendiente|bloquead|desactivad|eliminad|papelera|archivad|revisa/i.test(
      title,
    )
  )
    return "warning";
  if (/editad|actualizad|cambios|perfil|versión recuperada/i.test(title))
    return "edit";
  return "success";
}
export function notify(
  title: string,
  description?: string,
  kind: boolean | NoticeKind = noticeKind(title),
) {
  notices = [
    ...notices,
    {
      id: crypto.randomUUID(),
      title,
      description,
      kind:
        typeof kind === "boolean" ? (kind ? "error" : noticeKind(title)) : kind,
      loading: false,
      steps: [],
    },
  ];
  publish();
}
export function beginFeedback(
  title = "Procesando solicitud",
  firstStep = "Procesando solicitud",
) {
  const id = crypto.randomUUID();
  let result = {
    title: "Operación completada",
    description: undefined as string | undefined,
    kind: "success" as NoticeKind,
  };
  notices = [
    ...notices,
    { id, title, kind: "edit", loading: true, steps: [firstStep] },
  ];
  publish();
  function update(patch: Partial<FeedbackNotice>) {
    notices = notices.map((notice) =>
      notice.id === id ? { ...notice, ...patch } : notice,
    );
    publish();
  }
  return {
    describe(description: string) {
      update({ description });
    },
    step(label: string) {
      const current = notices.find((notice) => notice.id === id);
      if (!current?.loading || current.steps.at(-1) === label) return;
      update({ title: label, steps: [...current.steps, label] });
    },
    result(
      title: string,
      description?: string,
      kind: NoticeKind = noticeKind(title),
    ) {
      result = { title, description, kind };
    },
    success(
      title = result.title,
      description = result.description,
      kind = result.kind,
    ) {
      update({ title, description, kind, loading: false });
    },
    error(error: unknown) {
      update({
        title: "No se pudo completar la acción",
        description: error instanceof Error ? error.message : String(error),
        kind: "error",
        loading: false,
        failed: true,
      });
    },
  };
}
export type FeedbackOperation = ReturnType<typeof beginFeedback>;
const foregroundSaves = new Map<string, number>();
export function beginForegroundSave(id: string) {
  foregroundSaves.set(id, (foregroundSaves.get(id) ?? 0) + 1);
  return () => {
    const count = (foregroundSaves.get(id) ?? 0) - 1;
    if (count > 0) foregroundSaves.set(id, count);
    else foregroundSaves.delete(id);
  };
}
export const isForegroundSave = (id: string) => foregroundSaves.has(id);
