import { can, pageModules, type AccessRole } from "../shared/access";
import { RolesPanel } from "./RolesPanel";
import { rememberCredentials } from "./rememberCredentials";
import {
  beginFeedback,
  beginForegroundSave,
  type FeedbackOperation,
} from "./feedback";
import { useDialog } from "./useDialog";
import { TrashPanel } from "./TrashPanel";
import { SidebarAppearance, useSidebarColor } from "./SidebarAppearance";
import {
  NavigationAppearance,
  useNavigationLayout,
} from "./NavigationAppearance";
import { OfflineNotice } from "./OfflineNotice";
import { useConnection } from "./useConnection";
import { Administration, type AdminModule } from "./Administration";
import { lazy, Suspense, useEffect, useState, useRef } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  Package,
  LayoutDashboard,
  FileText,
  Receipt,
  History,
  Trash2,
  Plus,
  Search,
  ArrowUpRight,
  Download,
  ShieldCheck,
  LogOut,
  Users,
  Settings,
  RotateCcw,
  Sun,
  Moon,
  Monitor,
  ClipboardList,
  Wrench,
  Wallet,
  CalendarDays,
  Globe,
  Menu,
  X,
} from "lucide-react";
import { api, auth, login, logout } from "./api";
import {
  blank,
  money,
  statuses,
  type Doc,
  type Event,
  type Input,
  type Command,
} from "../shared/model";
import { cleanRut, type Customer, type Profile } from "../shared/people";
import { download, exportDoc } from "./exports";
import { Brand, Spinner, useNotices } from "./ui";
import { Login, ProfilePanel, AdminPanel } from "./Accounts";
import { CustomerPanel } from "./Customers";
import { DocumentEditor } from "./DocumentEditor";
import { DocumentDetail, actionLabels } from "./DocumentDetail";
import { HistoryPanel } from "./HistoryPanel";
import { ProductsPanel } from "./ProductsPanel";
import { BusinessPanel, type BusinessSection } from "./BusinessPanel";
import { downloadCommercialBackup } from "./businessClient";
import type { Product, StockMovement } from "../shared/inventory";
const Dashboard = lazy(() => import("./Dashboard"));
type Page =
  | "Dashboard"
  | "Resumen"
  | "Cotizaciones"
  | "Facturas"
  | "Productos"
  | "Clientes"
  | "Órdenes de compra"
  | "Servicios"
  | "Cobranza"
  | "Agenda"
  | "Portal de clientes"
  | "Historial"
  | "Papelera"
  | "Configuración"
  | "Mi perfil"
  | "Administración";
const businessSections: Partial<Record<Page, BusinessSection>> = {
  "Órdenes de compra": "orders",
  Servicios: "jobs",
  Cobranza: "payments",
  Agenda: "agenda",
  "Portal de clientes": "portal",
};
export default function App() {
  const connected = useConnection();
  const [mobileNavigation, setMobileNavigation] = useState(
    () => window.matchMedia("(max-width: 720px)").matches,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const change = () => {
      setMobileNavigation(media.matches);
      setMenuOpen(false);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const [page, setPage] = useState<Page>("Dashboard"),
    [documents, setDocuments] = useState<Doc[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [savedCustomers, setSavedCustomers] = useState<Customer[]>([]),
    [users, setUsers] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [products, setProducts] = useState<Product[]>([]),
    [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const productSaved = (p: Product) => {
    setProducts((old) => [...old.filter((x) => x.id !== p.id), p]);
    refresh().catch((e) =>
      notify("Producto guardado; catálogo pendiente", e.message, "warning"),
    );
  };
  const [mode, setMode] = useState(""),
    [ready, setReady] = useState(false),
    [user, setUser] = useState<Profile | null>(null),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("Todos");
  const [selected, setSelected] = useState<Doc | null>(null),
    [editing, setEditing] = useState<{ data: Input; old: Doc | null } | null>(
      null,
    ),
    [theme, setTheme] = useState(
      () => localStorage.getItem("vgm-theme") ?? "light",
    );
  const [sidebarColor, setSidebarColor] = useSidebarColor();
  const [navigationLayout, setNavigationLayout] = useNavigationLayout();
  const [businessFocus, setBusinessFocus] = useState<string | null>(null);
  const [adminModule, setAdminModule] = useState<AdminModule>("users");
  const drawerOpen = mobileNavigation && menuOpen && ready && !!user;
  useDialog(drawerOpen, () => setMenuOpen(false), navigationRef);
  const { notify, Toasts } = useNotices();
  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key === "vgm-logout-event") window.location.reload();
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  useEffect(() => {
    if (!user) return;
    let expired = false;
    const handle = () => {
      if (expired) return;
      expired = true;
      setUser(null);
      setSelected(null);
      setEditing(null);
      notify(
        "Vuelve a iniciar sesión",
        "Tu sesión finalizó o el servidor se reinició.",
      );
    };
    window.addEventListener("vgm-session-expired", handle);
    return () => window.removeEventListener("vgm-session-expired", handle);
  }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    let active = true,
      pending = false;
    const update = async () => {
      if (pending) return;
      pending = true;
      try {
        const me = await api("me");
        if (active)
          setUser((old) =>
            old &&
            old.id === me.id &&
            old.role === me.role &&
            old.permissionsVersion === me.permissionsVersion
              ? old
              : me,
          );
      } catch {
      } finally {
        pending = false;
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") void update();
    };
    const timer = setInterval(update, 20000);
    window.addEventListener("vgm-permissions-changed", update);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("vgm-permissions-changed", update);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    const allowed =
      page === "Mi perfil" ||
      (page === "Administración"
        ? user.role === "admin"
        : can(user, pageModules[page]));
    if (!allowed)
      setPage(
        (Object.entries(pageModules).find(([, module]) =>
          can(user, module),
        )?.[0] ?? "Mi perfil") as Page,
      );
    setSelected(null);
    setEditing(null);
    setBusinessFocus(null);
    if (user.role !== "admin") {
      setUsers([]);
      setRoles([]);
    }
  }, [user?.id, user?.role, user?.permissionsVersion]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    localStorage.setItem("vgm-theme", theme);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const config = await api("config");
        if (!active) return;
        setMode(config.mode);
        if (config.mode === "firebase" && auth) await auth.authStateReady();
        try {
          const me = await api("me");
          if (active) setUser(me);
        } catch {
          /* No saved session. */
        }
      } catch {
        if (active)
          notify(
            "No se pudo conectar",
            "Revisa que el servidor Node esté ejecutándose.",
            true,
          );
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  async function refresh() {
    const [data, customers] = await Promise.all([
      api("data"),
      can(user, "customers") ? api("customers") : Promise.resolve([]),
    ]);
    setProducts(data.products ?? []);
    setStockMovements(data.stockMovements ?? []);
    setDocuments(data.documents);
    setEvents(
      data.events.sort((a: Event, b: Event) => b.at.localeCompare(a.at)),
    );
    setSavedCustomers(customers);
    setSelected((s) =>
      s ? (data.documents.find((d: Doc) => d.id === s.id) ?? null) : null,
    );
  }
  useEffect(() => {
    if (user)
      refresh().catch((e) =>
        notify("No se pudieron cargar los datos", e.message, true),
      );
  }, [user?.id, user?.role, user?.permissionsVersion]);
  async function loadAdministration() {
    const [team, access] = await Promise.all([api("users"), api("roles")]);
    setUsers(team);
    setRoles(access.roles);
  }
  useEffect(() => {
    if (
      (page === "Administración" || page === "Papelera") &&
      user?.role === "admin"
    )
      loadAdministration().catch((e) =>
        notify("No se pudo cargar el equipo", e.message, true),
      );
  }, [page, user?.role]);
  async function run(
    work: (operation: FeedbackOperation) => Promise<unknown>,
    message?: string,
  ) {
    setBusy(true);
    const operation = beginFeedback();
    if (message) operation.result(message);
    try {
      await work(operation);
      operation.success();
      return true;
    } catch (e) {
      operation.error(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function signIn(email: string, password: string, remember: boolean) {
    await run(async (operation) => {
      operation.step("Iniciando sesión");
      if (mode === "firebase") await login(email, password);
      else await api("login", { email, password });
      const me = await api("me");
      rememberCredentials(email, password, remember);
      setUser(me);
      setPage("Dashboard");
      operation.result(
        `¡Bienvenido, ${me.name.split(" ")[0]}!`,
        "Inicio de sesión exitoso. Tu espacio de trabajo está listo.",
      );
    });
  }
  const signOut = () =>
    run(async (operation) => {
      operation.step("Cerrando sesión");
      await api("logout", {});
      await logout();
      setUser(null);
      setSelected(null);
      setEditing(null);
      setProducts([]);
      setStockMovements([]);
      setDocuments([]);
      setEvents([]);
      setUsers([]);
      setSavedCustomers([]);
      operation.result("Sesión cerrada", "Hasta pronto.");
    });
  const switchPage = (next: Page) => {
    if (
      next !== "Mi perfil" &&
      (next === "Administraci\u00f3n"
        ? user?.role !== "admin"
        : !can(user, pageModules[next]))
    )
      return;
    setBusinessFocus(null);
    setMenuOpen(false);
    setPage(next);
    setSearch("");
    setFilter("Todos");
  };
  async function command(
    cmd: Command,
    operation: FeedbackOperation,
    open = true,
  ) {
    operation.step(
      cmd.action === "save"
        ? "Guardando información"
        : "Enviando cambio al servidor",
    );
    let finishSave = () => {};
    let d: Doc;
    try {
      d = await api("commands", cmd, {
        onQueued: (id) => {
          finishSave = beginForegroundSave(id);
        },
      });
    } finally {
      finishSave();
    }
    operation.step(
      d.pending ? "Actualizando copia local" : "Actualizando documentos",
    );
    let refreshError = "";
    await refresh().catch((e) => {
      refreshError = (e as Error).message;
    });
    if (open) setSelected(d);
    operation.result(
      d.pending
        ? "Borrador guardado en este navegador"
        : cmd.action === "convert"
          ? "Factura generada"
          : cmd.action === "save"
            ? cmd.id
              ? "Cambios guardados"
              : d.kind === "invoice"
                ? "Factura creada"
                : "Cotización creada"
            : cmd.action === "status"
              ? (d.kind === "quote" ? "Cotización " : "Factura ") +
                d.status.toLowerCase()
              : actionLabels[cmd.action],
      d.pending
        ? "Pendiente de sincronización. El PDF final estará disponible al confirmar el servidor."
        : d.number +
            " · Versión " +
            d.version +
            " guardada en el historial." +
            (refreshError
              ? " No se pudo actualizar el listado: " + refreshError
              : ""),
      d.pending || refreshError
        ? "warning"
        : cmd.action === "save" && cmd.id
          ? "edit"
          : cmd.action === "status" &&
              (d.status === "Rechazada" || d.status === "Anulada")
            ? "error"
            : cmd.action === "delete"
              ? "warning"
              : cmd.action === "version"
                ? "edit"
                : "success",
    );
    return d;
  }
  async function saveDocument(data: Input) {
    if (!editing) return;

    await run(async (operation) => {
      const saved = await command(
        {
          action: "save",
          id: editing.old?.id,
          version: editing.old?.version,
          data,
        },
        operation,
      );
      setEditing(null);
      if (saved.pending) return;
      try {
        const existing = customers.find(
          (c) =>
            (cleanRut(c.rut) && cleanRut(c.rut) === cleanRut(data.rut)) ||
            c.name.toLowerCase() === data.client.toLowerCase(),
        );
        if (
          can(user, "customers") &&
          can(user, "customers", existing ? "edit" : "create")
        ) {
          operation.step("Actualizando directorio de clientes");
          await api("customers", {
            data: {
              name: data.client,
              rut: data.rut,
              email: data.email,
              address: data.address,
              phone:
                customers.find(
                  (c) =>
                    cleanRut(c.rut) && cleanRut(c.rut) === cleanRut(data.rut),
                )?.phone ?? "",
            },
          });
          setSavedCustomers(await api("customers"));
        }
      } catch (e) {
        operation.result(
          "Documento guardado",
          "No se pudo actualizar el directorio: " + (e as Error).message,
          "warning",
        );
      }
      if (
        !editing.old &&
        saved.kind === "quote" &&
        can(user, "quotes", "export")
      ) {
        try {
          await exportDoc(saved, "pdf", operation.step);
        } catch (e) {
          operation.result(
            "Cotización guardada; PDF pendiente",
            (e as Error).message + " Puedes descargarlo desde el detalle.",
            "warning",
          );
        }
      }
    });
  }
  const customers = [...savedCustomers].sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
  const active = documents.filter((d) => !d.deleted),
    quotes = active.filter((d) => d.kind === "quote"),
    invoices = active.filter((d) => d.kind === "invoice");
  const visible = documents
    .filter(
      (d) =>
        (page === "Papelera" ? d.deleted : !d.deleted) &&
        (page === "Cotizaciones"
          ? d.kind === "quote"
          : page === "Facturas"
            ? d.kind === "invoice"
            : true) &&
        (filter === "Todos" || d.status === filter) &&
        `${d.number} ${d.client} ${d.rut}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const newDoc = (kind: "quote" | "invoice") => {
    if (!can(user, kind === "quote" ? "quotes" : "invoices", "create")) return;
    setSelected(null);
    setEditing({ old: null, data: { ...blank(), kind } });
  };
  const nav = [
    ["Dashboard", LayoutDashboard],
    ["Resumen", FileText],
    ["Cotizaciones", FileText],
    ["Facturas", Receipt],
    ["Productos", Package],
    ["Clientes", Users],
    ["Órdenes de compra", ClipboardList],
    ["Servicios", Wrench],
    ["Cobranza", Wallet],
    ["Agenda", CalendarDays],
    ["Portal de clientes", Globe],
    ["Historial", History],
    ["Papelera", Trash2],
    ["Configuración", Settings],
  ] as const;
  const renderBusiness = (section: BusinessSection) =>
    user ? (
      <BusinessPanel
        section={section}
        focusId={businessFocus}
        customers={customers}
        documents={documents}
        user={user}
        onRefresh={refresh}
        onDocument={setSelected}
        onNewInvoice={(record) => {
          if (!can(user, "invoices", "create")) return;
          const customer = customers.find((c) => c.id === record.customerId);
          const data = record.data as any;
          setEditing({
            old: null,
            data: {
              ...blank(),
              kind: "invoice",
              client: record.customerName,
              rut: record.customerRut,
              email: customer?.email ?? "",
              address: customer?.address ?? "",
              notes: "Servicio " + record.number + " · " + (data.scope ?? ""),
              items: [
                {
                  description: data.title || "Servicio " + record.number,
                  quantity: 1,
                  price: 0,
                  discount: 0,
                },
              ],
            },
          });
        }}
      />
    ) : null;
  const descriptions: Record<Page, string> = {
    Dashboard: "Cotizaciones, facturación y actividad comercial en cifras.",
    Resumen: "Una mirada clara a tus cotizaciones, ventas y próximos pasos.",
    Cotizaciones:
      "Crea propuestas y acompaña cada oportunidad hasta el cierre.",
    Facturas: "Organiza tus facturas internas y su estado de pago.",
    Productos: "Productos, servicios y existencias en un solo lugar.",
    Clientes: "Los datos de tus clientes, siempre a mano.",
    "Órdenes de compra":
      "Respalda lo aprobado por el cliente y controla su facturación.",
    Servicios:
      "Órdenes de trabajo, informes, recepción conforme y rentabilidad.",
    Cobranza: "Pagos, anticipos, comprobantes y saldos de facturas.",
    Agenda: "Entregas, mantenciones, garantías y vencimientos.",
    "Portal de clientes":
      "Comparte documentos y recibe respaldos de tus clientes.",
    Historial: "Cada cambio, su responsable y una copia para recuperar.",
    Papelera:
      "Cotizaciones, facturas, productos, clientes y usuarios eliminados.",
    Configuración: "Personaliza VGM y administra tus respaldos.",
    "Mi perfil": "Tu información, tal como quieres que la vea tu equipo.",
    Administración:
      "Gestiona usuarios, permisos y toda la operación comercial desde un solo panel.",
  };
  if (!ready)
    return (
      <div className="boot">
        <Brand />
        <Spinner />
        <p>Preparando VGM…</p>
        {Toasts}
      </div>
    );
  if (!user)
    return (
      <MotionConfig reducedMotion="user">
        <Login mode={mode} busy={busy} onLogin={signIn} />
        {Toasts}
      </MotionConfig>
    );
  return (
    <MotionConfig reducedMotion="user">
      <div className="app" data-navigation={navigationLayout}>
        <div className="mobile-navigation-bar" inert={drawerOpen}>
          <Brand compact />
          <button
            className="icon-button"
            aria-label="Abrir menú de navegación"
            aria-controls="vgm-navigation"
            aria-expanded={drawerOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={24} />
          </button>
        </div>
        <AnimatePresence>
          {drawerOpen && (
            <motion.div
              className="navigation-backdrop"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMenuOpen(false)}
            />
          )}
        </AnimatePresence>
        <aside
          id="vgm-navigation"
          ref={navigationRef}
          className={drawerOpen ? "mobile-menu-open" : ""}
          role={drawerOpen ? "dialog" : undefined}
          aria-modal={drawerOpen ? true : undefined}
          aria-label="Menú de navegación"
          aria-hidden={mobileNavigation && !drawerOpen ? true : undefined}
          inert={mobileNavigation && !drawerOpen}
        >
          <Brand compact />
          <button
            className="mobile-navigation-close icon-button"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          >
            <X size={22} />
          </button>
          <small className="nav-label">PRINCIPAL</small>
          <nav>
            {nav
              .filter(([name]) => can(user, pageModules[name]))
              .map(([name, Icon]) => (
                <button
                  aria-current={page === name ? "page" : undefined}
                  className={page === name ? "active" : ""}
                  key={name}
                  aria-label={name}
                  title={name}
                  onClick={() => switchPage(name)}
                >
                  <Icon size={18} />
                  <span className="nav-text">{name}</span>
                  {name === "Cotizaciones" && <em>{quotes.length}</em>}
                </button>
              ))}
            {user.role === "admin" && (
              <button
                aria-label="Administración"
                title="Administración"
                className={page === "Administración" ? "active" : ""}
                onClick={() => switchPage("Administración")}
              >
                <ShieldCheck size={18} />
                <span className="nav-text">Administración</span>
              </button>
            )}
          </nav>
          <div className="profile">
            <span
              className={
                "connection " +
                (connected === null
                  ? "checking"
                  : connected
                    ? "connected"
                    : "disconnected")
              }
              role="status"
              aria-label={
                connected === null
                  ? "Comprobando conexión con el servidor VGM"
                  : connected
                    ? "Conectado al servidor VGM"
                    : "Desconectado del servidor VGM"
              }
              title={
                connected === null
                  ? "Comprobando conexión con el servidor VGM"
                  : connected
                    ? "Conectado al servidor VGM"
                    : "Desconectado del servidor VGM"
              }
            >
              <i aria-hidden="true" />
              <span className="connection-label">
                {connected === null
                  ? "Comprobando…"
                  : connected
                    ? "Conectado"
                    : "Desconectado"}
              </span>
            </span>
            <button
              className="profile-link"
              aria-label="Mi perfil"
              title="Mi perfil"
              onClick={() => switchPage("Mi perfil")}
            >
              <span className="avatar">
                {user.name.slice(0, 2).toUpperCase()}
              </span>
              <span>
                {user.name}
                <small>
                  {user.roleName ??
                    (user.role === "admin" ? "Admin" : "Usuario")}
                </small>
              </span>
            </button>
            <button
              aria-label="Cerrar sesión"
              className="icon-button"
              onClick={() => {
                setMenuOpen(false);
                signOut();
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </aside>
        <main inert={drawerOpen}>
          <OfflineNotice
            connected={connected}
            user={user}
            onRefresh={refresh}
            notify={notify}
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              className="content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <div className="heading">
                <div>
                  <div className="eyebrow">VGM · HERRAMIENTAS Y SOLUCIONES</div>
                  <h1>
                    {page === "Resumen" ? "Tu negocio, en perspectiva." : page}
                  </h1>
                  <p>{descriptions[page]}</p>
                </div>
                {(page === "Cotizaciones" || page === "Facturas") &&
                  can(
                    user,
                    page === "Facturas" ? "invoices" : "quotes",
                    "create",
                  ) && (
                    <button
                      className="primary"
                      onClick={() =>
                        newDoc(page === "Facturas" ? "invoice" : "quote")
                      }
                    >
                      <Plus size={18} />
                      Nueva {page === "Facturas" ? "factura" : "cotización"}
                    </button>
                  )}
              </div>
              {page === "Dashboard" && (
                <Suspense
                  fallback={
                    <div className="dashboard-empty">
                      <Spinner />
                      Cargando estadísticas…
                    </div>
                  }
                >
                  <Dashboard
                    documents={documents}
                    customers={savedCustomers}
                    products={products}
                    busy={busy}
                    onOpen={setSelected}
                    onRefresh={() => run(refresh, "Estadísticas actualizadas")}
                  />
                </Suspense>
              )}
              {page === "Resumen" && (
                <>
                  <div className="stats">
                    {[
                      [
                        "Total cotizado",
                        money(quotes.reduce((s, d) => s + d.total, 0)),
                        `${quotes.length} cotizaciones activas`,
                      ],
                      [
                        "Por aprobar",
                        quotes.filter((d) => d.status === "Enviada").length,
                        "Propuestas enviadas",
                      ],
                      [
                        "Ventas aceptadas",
                        money(
                          quotes
                            .filter((d) => d.status === "Aceptada")
                            .reduce((s, d) => s + d.total, 0),
                        ),
                        "Cotizaciones confirmadas",
                      ],
                      [
                        "Por cobrar",
                        money(
                          invoices
                            .filter((d) => d.status === "Emitida")
                            .reduce((s, d) => s + d.total, 0),
                        ),
                        "Facturas emitidas pendientes",
                      ],
                    ].map(([title, value, sub], i) => (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="stat"
                        key={title}
                      >
                        <div>
                          {title}
                          <ArrowUpRight size={18} />
                        </div>
                        <strong>{value}</strong>
                        <small>{sub}</small>
                      </motion.div>
                    ))}
                  </div>
                  <div className="welcome">
                    <div>
                      <span className="eyebrow">
                        HERRAMIENTAS PARA HACERLO POSIBLE
                      </span>
                      <h2>
                        De una buena propuesta
                        <br />a un gran proyecto.
                      </h2>
                      <p>
                        Tu equipo, tus clientes y cada oportunidad en un mismo
                        lugar.
                      </p>
                      <button
                        hidden={!can(user, "quotes")}
                        onClick={() => switchPage("Cotizaciones")}
                      >
                        Ver cotizaciones <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <div className="abstract" aria-hidden="true">
                      <div />
                      <div />
                      <div />
                      <img src="/vgm-icon.png" alt="" />
                    </div>
                  </div>
                </>
              )}
              {["Resumen", "Cotizaciones", "Facturas"].includes(page) && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>
                      {page === "Resumen" ? "Documentos recientes" : page}
                      <span>{visible.length}</span>
                    </h2>
                    <button
                      onClick={() => run(refresh, "Datos actualizados")}
                      disabled={busy}
                    >
                      <RotateCcw size={15} />
                      Actualizar
                    </button>
                  </div>
                  <div className="toolbar">
                    <label className="search">
                      <Search size={17} />
                      <input
                        aria-label="Buscar documentos"
                        placeholder="Buscar por número, cliente o RUT…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filtrar por estado"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {[
                        "Todos",
                        ...new Set([...statuses.quote, ...statuses.invoice]),
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Documento</th>
                          <th>Cliente</th>
                          <th>Fecha</th>
                          <th>Estado</th>
                          <th className="right">Total</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {visible
                          .slice(0, page === "Resumen" ? 6 : visible.length)
                          .map((d) => (
                            <tr key={d.id} onClick={() => setSelected(d)}>
                              <td>
                                <strong>{d.number}</strong>
                                <small>
                                  {d.kind === "quote"
                                    ? "Cotización"
                                    : "Factura interna"}{" "}
                                  · v{d.version}
                                </small>
                              </td>
                              <td>
                                {d.client}
                                <small>{d.rut || "Sin RUT"}</small>
                              </td>
                              <td>
                                {d.date}
                                <small>Vence {d.due}</small>
                              </td>
                              <td>
                                <span className={"badge " + d.status}>
                                  {d.status}
                                </span>
                              </td>
                              <td className="right">
                                <strong>{money(d.total)}</strong>
                              </td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label={"Abrir " + d.number}
                                >
                                  <ArrowUpRight size={17} />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {!visible.length && (
                    <div className="empty">
                      <FileText size={36} />
                      <h3>
                        {search || filter !== "Todos"
                          ? "No hay coincidencias"
                          : page === "Papelera"
                            ? "La papelera está vacía"
                            : "Tu próximo proyecto comienza aquí"}
                      </h3>
                      <p>
                        {page === "Papelera"
                          ? "Aquí encontrarás los documentos eliminados."
                          : "Los documentos aparecerán aquí cuando los crees."}
                      </p>
                    </div>
                  )}
                </section>
              )}
              {businessSections[page] &&
                renderBusiness(businessSections[page]!)}
              {page === "Productos" && (
                <ProductsPanel
                  products={products}
                  movements={stockMovements}
                  onRefresh={refresh}
                  onSaved={productSaved}
                />
              )}
              {page === "Clientes" && (
                <CustomerPanel
                  customers={customers}
                  busy={busy}
                  onAccess={(customer, active, deleted) =>
                    run(
                      async (operation) => {
                        operation.step("Guardando estado del cliente");
                        const saved = customer.id.startsWith("derived-")
                          ? await api("customers", { data: customer })
                          : customer;
                        await api("customers/access", {
                          id: saved.id,
                          active,
                          deleted,
                        });
                        operation.step("Actualizando directorio");
                        setSavedCustomers(await api("customers"));
                      },
                      deleted
                        ? "Cliente eliminado"
                        : active
                          ? "Cliente activado"
                          : customer.deleted
                            ? "Cliente recuperado (bloqueado)"
                            : "Cliente bloqueado",
                    )
                  }
                  onSave={(data) =>
                    run(
                      async (operation) => {
                        operation.step("Guardando cliente");
                        await api("customers", {
                          id: data.id.startsWith("derived-")
                            ? undefined
                            : data.id || undefined,
                          data,
                        });
                        operation.step("Actualizando directorio");
                        setSavedCustomers(await api("customers"));
                      },
                      data.id && !data.id.startsWith("derived-")
                        ? "Cliente editado"
                        : "Cliente creado",
                    )
                  }
                />
              )}
              {page === "Historial" && (
                <HistoryPanel
                  documents={documents}
                  events={events}
                  onOpen={setSelected}
                />
              )}
              {page === "Papelera" && (
                <TrashPanel
                  documents={documents}
                  products={products}
                  customers={customers}
                  users={users}
                  admin={user.role === "admin"}
                  busy={busy}
                  onOpen={setSelected}
                  onRestore={(kind, id) =>
                    run(async (operation) => {
                      operation.step("Recuperando registro");
                      if (kind === "quote" || kind === "invoice") {
                        const d = documents.find((d) => d.id === id)!;
                        await api("commands", {
                          action: "restore",
                          id,
                          version: d.version,
                        });
                      } else if (kind === "product") {
                        const p = products.find((p) => p.id === id)!;
                        await api("products/access", {
                          id,
                          version: p.version,
                          deleted: false,
                        });
                      } else if (kind === "customer")
                        await api("customers/access", {
                          id,
                          active: false,
                          deleted: false,
                        });
                      else {
                        await api("users/trash", { id, deleted: false });
                        setUsers(await api("users"));
                      }
                      operation.step("Actualizando información");
                      await refresh();
                    }, "Registro restaurado")
                  }
                />
              )}
              {page === "Configuración" && (
                <div className="settings-grid">
                  <section className="panel settings">
                    <h2>Apariencia</h2>
                    <p>
                      Elige cómo quieres ver VGM. Tu preferencia se guardará en
                      este navegador.
                    </p>
                    <div className="theme-options">
                      {(
                        [
                          ["light", "Claro", Sun],
                          ["dark", "Oscuro", Moon],
                          ["system", "Sistema", Monitor],
                        ] as const
                      ).map(([value, label, Icon]) => (
                        <button
                          key={value}
                          aria-pressed={theme === value}
                          className={theme === value ? "chosen" : ""}
                          onClick={() => setTheme(value)}
                        >
                          <span className={"theme-preview " + value}>
                            <i />
                            <i />
                            <i />
                          </span>
                          <span>
                            <Icon size={16} />
                            {label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <SidebarAppearance
                    value={sidebarColor}
                    onChange={setSidebarColor}
                  />
                  <NavigationAppearance
                    value={navigationLayout}
                    onChange={setNavigationLayout}
                  />
                  <section className="panel settings">
                    <h2>Conexión y respaldos</h2>
                    <p>
                      Almacenamiento:{" "}
                      <b>
                        {mode === "firebase"
                          ? "Firebase Firestore"
                          : "Este equipo · archivos locales"}
                      </b>
                    </p>
                    <p>Moneda: CLP · Empresa: VGM</p>
                    <button
                      hidden={user.role !== "admin"}
                      onClick={() =>
                        run(async (operation) => {
                          operation.step("Cargando información del respaldo");
                          const data = await api("data");
                          operation.step("Generando respaldo JSON");
                          download(
                            new Blob(
                              [
                                JSON.stringify(
                                  {
                                    exportedAt: new Date().toISOString(),
                                    ...data,
                                    customers: savedCustomers,
                                  },
                                  null,
                                  2,
                                ),
                              ],
                              { type: "application/json" },
                            ),
                            "respaldo-vgm-" +
                              new Date().toISOString().slice(0, 10) +
                              ".json",
                          );
                        }, "Respaldo descargado")
                      }
                    >
                      <Download size={17} />
                      Descargar respaldo de documentos, clientes y catálogo
                    </button>
                    {user.role === "admin" && (
                      <button
                        className="spaced"
                        onClick={downloadCommercialBackup}
                      >
                        <Download size={17} />
                        Descargar operaciones y adjuntos (ZIP)
                      </button>
                    )}
                    <p className="hint">
                      Las cuentas de usuario se administran por separado. Los
                      documentos guardan su historial completo.
                    </p>
                  </section>
                  <section className="panel settings">
                    <h2>Acerca de VGM</h2>
                    <p>
                      Herramientas y soluciones para tu operación comercial.
                    </p>
                    <p>
                      Las facturas son registros internos. La emisión tributaria
                      electrónica requiere una integración adicional.
                    </p>
                    <p>
                      Para conectar Firebase, sigue los pasos del archivo
                      README.md del proyecto.
                    </p>
                  </section>
                </div>
              )}
              {page === "Mi perfil" && (
                <ProfilePanel
                  key={user.id}
                  profile={user}
                  busy={busy}
                  cloud={mode === "firebase"}
                  onSave={(p) =>
                    run(async (operation) => {
                      operation.step("Guardando perfil");
                      setUser(await api("me", p));
                    }, "Perfil actualizado")
                  }
                />
              )}
              {page === "Administración" && user.role === "admin" && (
                <Administration
                  module={adminModule}
                  onModuleChange={(module) => {
                    setBusinessFocus(null);
                    setAdminModule(module);
                  }}
                  renderBusiness={renderBusiness}
                  roles={
                    <RolesPanel users={users} onChanged={loadAdministration} />
                  }
                  productCount={products.filter((p) => !p.deleted).length}
                  products={
                    <ProductsPanel
                      products={products}
                      movements={stockMovements}
                      onRefresh={refresh}
                      onSaved={productSaved}
                    />
                  }
                  documents={documents}
                  busy={busy}
                  onOpen={setSelected}
                  onEdit={(d) => {
                    setSelected(d);
                    setEditing({ data: d, old: d });
                  }}
                  onNew={newDoc}
                  onRefresh={() => run(refresh, "Datos actualizados")}
                  onCommand={(cmd) =>
                    run((operation) => command(cmd, operation, false))
                  }
                  users={
                    <AdminPanel
                      roles={roles}
                      users={users.filter((u) => !u.deleted)}
                      onDelete={(u) =>
                        run(async (operation) => {
                          operation.step("Enviando usuario a la papelera");
                          await api("users/trash", { id: u.id, deleted: true });
                          setUsers(await api("users"));
                        }, "Usuario enviado a la papelera")
                      }
                      cloud={mode === "firebase"}
                      onEdit={(id, profile) =>
                        run(async (operation) => {
                          operation.step("Guardando cambios del usuario");
                          const updated = await api("users/edit", {
                            id,
                            profile,
                          });
                          setUsers(await api("users"));
                          if (id === user.id) {
                            setUser(await api("me"));
                          }
                        }, "Usuario actualizado")
                      }
                      current={user}
                      busy={busy}
                      onCreate={(data) =>
                        run(async (operation) => {
                          operation.step("Creando cuenta de usuario");
                          await api("users", data);
                          setUsers(await api("users"));
                        }, "Usuario creado")
                      }
                      onAccess={(u, role, active) =>
                        run(async (operation) => {
                          operation.step("Guardando permisos de acceso");
                          await api("users/access", { id: u.id, role, active });
                          setUsers(await api("users"));
                        }, "Acceso actualizado")
                      }
                    />
                  }
                />
              )}
              <footer>
                VGM · Herramientas y soluciones<span>Cada detalle cuenta.</span>
              </footer>
            </motion.div>
          </AnimatePresence>
        </main>
        <AnimatePresence mode="wait">
          {editing ? (
            <DocumentEditor
              key="editor"
              products={products}
              documents={documents}
              onProductSaved={productSaved}
              initial={editing.data}
              old={editing.old}
              customers={customers}
              busy={busy}
              onClose={() => setEditing(null)}
              onSave={saveDocument}
            />
          ) : selected ? (
            <DocumentDetail
              key={selected.id}
              doc={selected}
              documents={documents}
              onOpen={setSelected}
              events={events}
              onOpenBusiness={(record) => {
                setSelected(null);
                if (page === "Administraci\u00f3n") {
                  setAdminModule(
                    record.kind === "order"
                      ? "orders"
                      : record.kind === "job" ||
                          record.kind === "serviceDoc" ||
                          record.kind === "cost"
                        ? "jobs"
                        : "payments",
                  );
                } else
                  switchPage(
                    record.kind === "order"
                      ? "Órdenes de compra"
                      : record.kind === "job"
                        ? "Servicios"
                        : "Cobranza",
                  );
                setBusinessFocus(record.id);
              }}
              busy={busy}
              onClose={() => setSelected(null)}
              onEdit={() => setEditing({ data: selected, old: selected })}
              onDuplicate={() =>
                setEditing({
                  data: { ...selected, date: blank().date, due: blank().due },
                  old: null,
                })
              }
              onCommand={(cmd) => run((operation) => command(cmd, operation))}
              onExport={(format) =>
                run(
                  (operation) => exportDoc(selected, format, operation.step),
                  "Archivo " + format.toUpperCase() + " generado",
                )
              }
            />
          ) : null}
        </AnimatePresence>
        {Toasts}
      </div>
    </MotionConfig>
  );
}
