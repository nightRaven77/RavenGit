import { expect, it } from "vitest";
import { authorIdentity } from "./AuthorAvatar";

it("usa el primer y último nombre y admite nombres simples y vacíos", () => {
  expect(authorIdentity("Erick Mejia").initials).toBe("EM");
  expect(authorIdentity("  María del Carmen López ").initials).toBe("ML");
  expect(authorIdentity("Raven").initials).toBe("RA");
  expect(authorIdentity("").initials).toBe("?");
});
it("conserva el color al normalizar espacios, mayúsculas y Unicode", () => {
  expect(authorIdentity(" Erick   Mejia ").background).toBe(
    authorIdentity("erick mejia").background,
  );
  expect(authorIdentity("Jose\u0301 Pérez")).toEqual(
    authorIdentity("José Pérez"),
  );
});
