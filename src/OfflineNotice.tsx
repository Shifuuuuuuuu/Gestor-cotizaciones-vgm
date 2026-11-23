import { useEffect, useRef, useState } from "react";
import type { Profile } from "../shared/people";
import type { Doc } from "../shared/model";
import type { PendingSave } from "../shared/offline";
import {
  pendingItems,
  retryPending,
  resolvePending,
  baseSnapshot,
  storage,
} from "./offlineStore";
import { synchronize } from "./api";
import { download, exportDoc } from "./exports";
import { Modal, Spinner } from "./ui";
export function OfflineNotice({
  connected,
  user,
  onRefresh,
  notify,
}: {
  connected: boolean | null;
  user: Profile;
  onRefresh: () => Promise<void>;
  notify: (title: string, description?: string, error?: boolean) => void;
}) {
  const [items, setItems] = useState<PendingSave[]>([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [serverDocs, setServerDocs] = useState<Doc[]>([]);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const pending = await pendingItems(),
        base = await baseSnapshot();
      if (mounted) {
        setItems(pending);
        setServerDocs(base?.documents ?? []);
      }
    };
    const update = () => {
      void load();
      void refresh.current().catch(() => {});
    };
    const synced = async (event: Event) => {
      const { doc, owner, isNew } = (
        event as CustomEvent<{ doc: Doc; owner: string; isNew: boolean }>
      ).detail;
      if (owner !== user.id) return;
      notify("Documento sincronizado", doc.number);
      if (isNew && doc.kind === "quote")
        try {
          await exportDoc(doc, "pdf");
          notify("PDF generado", doc.number + " · Descarga iniciada.");
        } catch (e) {
          notify(
            "Documento sincronizado; PDF pendiente",
            (e as Error).message + " Descárgalo desde el detalle.",
            true,
          );
        }
    };
    void load();
    window.addEventListener("vgm-offline-updated", update);
    window.addEventListener("vgm-doc-synced", synced);
    return () => {
      mounted = false;
      window.removeEventListener("vgm-offline-updated", update);
      window.removeEventListener("vgm-doc-synced", synced);
    };
  }, [user.id]);
  useEffect(() => {
    if (connected) {
      void synchronize();
      const timer = setInterval(() => void synchronize(), 20000);
      return () => clearInterval(timer);
    }
  }, [connected, user.id]);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh.current();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const groups = [...new Set(items.map((p) => p.doc.id))].map((id) => ({
    last: items.filter((p) => p.doc.id === id).at(-1)!,
    error: items.find((p) => p.doc.id === id && p.error)?.error,
    server: serverDocs.find((d) => d.id === id),
  }));
  const details = (d: Doc) =>
    JSON.stringify(
      {
        cliente: d.client,
        estado: d.status,
        version: d.version,
        lineas: d.items,
        notas: d.notes,
      },
      null,
      2,
    );
  return (
    <>
      {(connected === false || items.length > 0) && (
        <div className="offline-notice" role="status">
          <div>
            <strong>
              {connected === false
                ? "Desconectado · Puedes trabajar en borradores"
                : "Sincronización de documentos"}
            </strong>
            <p>
              {items.length
                ? items.length +
                  " cambio(s) pendiente(s). El stock y los correlativos se confirman al sincronizar."
                : "Estás viendo los datos guardados en este navegador."}
            </p>
          </div>
          {items.length > 0 && (
            <button onClick={() => setOpen(true)}>Ver pendientes</button>
          )}
        </div>
      )}
      {open && (
        <Modal
          title="Documentos pendientes de sincronización"
          wide
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div className="modal-body">
            <p>
              Los cambios locales permanecen guardados en este navegador.
              Compara las versiones antes de resolver un conflicto.
            </p>
            <div className="catalog-actions">
              <button
                disabled={busy || connected !== true}
                onClick={() =>
                  run(async () => {
                    await retryPending();
                    await synchronize();
                  })
                }
              >
                {busy && <Spinner />}Reintentar sincronización
              </button>
              <button
                onClick={() =>
                  run(async () => {
                    const backup = await storage((s) => s.accounts[user.id]);
                    download(
                      new Blob([JSON.stringify(backup, null, 2)], {
                        type: "application/json",
                      }),
                      "respaldo-pendientes-vgm.json",
                    );
                  })
                }
              >
                Respaldar cambios locales
              </button>
            </div>
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
            {groups.map(({ last, error: issue, server }) => (
              <section className="pending-card" key={last.doc.id}>
                <h3>
                  {last.doc.number} · {last.doc.client}
                </h3>
                <p>{issue || "Pendiente de conexión o de sincronización."}</p>
                {issue && (
                  <>
                    <div className="pending-compare">
                      <div>
                        <b>Tu borrador local</b>
                        <pre>{details(last.doc)}</pre>
                      </div>
                      <div>
                        <b>Última versión del servidor</b>
                        {server ? (
                          <pre>{details(server)}</pre>
                        ) : (
                          <p>Aún no existe un documento confirmado.</p>
                        )}
                      </div>
                    </div>
                    <p className="hint">
                      Puedes cerrar esta ventana y editar tu borrador. Las
                      versiones locales sustituidas se conservan en el respaldo
                      de cambios locales.
                    </p>
                    <div className="catalog-actions">
                      <button
                        disabled={
                          busy ||
                          connected !== true ||
                          (!!server &&
                            (server.deleted || server.status !== "Borrador"))
                        }
                        onClick={() =>
                          run(async () => {
                            await resolvePending(last.doc.id, true);
                            await synchronize();
                          })
                        }
                      >
                        {server
                          ? "Usar mi borrador revisado"
                          : "Reintentar como documento nuevo"}
                      </button>
                      <button
                        disabled={busy || connected !== true}
                        onClick={() =>
                          run(() => resolvePending(last.doc.id, false))
                        }
                      >
                        {server
                          ? "Conservar la versión del servidor"
                          : "Archivar borrador local"}
                      </button>
                    </div>
                  </>
                )}
              </section>
            ))}
            {!items.length && <p>Todos los cambios están sincronizados.</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
