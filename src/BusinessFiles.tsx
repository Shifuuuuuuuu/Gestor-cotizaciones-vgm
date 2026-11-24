import { usePermissions } from "./usePermissions";
import { kindModules, type AccessModule } from "../shared/access";
import { useRef, useState } from "react";
import { Upload, Download, Paperclip } from "lucide-react";
import { api } from "./api";
import { ConfirmationDialog } from "./ui";
import { beginFeedback } from "./feedback";
import { binaryRequest, saveAttachment } from "./businessClient";
import { recordsOf, type BusinessRecord } from "../shared/business";
export function BusinessFiles({
  records,
  parentId,
  onRefresh,
  onArchive,
  portalToken,
  readOnly = false,
  accessModule,
}: {
  records: BusinessRecord[];
  parentId: string;
  onRefresh: () => Promise<void>;
  onArchive?: (record: BusinessRecord) => void;
  portalToken?: string;
  readOnly?: boolean;
  accessModule?: AccessModule;
}) {
  const { has } = usePermissions();
  const parent = records.find((r) => r.id === parentId);
  const scope = accessModule ?? kindModules[parent?.kind ?? ""];
  const allowed = (action: "create" | "share" | "delete" | "export") =>
    !!portalToken || (!!scope && has(scope, action));
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [share, setShare] = useState(false);
  const [retired, setRetired] = useState(false),
    [removing, setRemoving] = useState<BusinessRecord | null>(null);
  const base = portalToken
    ? "portal/" + portalToken + "/files/"
    : "business/files/";
  const files = recordsOf(records, "file").filter(
    (r) =>
      r.deleted === (!portalToken && retired) && r.data.parentId === parentId,
  );
  async function upload(file?: File) {
    if (!file || busy) return;
    const op = beginFeedback("Subiendo respaldo", "Guardando archivo");
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("El archivo debe pesar hasta 5 MB.");
      await binaryRequest(base + parentId, file, share, !!portalToken);
      op.step("Actualizando respaldos");
      try {
        await onRefresh();
        op.success("Respaldo guardado", file.name);
      } catch (e) {
        op.success(
          "Archivo guardado; listado pendiente",
          (e as Error).message,
          "warning",
        );
      }
    } catch (e) {
      op.error(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section className="business-subsection">
      <h3>
        <Paperclip size={16} /> Respaldos y adjuntos
      </h3>
      {!readOnly && allowed("create") && (
        <>
          <p className="hint">
            PDF, JPG, PNG, WebP, Excel o Word. Hasta 5 MB por archivo.
            {!portalToken &&
              " Los archivos de documentos internos solo aparecen en el portal cuando también compartes su documento de servicio."}
          </p>
          <input
            ref={input}
            type="file"
            hidden
            accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.docx"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <div className="catalog-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Upload size={16} />
              {busy ? "Guardando…" : "Adjuntar respaldo"}
            </button>
            {!portalToken && allowed("share") && (
              <label className="business-checkbox">
                <input
                  type="checkbox"
                  checked={share}
                  onChange={(e) => setShare(e.target.checked)}
                />
                Visible para el cliente
              </label>
            )}
          </div>
        </>
      )}
      {!portalToken && !readOnly && has("trash") && (
        <label className="business-checkbox spaced">
          <input
            type="checkbox"
            checked={retired}
            onChange={(e) => setRetired(e.target.checked)}
          />
          Ver archivos retirados
        </label>
      )}
      <ul className="business-file-list">
        {files.map((file) => (
          <li key={file.id}>
            <div>
              <strong>{file.data.name}</strong>
              <small>
                {Math.ceil(file.data.size / 1024)} KB ·{" "}
                {file.data.visibleToClient ? "Marcado para portal" : "Interno"}
              </small>
            </div>
            <div className="catalog-actions">
              <button
                hidden={!allowed("export")}
                disabled={file.deleted}
                type="button"
                onClick={async () => {
                  const op = beginFeedback(
                    "Descargando respaldo",
                    "Preparando descarga",
                  );
                  try {
                    await saveAttachment(base + file.id, file, !!portalToken);
                    op.success("Descarga iniciada", file.data.name);
                  } catch (e) {
                    op.error(e);
                  }
                }}
              >
                <Download size={15} />
                Descargar
              </button>
              {!portalToken && !readOnly && !file.deleted && (
                <>
                  <button
                    hidden={!allowed("share")}
                    type="button"
                    onClick={async () => {
                      const op = beginFeedback("Actualizando acceso");
                      try {
                        await api("business", {
                          action: "share",
                          id: file.id,
                          version: file.version,
                          visible: !file.data.visibleToClient,
                        });
                        await onRefresh();
                        op.success(
                          "Visibilidad actualizada",
                          undefined,
                          "edit",
                        );
                      } catch (e) {
                        op.error(e);
                      }
                    }}
                  >
                    {file.data.visibleToClient ? "Hacer interno" : "Compartir"}
                  </button>
                  {
                    <button
                      type="button"
                      className="danger"
                      hidden={!allowed("delete")}
                      onClick={() =>
                        onArchive ? onArchive(file) : setRemoving(file)
                      }
                    >
                      Quitar
                    </button>
                  }
                </>
              )}
              {!portalToken &&
                !readOnly &&
                file.deleted &&
                allowed("delete") &&
                has("trash") && (
                  <button
                    disabled={busy}
                    onClick={async () => {
                      const op = beginFeedback("Recuperando respaldo");
                      try {
                        await api("business", {
                          action: "archive",
                          id: file.id,
                          version: file.version,
                          deleted: false,
                          reason: "Restauración de respaldo",
                        });
                        await onRefresh();
                        op.success("Respaldo recuperado");
                      } catch (e) {
                        op.error(e);
                      }
                    }}
                  >
                    Recuperar archivo
                  </button>
                )}
            </div>
          </li>
        ))}
      </ul>
      {!files.length && <p className="hint">Sin archivos adjuntos.</p>}
      {removing && (
        <ConfirmationDialog
          title="¿Quitar respaldo?"
          description="El archivo dejará de mostrarse en el registro y en el portal. Podrás recuperarlo desde Ver archivos retirados."
          busy={busy}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            const op = beginFeedback("Retirando respaldo");
            setBusy(true);
            try {
              await api("business", {
                action: "archive",
                id: removing.id,
                version: removing.version,
                deleted: true,
                reason: "Archivo retirado de los respaldos activos",
              });
              await onRefresh();
              setRemoving(null);
              op.success("Respaldo retirado", undefined, "warning");
            } catch (e) {
              op.error(e);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </section>
  );
}
