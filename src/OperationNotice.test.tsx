// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OperationNotice, { type OperationResult } from "./OperationNotice";
afterEach(cleanup);
const result: OperationResult = {
  id: "one",
  status: "confirmed",
  title: "Push completado",
  repository: "Proyecto",
  path: "/fixture/proyecto",
  destination: "main → origin/main",
  message: "Commit verificado en destino.",
};
it("anuncia éxito con contexto, conserva el foco y permite cerrar el aviso", async () => {
  const onClose = vi.fn();
  const button = document.createElement("button");
  document.body.append(button);
  button.focus();
  render(<OperationNotice result={result} onClose={onClose} />);
  expect(screen.getByRole("status").textContent).toContain(
    "Proyecto · main → origin/main",
  );
  expect(document.activeElement).toBe(button);
  await userEvent.click(
    screen.getByRole("button", { name: "Cerrar resultado de operación" }),
  );
  expect(onClose).toHaveBeenCalledOnce();
  button.remove();
});
it("mantiene advertencias como alerta sin presentarlas como fallo de publicación", () => {
  render(
    <OperationNotice
      result={{
        ...result,
        status: "warning",
        warning: "No se pudo actualizar la vista",
      }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("alert").textContent).toContain("Push completado");
  expect(screen.getByRole("alert").textContent).toContain(
    "No se pudo actualizar",
  );
});
it("el progreso no puede descartarse mientras la operación sigue pendiente", () => {
  render(
    <OperationNotice
      result={{ ...result, status: "progress", title: "Push en curso" }}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("status")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});
