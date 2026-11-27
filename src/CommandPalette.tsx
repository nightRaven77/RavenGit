import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";

export interface PaletteCommand {
  id: string;
  label: string;
  category: string;
  description?: string;
  shortcut?: string;
  keywords?: string[];
  disabled?: boolean;
  onSelect: () => void;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export default function CommandPalette({
  commands,
  onClose,
}: {
  commands: PaletteCommand[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = normalizeText(query.trim());
    if (!q) return commands;
    const terms = q.split(/\s+/).filter(Boolean);
    return commands.filter((cmd) => {
      const haystack = normalizeText(
        [
          cmd.label,
          cmd.category,
          cmd.description ?? "",
          ...(cmd.keywords ?? []),
        ].join(" "),
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [commands, query]);

  useEffect(() => {
    const el = dialogRef.current;
    const previous = document.activeElement;
    el?.showModal();
    inputRef.current?.focus();
    return () => {
      el?.close();
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  useEffect(() => {
    const firstEnabled = filtered.findIndex((cmd) => !cmd.disabled);
    setActiveIndex(firstEnabled >= 0 ? firstEnabled : 0);
  }, [query, filtered.length]);

  function moveActive(delta: number) {
    if (!filtered.length) return;
    let idx = activeIndex;
    for (let step = 0; step < filtered.length; step++) {
      idx = (idx + delta + filtered.length) % filtered.length;
      if (!filtered[idx].disabled) {
        setActiveIndex(idx);
        return;
      }
    }
  }

  function runCommand(cmd: PaletteCommand | undefined) {
    if (!cmd || cmd.disabled) return;
    onClose();
    cmd.onSelect();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter") {
      const chosen =
        filtered[activeIndex] && !filtered[activeIndex].disabled
          ? filtered[activeIndex]
          : filtered.find((cmd) => !cmd.disabled);
      if (chosen) {
        event.preventDefault();
        runCommand(chosen);
      }
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog command-palette"
      aria-label="Paleta de comandos"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="palette-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <label className="sr-only" htmlFor="command-palette-input">
          Buscar comando
        </label>
        <input
          ref={inputRef}
          id="command-palette-input"
          type="text"
          value={query}
          placeholder="Escribe una acción, vista o herramienta…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="button"
          onClick={onClose}
          aria-label="Cerrar paleta de comandos"
        >
          Esc
        </button>
      </div>
      <div
        className="palette-list"
        role="listbox"
        aria-label="Comandos disponibles"
      >
        {filtered.length > 0 ? (
          filtered.map((cmd, idx) => (
            <button
              key={cmd.id}
              type="button"
              role="option"
              aria-selected={idx === activeIndex}
              className={`palette-item${idx === activeIndex ? " active" : ""}`}
              disabled={cmd.disabled}
              onMouseEnter={() => {
                if (!cmd.disabled) setActiveIndex(idx);
              }}
              onClick={() => runCommand(cmd)}
            >
              <span className="palette-category">{cmd.category}</span>
              <span className="palette-main">
                <strong>{cmd.label}</strong>
                {cmd.description && <small>{cmd.description}</small>}
              </span>
              {cmd.shortcut && <kbd>{cmd.shortcut}</kbd>}
            </button>
          ))
        ) : (
          <p className="palette-empty">
            No se encontraron comandos para «{query}».
          </p>
        )}
      </div>
    </dialog>
  );
}
