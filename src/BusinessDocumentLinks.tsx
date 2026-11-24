import { usePermissions } from "./usePermissions";
import { useEffect, useState } from "react";
import { api } from "./api";
import {
  blankBusiness,
  invoicePaid,
  type BusinessState,
  type BusinessRecord,
} from "../shared/business";
import { money, type Doc } from "../shared/model";
import { BusinessFiles } from "./BusinessFiles";
export function BusinessDocumentLinks({
  doc,
  onOpen,
}: {
  doc: Doc;
  onOpen?: (record: BusinessRecord) => void;
}) {
  const { has } = usePermissions();
  const [state, setState] = useState<BusinessState>(blankBusiness),
    [error, setError] = useState("");
  async function reload() {
    const data = await api("business");
    setState(data);
    setError("");
  }
  useEffect(() => {
    let active = true;
    api("business")
      .then((data) => {
        if (active) setState(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [doc.id, doc.version]);
  const active = state.records.filter((r) => !r.deleted);
  const linked = active.filter(
    (r) =>
      ((r.kind === "order" || r.kind === "job") && r.data.quoteId === doc.id) ||
      (r.kind === "billing" && r.data.invoiceId === doc.id),
  );
  const relatedIds = new Set(
    linked.flatMap((r) =>
      r.kind === "billing" ? [r.data.orderId, r.data.jobId] : [r.id],
    ),
  );
  const related = active.filter((r) => relatedIds.has(r.id));
  return (
    <section className="business-subsection">
      <h3>Operación comercial y respaldos</h3>
      {error ? (
        <p className="hint">
          Las referencias requieren conexión.{" "}
          <button onClick={() => reload().catch((e) => setError(e.message))}>
            Reintentar
          </button>
        </p>
      ) : (
        <>
          {!!related.length && (
            <div className="catalog-actions">
              {related.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onOpen?.(r)}
                  disabled={!onOpen}
                >
                  {r.number} ·{" "}
                  {(r.data as any).title || (r.data as any).reference}
                </button>
              ))}
            </div>
          )}
          {doc.kind === "invoice" && has("collections") && (
            <p className="business-note">
              Cobrado: {money(invoicePaid(state, doc))} · Saldo:{" "}
              {money(Math.max(0, doc.total - invoicePaid(state, doc)))}.
              Registra abonos y asigna facturas a OC o servicios desde Cobranza.
            </p>
          )}
          {!related.length && (
            <p className="hint">
              Sin OC o servicio relacionado. Puedes crear una OC o vincular esta
              factura desde las nuevas secciones del menú.
            </p>
          )}
          <BusinessFiles
            records={state.records}
            parentId={doc.id}
            accessModule={doc.kind === "quote" ? "quotes" : "invoices"}
            onRefresh={reload}
            readOnly={!!doc.pending || doc.deleted}
          />
        </>
      )}
    </section>
  );
}
