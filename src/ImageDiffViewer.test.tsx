// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImageDiffViewer, { isImageAssetPath } from "./ImageDiffViewer";
import type { ImageDiff } from "./types";

afterEach(() => {
  cleanup();
});

const SAMPLE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const SAMPLE_PNG_2 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("ImageDiffViewer", () => {
  it("detecta extensiones de imagen soportadas sin falsos positivos", () => {
    expect(isImageAssetPath("assets/logo.png")).toBe(true);
    expect(isImageAssetPath("HERO.JPEG")).toBe(true);
    expect(isImageAssetPath("pic.webp")).toBe(true);
    expect(isImageAssetPath("anim.gif")).toBe(true);
    expect(isImageAssetPath("icons/brand.svg")).toBe(true);
    expect(isImageAssetPath("src/App.tsx")).toBe(false);
    expect(isImageAssetPath("archive.png.bak")).toBe(false);
    expect(isImageAssetPath(null)).toBe(false);
  });

  it("permite cambiar entre Lado a lado, Cortina, Onion-skin y Pixel-diff", async () => {
    const diff: ImageDiff = {
      path: "assets/logo.png",
      oldPath: null,
      mime: "image/png",
      before: {
        label: "Padre abc1234",
        dataUrl: SAMPLE_PNG,
        mime: "image/png",
        bytes: 1024,
        isLfsPointer: false,
        tooLarge: false,
      },
      after: {
        label: "Commit def5678",
        dataUrl: SAMPLE_PNG_2,
        mime: "image/png",
        bytes: 1536,
        isLfsPointer: false,
        tooLarge: false,
      },
    };
    const onToggleText = vi.fn();

    render(<ImageDiffViewer diff={diff} onToggleText={onToggleText} />);

    expect(screen.getByText(/1\.0 KiB → 1\.5 KiB \(\+50%\)/)).toBeTruthy();
    expect(screen.getByAltText("Padre abc1234")).toBeTruthy();
    expect(screen.getByAltText("Commit def5678")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Cortina" }));
    const swipeSlider = screen.getByLabelText("Posición de cortina");
    fireEvent.change(swipeSlider, { target: { value: "70" } });
    expect(screen.getByText("Cortina: 70%")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Onion-skin" }));
    const onionSlider = screen.getByLabelText("Opacidad de capa nueva");
    fireEvent.change(onionSlider, { target: { value: "25" } });
    expect(screen.getByText("Opacidad nueva: 25%")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Pixel-diff" }));
    expect(
      screen.getByText(/Diferencia visual de píxeles|Píxeles modificados/),
    ).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "Ver diff de texto" }),
    );
    expect(onToggleText).toHaveBeenCalledTimes(1);
  });

  it("maneja imagen agregada, puntero LFS, archivo > 2 MiB y SVG seguro vía img", () => {
    const svgUrl = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
    const diffAdded: ImageDiff = {
      path: "icons/brand.svg",
      oldPath: null,
      mime: "image/svg+xml",
      before: null,
      after: {
        label: "Commit 1234567",
        dataUrl: svgUrl,
        mime: "image/svg+xml",
        bytes: 12,
        isLfsPointer: false,
        tooLarge: false,
      },
    };
    const { rerender } = render(<ImageDiffViewer diff={diffAdded} />);
    expect(
      (screen.getByRole("button", { name: "Cortina" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    const svgImg = screen.getByAltText("Commit 1234567") as HTMLImageElement;
    expect(svgImg.src).toBe(svgUrl);

    rerender(
      <ImageDiffViewer
        diff={{
          path: "textures/bg.webp",
          oldPath: null,
          mime: "image/webp",
          before: {
            label: "Índice",
            dataUrl: null,
            mime: "image/webp",
            bytes: 120,
            isLfsPointer: true,
            tooLarge: false,
          },
          after: {
            label: "Árbol de trabajo",
            dataUrl: null,
            mime: "image/webp",
            bytes: 3 * 1024 * 1024,
            isLfsPointer: false,
            tooLarge: true,
          },
        }}
      />,
    );
    expect(screen.getByText(/Puntero Git LFS detectado/)).toBeTruthy();
    expect(screen.getByText(/supera el límite de 2 MiB/)).toBeTruthy();
  });
});
