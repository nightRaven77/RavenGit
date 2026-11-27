import { useEffect, useMemo, useRef, useState } from "react";
import { isMacPlatform } from "./ShortcutsDialog";

export interface QuickGuideDialogProps {
  onClose: () => void;
  onOpenShortcuts?: () => void;
  initialStep?: number;
}

interface QuickGuideStep {
  id: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  description: string;
  points: readonly string[];
  shortcuts: readonly { label: string; keys: string }[];
}

function buildSteps(mac: boolean): QuickGuideStep[] {
  const mod = mac ? "⌘" : "Ctrl";
  const shiftMod = mac ? "⌘⇧" : "Ctrl+⇧";
  return [
    {
      id: "local-first",
      shortLabel: "1. Espacio local",
      title: "Espacio local y autorización",
      subtitle: "Arquitectura 100 % local-first y puerta de confianza",
      description:
        "RavenGit opera directamente sobre tus carpetas locales con Rust (gix + Git CLI), sin telemetría ni tráfico de red automático.",
      points: [
        "Abre un repositorio existente, crea uno nuevo o clona desde la barra lateral o Repositorios ▾.",
        "Las carpetas nuevas inician en modo seguro (solo lectura) para inspeccionar el historial sin riesgos.",
        "Pulsa «Solo lectura · Autorizar…» en la barra de estado inferior cuando quieras habilitar escrituras.",
      ],
      shortcuts: [
        { label: "Abrir repositorio", keys: `${mod}O` },
        { label: "Actualizar vista", keys: `${mod}R` },
      ],
    },
    {
      id: "graph-tabs",
      shortLabel: "2. Grafo y pestañas",
      title: "Grafo Tributary y pestañas",
      subtitle: "Historial visual claro y múltiples repositorios en paralelo",
      description:
        "Navega ramas y commits con el grafo Tributary por defecto (o cambia al modo Compacto desde Apariencia).",
      points: [
        "Columna «Rama / Tag» redimensionable (120–280 px), avatares de autor, iconos duales local/remoto y grupos Hoy / Esta semana / Anterior.",
        "La fila «Cambios sin commitear (WIP)» conecta en tiempo real con HEAD; usa Shift+Clic entre dos commits para comparar un rango.",
        "Mantén hasta 12 pestañas abiertas con sesiones independientes y bloqueos aislados.",
      ],
      shortcuts: [
        { label: "Ir a Historial", keys: `${mod}2` },
        { label: "Nueva / cerrar pestaña", keys: `${mod}T / ${mod}W` },
        { label: "Búsqueda profunda", keys: `${shiftMod}F` },
      ],
    },
    {
      id: "changes-commits",
      shortLabel: "3. Cambios y diffs",
      title: "Cambios, diffs y commits",
      subtitle: "Preparación granular, diff visual de imágenes y Stash",
      description:
        "Revisa exactamente qué cambió en el panel Cambios antes de guardar en Git o apartar modificaciones temporales.",
      points: [
        "Prepara o descarta por archivo completo, bloque (hunk) o línea individual en transacciones atómicas.",
        "Inspecciona diferencias de texto en modo Unificado o Dividido, y compara imágenes lado a lado, con cortina o superposición.",
        "Usa Amend con respaldo automático o guarda borradores en Stash conservando su entrada.",
      ],
      shortcuts: [
        { label: "Ir a Cambios", keys: `${mod}1` },
        { label: "Confirmar commit", keys: `${mod}Enter` },
      ],
    },
    {
      id: "sync-forges",
      shortLabel: "4. Sincronización",
      title: "Sincronizar y PRs / MRs opt-in",
      subtitle: "Remotos bajo control y consulta opcional en GitHub o GitLab",
      description:
        "Cada operación de red ocurre únicamente cuando la solicitas y tras revisar remoto, rama y commits.",
      points: [
        "Desde Sincronizar puedes confirmar Fetch por remoto, Pull con revisión de upstream y Publicar (Push) con vista previa.",
        "La detección del remoto en Pull Requests / MRs es 100 % offline; la consulta remota es opcional usando tu CLI local gh o glab.",
        "Al consultar, las ramas con PR/MR abierto muestran un badge #N directamente en el grafo.",
      ],
      shortcuts: [{ label: "Ir a Sincronizar", keys: `${mod}3` }],
    },
    {
      id: "safety",
      shortLabel: "5. Seguridad 2.0",
      title: "Seguridad 2.0 y recuperación",
      subtitle: "Snapshots locales, Undo/Redo y conflictos a 3 vías",
      description:
        "Trabaja con respaldo continuo frente a errores locales, descartes o integraciones complejas.",
      points: [
        "Snapshots locales manuales y automáticos con retención y límite de disco configurables desde Herramientas.",
        "Undo / Redo muestra siempre la vista previa exacta del plan antes de revertir o rehacer operaciones locales.",
        "Resuelve conflictos con el editor a 3 vías (Base, Local, Entrante) o recupera respaldos previos en Herramientas.",
      ],
      shortcuts: [
        { label: "Deshacer local", keys: `${mod}Z` },
        { label: "Rehacer local", keys: `${shiftMod}Z` },
      ],
    },
    {
      id: "modes-shortcuts",
      shortLabel: "6. Modos y atajos",
      title: "Modo Simple, apariencia y atajos",
      subtitle: "Adapta la interfaz a tu ritmo y domina el teclado",
      description:
        "Alterna en un clic entre Modo Simple y Modo Completo y personaliza colores y comandos a tu gusto.",
      points: [
        "El botón Simple / Completo en la barra superior simplifica herramientas avanzadas para enfocarte en lo esencial.",
        "Personaliza entre 7 temas (incluido Ártico claro y Alto Contraste) y 5 paletas de grafo.",
        "Abre la Paleta de comandos para saltar a cualquier acción o pulsa ? para consultar todos los atajos.",
      ],
      shortcuts: [
        { label: "Paleta de comandos", keys: `${mod}K` },
        { label: "Apariencia y colores", keys: `${mod},` },
        { label: "Guía de atajos", keys: "?" },
      ],
    },
  ];
}

export default function QuickGuideDialog({
  onClose,
  onOpenShortcuts,
  initialStep = 0,
}: QuickGuideDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mac = useMemo(() => isMacPlatform(), []);
  const steps = useMemo(() => buildSteps(mac), [mac]);
  const [step, setStep] = useState(() =>
    Math.min(Math.max(0, initialStep), steps.length - 1),
  );

  useEffect(() => {
    const el = dialogRef.current;
    const previous = document.activeElement;
    el?.showModal?.();
    return () => {
      el?.close?.();
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  const current = steps[step];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const progressPercent = Math.round(((step + 1) / steps.length) * 100);

  return (
    <dialog
      ref={dialogRef}
      className="operation-dialog quick-guide-dialog"
      aria-labelledby="quick-guide-title"
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
          <span className="trust-dialog-eyebrow">
            GUÍA RÁPIDA · PASO {step + 1} DE {steps.length}
          </span>
          <h2 id="quick-guide-title">Guía rápida de RavenGit</h2>
        </div>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Cerrar guía rápida"
        >
          ×
        </button>
      </header>

      <div
        className="quick-guide-progress"
        role="progressbar"
        aria-label="Progreso de la guía rápida"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={step + 1}
      >
        <div
          className="quick-guide-progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <nav className="quick-guide-steps" aria-label="Pasos de la guía rápida">
        {steps.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`quick-guide-step-pill${index === step ? " active" : ""}`}
            aria-current={index === step ? "step" : undefined}
            onClick={() => setStep(index)}
          >
            {item.shortLabel}
          </button>
        ))}
      </nav>

      <section className="quick-guide-card" aria-label={current.title}>
        <h3>{current.title}</h3>
        <p className="quick-guide-subtitle">{current.subtitle}</p>
        <p className="quick-guide-description">{current.description}</p>
        <ul className="quick-guide-points">
          {current.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        {current.shortcuts.length > 0 && (
          <div className="quick-guide-tips">
            {current.shortcuts.map((item) => (
              <span key={item.label} className="quick-guide-tip">
                <span>{item.label}:</span>
                <kbd>{item.keys}</kbd>
              </span>
            ))}
          </div>
        )}
      </section>

      <footer className="quick-guide-footer">
        <div className="quick-guide-footer-left">
          {onOpenShortcuts && (
            <button type="button" className="button" onClick={onOpenShortcuts}>
              Ver atajos (?)
            </button>
          )}
        </div>
        <div className="quick-guide-nav">
          <button
            type="button"
            className="button"
            disabled={isFirst}
            onClick={() =>
              setStep((currentStep) => Math.max(0, currentStep - 1))
            }
          >
            Anterior
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              if (isLast) onClose();
              else
                setStep((currentStep) =>
                  Math.min(steps.length - 1, currentStep + 1),
                );
            }}
          >
            {isLast ? "Finalizar" : "Siguiente"}
          </button>
        </div>
      </footer>
    </dialog>
  );
}
