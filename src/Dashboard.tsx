import { useMemo, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { RotateCcw, BarChart3 } from "lucide-react";
import { analytics, localDate } from "../shared/analytics";
import { money, type Doc } from "../shared/model";
import type { Customer } from "../shared/people";
import type { Product } from "../shared/inventory";
const number = (n: number) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 }).format(n);
const compact = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="panel dashboard-panel">
      <h2>{title}</h2>
      <p>{subtitle}</p>
      {children}
    </section>
  );
}
export default function Dashboard({
  documents,
  customers,
  products,
  onRefresh,
  busy,
  onOpen,
}: {
  documents: Doc[];
  customers: Customer[];
  products: Product[];
  onRefresh: () => void;
  busy: boolean;
  onOpen: (d: Doc) => void;
}) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [kind, setKind] = useState<"quote" | "invoice">("quote");
  const reduced = useReducedMotion();
  const invalid = !!from && !!to && from > to;
  const a = useMemo(
    () => analytics(documents, customers, products, from, to),
    [documents, customers, products, from, to],
  );
  const states: { name: string; count: number }[] =
    kind === "quote" ? a.quoteStates : a.invoiceStates;
  const tooltipStyle = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text)",
  };
  function period(months: number) {
    const d = new Date();
    setTo(localDate(d));
    d.setDate(1);
    d.setMonth(d.getMonth() - months + 1);
    setFrom(localDate(d));
  }
  return (
    <div className="dashboard">
      <section className="panel dashboard-filters">
        <div>
          <span className="eyebrow">PANORAMA COMERCIAL</span>
          <h2>Los números de VGM</h2>
          <p>
            Importes en CLP con IVA. Filtrado por fecha del documento y su
            estado actual.
          </p>
        </div>
        <div className="dashboard-controls">
          <label>
            Desde
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button onClick={() => period(1)}>Este mes</button>
          <button onClick={() => period(12)}>12 meses</button>
          <button
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Todo
          </button>
          <button disabled={busy} onClick={onRefresh}>
            <RotateCcw size={16} className={busy ? "spin" : ""} />
            Actualizar
          </button>
        </div>
      </section>
      {invalid ? (
        <p role="alert" className="inline-error">
          La fecha Desde debe ser anterior o igual a Hasta.
        </p>
      ) : (
        <>
          {a.pending > 0 && (
            <p className="dashboard-note">
              {a.pending} documento(s) pendiente(s) de sincronización
              excluido(s) de las estadísticas.
            </p>
          )}
          <div className="stats">
            {[
              [
                "Total cotizado",
                money(a.quoted),
                number(a.quotes) + " cotizaciones · todos los estados",
              ],
              [
                "Total facturado",
                money(a.billed),
                "Facturas emitidas y pagadas",
              ],
              ["Por cobrar", money(a.receivable), "Facturas en estado Emitida"],
              [
                "Aceptación",
                a.acceptance === null
                  ? "Sin decisiones"
                  : number(Math.round(a.acceptance)) + "%",
                "Aceptadas / (aceptadas + rechazadas)",
              ],
            ].map(([title, value, sub]) => (
              <div className="stat" key={title}>
                <div>
                  {title}
                  <BarChart3 size={17} />
                </div>
                <strong>{value}</strong>
                <small>{sub}</small>
              </div>
            ))}
          </div>
          {!a.count && (
            <div className="panel dashboard-empty">
              <BarChart3 size={32} />
              <h3>Aún no hay documentos en este período</h3>
              <p>
                Los gráficos se completarán con tus cotizaciones y facturas
                guardadas. Puedes ampliar las fechas.
              </p>
            </div>
          )}
          <div className="dashboard-grid">
            <ChartCard
              title="Evolución mensual"
              subtitle="Cotizaciones y facturación se comparan; no se suman entre sí."
            >
              {a.count ? (
                <>
                  <div className="dashboard-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={a.monthly}
                        margin={{ left: 12, right: 20, top: 15, bottom: 5 }}
                        accessibilityLayer
                      >
                        <CartesianGrid
                          stroke="var(--border)"
                          strokeDasharray="3 3"
                        />
                        <XAxis
                          dataKey="month"
                          stroke="var(--muted)"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          tickFormatter={compact}
                          stroke="var(--muted)"
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(v) => money(Number(v))}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="cotizado"
                          name="Cotizado"
                          stroke="#c98d00"
                          strokeWidth={3}
                          isAnimationActive={!reduced}
                        />
                        <Line
                          type="monotone"
                          dataKey="facturado"
                          name="Facturado"
                          stroke="#398ccc"
                          strokeWidth={3}
                          isAnimationActive={!reduced}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <details className="chart-data">
                    <summary>Ver cifras por mes</summary>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Mes</th>
                            <th>Cotizado</th>
                            <th>Facturado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.monthly.map((r) => (
                            <tr key={r.month}>
                              <td>{r.month}</td>
                              <td>{money(r.cotizado)}</td>
                              <td>{money(r.facturado)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              ) : (
                <p className="dashboard-no-data">
                  Sin movimientos para graficar.
                </p>
              )}
            </ChartCard>
            <ChartCard
              title="Estado de documentos"
              subtitle="Cantidad de documentos por estado."
            >
              <div className="choice-group">
                <button
                  aria-pressed={kind === "quote"}
                  className={kind === "quote" ? "chosen" : ""}
                  onClick={() => setKind("quote")}
                >
                  Cotizaciones
                </button>
                <button
                  aria-pressed={kind === "invoice"}
                  className={kind === "invoice" ? "chosen" : ""}
                  onClick={() => setKind("invoice")}
                >
                  Facturas
                </button>
              </div>
              <div className="dashboard-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={states}
                    layout="vertical"
                    margin={{ left: 12, right: 25 }}
                    accessibilityLayer
                  >
                    <CartesianGrid
                      stroke="var(--border)"
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      stroke="var(--muted)"
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={85}
                      stroke="var(--muted)"
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar
                      dataKey="count"
                      name="Documentos"
                      fill="#c98d00"
                      radius={[0, 5, 5, 0]}
                      isAnimationActive={!reduced}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="hint">
                {states.map((s) => s.name + ": " + s.count).join(" · ")}
              </p>
            </ChartCard>
            <ChartCard
              title="Clientes principales"
              subtitle="Hasta 5 clientes por total facturado con IVA."
            >
              {a.clients.length ? (
                <ol className="dashboard-ranking">
                  {a.clients.map((c, i) => (
                    <li key={i}>
                      <span className="ranking-position">{i + 1}</span>
                      <div>
                        <strong>{c.name}</strong>
                        <small>{c.count} factura(s)</small>
                        <progress
                          value={c.total}
                          max={a.clients[0].total || 1}
                        />
                      </div>
                      <b>{money(c.total)}</b>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="dashboard-no-data">
                  Todavía no hay clientes con facturas emitidas o pagadas.
                </p>
              )}
            </ChartCard>
            <ChartCard
              title="Ítems más facturados"
              subtitle="Hasta 5 productos o servicios por importe neto, con descuentos y sin IVA."
            >
              {a.items.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ítem</th>
                        <th>Cantidad</th>
                        <th>Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.items.map((p, i) => (
                        <tr key={i}>
                          <td>
                            <strong>{p.name}</strong>
                            <small>{p.code}</small>
                          </td>
                          <td>{number(p.quantity)}</td>
                          <td>{money(p.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="dashboard-no-data">
                  Los ítems aparecerán al emitir o pagar una factura.
                </p>
              )}
            </ChartCard>
          </div>
          <div className="dashboard-grid">
            <ChartCard
              title="Cobranza del período"
              subtitle="La fecha corresponde a la emisión del documento, no a la fecha del pago."
            >
              <div className="dashboard-summary">
                <span>
                  Total en estado Pagada<strong>{money(a.paid)}</strong>
                </span>
                <span>
                  Facturas vencidas<strong>{a.overdue.length}</strong>
                </span>
              </div>
              {a.overdue.slice(0, 5).map((d) => (
                <button
                  className="dashboard-document"
                  key={d.id}
                  onClick={() => onOpen(d)}
                >
                  <span>
                    {d.number} · {d.client}
                    <small>Vencimiento: {d.due}</small>
                  </span>
                  <b>{money(d.total)}</b>
                </button>
              ))}
              {a.overdue.length > 5 && (
                <p className="hint">
                  Se muestran 5 de {a.overdue.length} facturas vencidas.
                </p>
              )}
            </ChartCard>
            <ChartCard
              title="Clientes y catálogo actual"
              subtitle="Situación actual; no depende del filtro de fechas. El stock puede incluir reservas locales pendientes."
            >
              <div className="dashboard-summary">
                {[
                  ["Clientes activos", a.activeCustomers],
                  ["Clientes bloqueados", a.blockedCustomers],
                  ["Productos", a.products],
                  ["Servicios", a.services],
                  ["Productos sin disponible", a.unavailable],
                  ["Unidades reservadas", a.reserved],
                ].map(([label, value]) => (
                  <span key={label}>
                    {label}
                    <strong>{number(Number(value))}</strong>
                  </span>
                ))}
              </div>
            </ChartCard>
          </div>
          <p className="hint">
            Se excluyen documentos eliminados y cambios pendientes. Las facturas
            en borrador o anuladas solo aparecen en el gráfico de estados. Estas
            estadísticas corresponden a los documentos internos de VGM.
          </p>
        </>
      )}
    </div>
  );
}
