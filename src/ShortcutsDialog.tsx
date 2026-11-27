import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";

export interface ShortcutsDialogProps {
  onClose: () => void;
}

interface ShortcutEntry {
  id: string;
  label: string;
  keys: string[];
  altKeys?: string[];
  keywords?: string[];
}

interface ShortcutGroup {
  id: string;
  title: string;
  items: ShortcutEntry[];
}

/** Detects whether the UI is running on an Apple platform for keycap labels. */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const raw = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /mac|iphone|ipad|ipod/i.test(raw);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function buildShortcutGroups(mac: boolean): ShortcutGroup[] {
  const mod = mac ? "⌘" : "Ctrl";
  const shiftMod = mac ? "⌘⇧" : "Ctrl+⇧";
  return [
    {
      id: "general",
      title: "General y aplicación",
      items: [
        {
          id: "palette",
          label: "Abrir o cerrar Paleta de comandos",
          keys: [`${mod}K`],
          keywords: ["comandos", "buscar", "acciones"],
        },
        {
          id: "shortcuts",
          label: "Mostrar u ocultar esta guía de atajos",
          keys: ["?"],
          keywords: ["ayuda", "teclado", "cheatsheet"],
        },
        {
          id: "appearance",
          label: "Abrir Apariencia y colores",
          keys: [`${mod},`],
          keywords: ["tema", "grafo", "tributary"],
        },
        {
          id: "open-repo",
          label: "Abrir repositorio local",
          keys: [`${mod}O`],
          keywords: ["carpeta", "abrir"],
        },
        {
          id: "refresh",
          label: "Actualizar historial y referencias",
          keys: [`${mod}R`],
          keywords: ["recargar", "refrescar"],
        },
        {
          id: "escape",
          label: "Cerrar diálogos, menús o paleta activa",
          keys: ["Esc"],
          keywords: ["salir", "cancelar"],
        },
      ],
    },
    {
      id: "navigation",
      title: "Navegación y pestañas",
      items: [
        {
          id: "view-changes",
          label: "Ir a Cambios locales",
          keys: [`${mod}1`],
          keywords: ["cambios", "stage", "wip"],
        },
        {
          id: "view-history",
          label: "Ir a Historial y grafo",
          keys: [`${mod}2`],
          keywords: ["commits", "grafo"],
        },
        {
          id: "view-sync",
          label: "Ir a Sincronizar (Remotos, Pull y Push)",
          keys: [`${mod}3`],
          keywords: ["fetch", "pull", "push", "remotos"],
        },
        {
          id: "new-tab",
          label: "Abrir repositorio en nueva pestaña",
          keys: [`${mod}T`],
          keywords: ["pestaña", "tab"],
        },
        {
          id: "close-tab",
          label: "Cerrar pestaña actual",
          keys: [`${mod}W`],
          keywords: ["pestaña", "cerrar", "tab"],
        },
        {
          id: "cycle-tab",
          label: "Cambiar entre pestañas abiertas",
          keys: ["Ctrl+Tab"],
          altKeys: ["Ctrl+⇧Tab"],
          keywords: ["pestaña", "siguiente", "anterior"],
        },
      ],
    },
    {
      id: "history",
      title: "Historial y búsqueda",
      items: [
        {
          id: "search-local",
          label: "Buscar en commits cargados",
          keys: [`${mod}F`],
          keywords: ["filtrar", "mensaje", "autor"],
        },
        {
          id: "search-deep",
          label: "Búsqueda profunda en historial y código",
          keys: [`${shiftMod}F`],
          keywords: ["codigo", "simbolo", "todo el historial"],
        },
        {
          id: "navigate-commits",
          label: "Navegar commits en el grafo (Inicio / Fin en resultados)",
          keys: ["↑", "↓"],
          keywords: ["flechas", "mover", "subir", "bajar"],
        },
        {
          id: "compare-range",
          label: "Comparar rango entre commit seleccionado y otro commit",
          keys: ["Shift+Clic"],
          keywords: ["diff", "rango", "comparar"],
        },
      ],
    },
    {
      id: "changes",
      title: "Cambios y seguridad",
      items: [
        {
          id: "commit",
          label: "Confirmar commit desde resumen o descripción",
          keys: [`${mod}Enter`],
          keywords: ["commit", "guardar"],
        },
        {
          id: "undo",
          label: "Deshacer última operación local (con vista previa)",
          keys: [`${mod}Z`],
          keywords: ["undo", "revertir"],
        },
        {
          id: "redo",
          label: "Rehacer operación local (con vista previa)",
          keys: [`${shiftMod}Z`],
          altKeys: [`${mod}Y`],
          keywords: ["redo", "rehacer"],
        },
      ],
    },
  ];
}

export default function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const mac = useMemo(() => isMacPlatform(), []);
  const groups = useMemo(() => buildShortcutGroups(mac), [mac]);

  useEffect(() => {
    const el = dialogRef.current;
    const previous = document.activeElement;
    el?.showModal?.();
    inputRef.current?.focus();
    return () => {
      el?.close?.();
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  const filteredGroups = useMemo(() => {
    const q = normalizeText(query.trim());
    if (!q) return groups;
    const terms = q.split(/\s+/).filter(Boolean);
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const haystack = normalizeText(
            [
              group.title,
              item.label,
              ...item.keys,
              ...(item.altKeys ?? []),
              ...(item.keywords ?? []),
            ].join(" "),
          );
          return terms.every((term) => haystack.includes(term));
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog shortcuts-dialog"
      aria-labelledby="shortcuts-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <header className="env-dialog-head">
        <div>
          <span className="trust-dialog-eyebrow">ATAJOS DE TECLADO</span>
          <h2 id="shortcuts-dialog-title">Atajos de teclado</h2>
          <p className="worktree-dialog-sub">
            Referencia rápida de navegación, búsqueda y seguridad local en
            RavenGit.
          </p>
        </div>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Cerrar atajos de teclado"
        >
          ×
        </button>
      </header>

      <div className="shortcuts-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          aria-label="Filtrar atajos"
          placeholder="Filtrar por acción o tecla…"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            className="button"
            onClick={() => setQuery("")}
            aria-label="Limpiar filtro de atajos"
          >
            Limpiar
          </button>
        )}
      </div>

      <div className="shortcuts-grid">
        {filteredGroups.length > 0 ? (
          filteredGroups.map((group) => (
            <section
              key={group.id}
              className="shortcuts-group"
              aria-label={group.title}
            >
              <h3>{group.title}</h3>
              <ul className="shortcuts-list">
                {group.items.map((item) => (
                  <li key={item.id} className="shortcut-row">
                    <span className="shortcut-label">{item.label}</span>
                    <span className="shortcut-keys">
                      {item.keys.map((keyLabel) => (
                        <kbd key={keyLabel}>{keyLabel}</kbd>
                      ))}
                      {item.altKeys && item.altKeys.length > 0 && (
                        <>
                          <span className="shortcut-or" aria-hidden="true">
                            /
                          </span>
                          {item.altKeys.map((keyLabel) => (
                            <kbd key={keyLabel}>{keyLabel}</kbd>
                          ))}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <p className="shortcuts-empty">
            No se encontraron atajos para «{query}».
          </p>
        )}
      </div>

      <footer className="shortcuts-footer">
        <span>
          Pulsa <kbd>?</kbd> fuera de campos de texto para abrir o cerrar esta
          guía.
        </span>
        <button type="button" className="button primary" onClick={onClose}>
          Cerrar
        </button>
      </footer>
    </dialog>
  );
}
