import { useEffect, useState } from "react";
import { Check } from "lucide-react";
export const sidebarColors = [
  ["black", "Negro", "#292a27"],
  ["blue", "Azul", "#1e4d92"],
  ["red", "Rojo", "#9f2938"],
  ["yellow", "Amarillo", "#e9ad06"],
  ["green", "Verde", "#236747"],
  ["purple", "Morado", "#684090"],
  ["white", "Blanco", "#ffffff"],
  ["sky", "Celeste", "#9bd9ed"],
  ["teal", "Turquesa", "#14787b"],
  ["orange", "Naranja", "#ed9a51"],
  ["pink", "Rosado", "#ecc0d5"],
  ["slate", "Gris", "#526174"],
] as const;
export function useSidebarColor() {
  const [color, setColor] = useState(() => {
    const saved = localStorage.getItem("vgm-sidebar-color");
    return sidebarColors.some((c) => c[0] === saved) ? saved! : "black";
  });
  useEffect(() => {
    document.documentElement.dataset.sidebar = color;
    localStorage.setItem("vgm-sidebar-color", color);
  }, [color]);
  return [color, setColor] as const;
}
export function SidebarAppearance({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <section className="panel settings">
      <h2>Color del menú</h2>
      <p>
        Personaliza la barra lateral. El texto y la selección se adaptan para
        mantener la lectura en modo claro y oscuro.
      </p>
      <div className="sidebar-colors">
        {sidebarColors.map(([id, label, color]) => (
          <button
            key={id}
            aria-pressed={value === id}
            className={value === id ? "chosen" : ""}
            onClick={() => onChange(id)}
          >
            <span className="color-swatch" style={{ backgroundColor: color }} />
            {label}
            {value === id && <Check size={16} />}
          </button>
        ))}
      </div>
      <p className="hint">
        Se guarda automáticamente en este navegador. Puedes combinar cualquier
        color con Claro, Oscuro o Sistema.
      </p>
    </section>
  );
}
