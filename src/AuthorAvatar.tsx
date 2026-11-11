const backgrounds = [
  "#193b52",
  "#32325d",
  "#493047",
  "#24483f",
  "#4b3b27",
  "#263f5e",
];

export function authorIdentity(name: string) {
  const normalized = name.trim().normalize("NFC").replace(/\s+/gu, " ");
  const words = normalized.split(" ").filter(Boolean);
  const initials =
    words.length > 1
      ? `${Array.from(words[0])[0]}${Array.from(words[words.length - 1])[0]}`
      : Array.from(words[0] ?? "?")
          .slice(0, 2)
          .join("");
  let hash = 0;
  for (const character of normalized.toLocaleLowerCase("es"))
    hash = (Math.imul(hash, 31) + character.codePointAt(0)!) >>> 0;
  return {
    initials: initials.toLocaleUpperCase("es"),
    background: backgrounds[hash % backgrounds.length],
  };
}

export default function AuthorAvatar({ name }: { name: string }) {
  const identity = authorIdentity(name);
  return (
    <span
      className="author-avatar"
      aria-hidden="true"
      style={{ backgroundColor: identity.background }}
    >
      {identity.initials}
    </span>
  );
}
