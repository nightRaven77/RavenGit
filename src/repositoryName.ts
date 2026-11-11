export function suggestedRepositoryName(source: string): string {
  const value = source.trim();
  let path = "";
  if (value.includes("://")) {
    try {
      path = new URL(value).pathname;
    } catch {
      return "";
    }
  } else if (/^(?:[a-z]:[\\/]|\/|\\\\)/i.test(value))
    path = value.replace(/\\/g, "/");
  else {
    const match = /^[^/\\\s:]+:(.+)$/.exec(value);
    if (!match) return "";
    path = match[1];
  }
  let name = path.replace(/\/+$/, "").split("/").pop() ?? "";
  try {
    name = decodeURIComponent(name);
  } catch {
    return "";
  }
  name = name
    .replace(/\.git$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-")
    .trim()
    .replace(/[. ]+$/, "");
  if (!name || name === "." || name === "..") return "";
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    name = `_${name}`;
  name = Array.from(name).slice(0, 100).join("");
  while (new TextEncoder().encode(name).length > 255)
    name = Array.from(name).slice(0, -1).join("");
  return name.replace(/[. ]+$/, "");
}
