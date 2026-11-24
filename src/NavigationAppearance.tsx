import { useEffect, useState } from "react";
import { Check, PanelLeft, PanelLeftClose, PanelTop } from "lucide-react";

const layouts = [
  [
    "sidebar",
    "Barra lateral",
    "Menú completo con iconos y nombres.",
    PanelLeft,
  ],
  [
    "compact",
    "Solo iconos",
    "Más espacio para trabajar, con el menú a mano.",
    PanelLeftClose,
  ],
  [
    "top",
    "Barra superior",
    "Navegación horizontal en la parte superior.",
    PanelTop,
  ],
] as const;
export type NavigationLayout = (typeof layouts)[number][0];

export function useNavigationLayout() {
  const [layout, setLayout] = useState<NavigationLayout>(() => {
    const saved = localStorage.getItem("vgm-navigation-layout");
    return layouts.find(([id]) => id === saved)?.[0] ?? "sidebar";
  });
  useEffect(() => {
    localStorage.setItem("vgm-navigation-layout", layout);
  }, [layout]);
  return [layout, setLayout] as const;
}

export function NavigationAppearance({
  value,
  onChange,
}: {
  value: NavigationLayout;
  onChange: (layout: NavigationLayout) => void;
}) {
  return (
    <section className="panel settings">
      <h2>Distribución del menú</h2>
      <p>
        Elige dónde y cómo ver la navegación. El cambio se aplica al instante.
      </p>
      <div className="navigation-options">
        {layouts.map(([id, label, description, Icon]) => (
          <button
            key={id}
            aria-pressed={value === id}
            className={value === id ? "chosen" : ""}
            onClick={() => onChange(id)}
          >
            <Icon size={26} aria-hidden="true" />
            <strong>{label}</strong>
            <span>{description}</span>
            {value === id && (
              <Check className="layout-check" size={17} aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      <p className="hint">
        Se guarda automáticamente en este navegador. En celulares se usa el menú
        lateral con botón hamburguesa.
      </p>
    </section>
  );
}
