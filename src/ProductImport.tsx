import { useEffect, useRef, useState } from "react";
import { UploadCloud, Download, CheckCircle2, AlertCircle } from "lucide-react";
import { motion } from "motion/react";
import { Modal, Spinner } from "./ui";
import { api } from "./api";
import { download } from "./exports";
import type { Product, ProductInput } from "../shared/inventory";
export function ProductImport({
  products,
  onClose,
  onImported,
}: {
  products: Product[];
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null),
    worker = useRef<Worker | null>(null),
    [rows, setRows] = useState<ProductInput[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [phase, setPhase] = useState<
      "select" | "reading" | "preview" | "uploading" | "error" | "done"
    >("select"),
    [done, setDone] = useState(0),
    [job, setJob] = useState(""),
    [name, setName] = useState(""),
    [drag, setDrag] = useState(false);
  const cursor = useRef(0);
  useEffect(() => () => worker.current?.terminate(), []);
  const active = phase === "reading" || phase === "uploading";
  const percent =
    phase === "done"
      ? 100
      : phase === "reading"
        ? 5
        : rows.length
          ? Math.round(20 + (done / rows.length) * 80)
          : 0;
  async function read(file?: File) {
    if (!file || active) return;
    setErrors([]);
    setRows([]);
    setDone(0);
    cursor.current = 0;
    setName(file.name);
    setJob(crypto.randomUUID());
    if (
      !file.name.toLowerCase().endsWith(".xlsx") ||
      file.size > 5 * 1024 * 1024
    ) {
      setErrors(["Usa un archivo .xlsx de hasta 5 MB."]);
      setPhase("select");
      return;
    }
    setPhase("reading");
    try {
      const buffer = await file.arrayBuffer();
      worker.current?.terminate();
      const w = new Worker(
        new URL("./productImport.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      const timeout = setTimeout(() => {
        w.terminate();
        setErrors(["El archivo demoró demasiado. Reduce su tamaño."]);
        setPhase("select");
      }, 15000);
      w.onerror = () => {
        clearTimeout(timeout);
        w.terminate();
        setErrors(["No se pudo leer el archivo."]);
        setPhase("select");
      };
      w.onmessage = (event) => {
        clearTimeout(timeout);
        w.terminate();
        if (!event.data.ok) {
          setErrors([event.data.error]);
          setPhase("select");
          return;
        }
        const imported = event.data.rows as ProductInput[];
        const conflicts = imported
          .filter((r) => products.some((p) => p.code === r.code))
          .map((r) => "El código " + r.code + " ya existe en el catálogo.");
        setRows(imported);
        setErrors([...event.data.errors, ...conflicts]);
        setPhase("preview");
      };
      w.postMessage(buffer, [buffer]);
    } catch (e) {
      setErrors([(e as Error).message]);
      setPhase("select");
    }
  }
  async function upload() {
    setPhase("uploading");
    setErrors([]);
    try {
      for (let offset = cursor.current; offset < rows.length; offset += 25) {
        await api("products/import", {
          rows: rows.slice(offset, offset + 25),
          batchId: job + "-" + Math.floor(offset / 25),
        });
        cursor.current = Math.min(offset + 25, rows.length);
        setDone(cursor.current);
      }
      await onImported();
      setPhase("done");
    } catch (e) {
      setErrors([(e as Error).message]);
      setPhase("error");
      await onImported().catch(() => {});
    }
  }
  return (
    <Modal
      title="Importar productos desde Excel"
      onClose={() => {
        if (!active) onClose();
      }}
      wide
    >
      <div className="modal-body">
        <p>
          Descarga la plantilla, completa los datos y revisa la vista previa. La
          importación crea productos nuevos; no modifica existencias de códigos
          ya registrados.
        </p>
        <button
          className="template-button"
          disabled={active}
          onClick={async () => {
            try {
              const { templateBuffer } = await import("./productExcel");
              download(
                new Blob([templateBuffer()], {
                  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                }),
                "Plantilla-productos-VGM.xlsx",
              );
            } catch (e) {
              setErrors([(e as Error).message]);
            }
          }}
        >
          <Download size={16} />
          Descargar plantilla Excel
        </button>
        {["select", "preview"].includes(phase) && (
          <div
            className={"import-drop " + (drag ? "dragging" : "")}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              read(e.dataTransfer.files[0]);
            }}
          >
            <UploadCloud size={30} />
            <button type="button" onClick={() => input.current?.click()}>
              {name ? "Cambiar archivo" : "Seleccionar Excel"}
            </button>
            <small>
              {name || "O arrastra un archivo .xlsx aquí · máximo 500 filas"}
            </small>
            <input
              ref={input}
              hidden
              type="file"
              accept=".xlsx"
              aria-label="Archivo Excel de productos"
              onChange={(e) => {
                read(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        )}
        {["reading", "uploading", "done", "error"].includes(phase) && (
          <div
            className={
              "import-progress " + (phase === "done" ? "complete" : "")
            }
            role="status"
          >
            <div className="import-progress-heading">
              {phase === "done" ? (
                <CheckCircle2 size={28} />
              ) : phase === "error" ? (
                <AlertCircle size={28} />
              ) : (
                <Spinner />
              )}
              <div>
                <h3>
                  {phase === "reading"
                    ? "Leyendo y validando…"
                    : phase === "done"
                      ? "Importación completada"
                      : phase === "error"
                        ? "Importación pausada"
                        : "Guardando productos…"}
                </h3>
                <p>
                  {done} de {rows.length} productos guardados
                </p>
              </div>
              <strong>{percent}%</strong>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Progreso de importación"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <motion.div
                animate={{ width: percent + "%" }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <small>
              {phase === "error"
                ? "Los lotes ya guardados se conservan. Reintentar no los duplica."
                : phase === "done"
                  ? "El catálogo ya está actualizado."
                  : "Mantén esta ventana abierta hasta terminar."}
            </small>
          </div>
        )}
        {!!errors.length && (
          <div className="import-errors" role="alert">
            <strong>{errors.length} observación(es)</strong>
            <ul>
              {errors.slice(0, 30).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {phase === "preview" && !!rows.length && (
          <>
            <h3 className="spaced">Vista previa · {rows.length} registros</h3>
            <div className="import-preview table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descripción</th>
                    <th>Tipo</th>
                    <th>Precio</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((p) => (
                    <tr key={p.code}>
                      <td>{p.code}</td>
                      <td>{p.description}</td>
                      <td>{p.type === "product" ? "Producto" : "Servicio"}</td>
                      <td>{p.price}</td>
                      <td>{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <small>
              Vista previa de hasta 50 filas. Se importarán las {rows.length}{" "}
              filas válidas solo cuando no haya errores.
            </small>
          </>
        )}
        <div className="modal-actions">
          <button disabled={active} onClick={onClose}>
            {phase === "done" ? "Cerrar" : "Cancelar"}
          </button>
          {phase === "preview" && (
            <button
              className="primary"
              disabled={!rows.length || !!errors.length}
              onClick={upload}
            >
              Importar {rows.length} productos
            </button>
          )}
          {phase === "error" && (
            <button className="primary" onClick={upload}>
              Reintentar desde el último lote
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
