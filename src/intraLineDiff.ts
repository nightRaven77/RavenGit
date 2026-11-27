import {
  tokenizeLine,
  type SyntaxLanguage,
  type SyntaxTokenType,
} from "./syntaxHighlight";

export interface InlineSegment {
  text: string;
  changed: boolean;
}

export interface StyledSpan {
  text: string;
  syntax: SyntaxTokenType;
  changed: boolean;
}

function tokenizeInline(line: string): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (/\s/.test(ch)) {
      let end = i + 1;
      while (end < line.length && /\s/.test(line[end])) end++;
      parts.push(line.slice(i, end));
      i = end;
    } else if (/[\w$\u00C0-\u024F]/.test(ch)) {
      let end = i + 1;
      while (end < line.length && /[\w$\u00C0-\u024F]/.test(line[end])) end++;
      parts.push(line.slice(i, end));
      i = end;
    } else {
      parts.push(ch);
      i++;
    }
  }
  return parts;
}

function coalesce(segments: InlineSegment[]): InlineSegment[] {
  const result: InlineSegment[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const prev = result[result.length - 1];
    if (prev && prev.changed === segment.changed) {
      prev.text += segment.text;
    } else {
      result.push({ ...segment });
    }
  }
  return result;
}

function lcsMatches(a: string[], b: string[]): Array<[number, number]> {
  const m = a.length;
  const n = b.length;
  const dp = new Int32Array((m + 1) * (n + 1));
  const cols = n + 1;
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i * cols + j] = dp[(i + 1) * cols + (j + 1)] + 1;
      } else {
        const down = dp[(i + 1) * cols + j];
        const right = dp[i * cols + (j + 1)];
        dp[i * cols + j] = down >= right ? down : right;
      }
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[(i + 1) * cols + j] >= dp[i * cols + (j + 1)]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

function countNonWs(segments: InlineSegment[], onlyUnchanged: boolean): number {
  let count = 0;
  for (const seg of segments) {
    if (onlyUnchanged && seg.changed) continue;
    for (let i = 0; i < seg.text.length; i++) {
      if (!/\s/.test(seg.text[i])) count++;
    }
  }
  return count;
}

export function diffInline(
  before: string,
  after: string,
): { before: InlineSegment[]; after: InlineSegment[] } {
  if (!before || !after || before === after) {
    return {
      before: before ? [{ text: before, changed: false }] : [],
      after: after ? [{ text: after, changed: false }] : [],
    };
  }
  if (before.length > 1000 || after.length > 1000) {
    return {
      before: [{ text: before, changed: false }],
      after: [{ text: after, changed: false }],
    };
  }

  const a = tokenizeInline(before);
  const b = tokenizeInline(after);

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);

  const beforeSegments: InlineSegment[] = [];
  const afterSegments: InlineSegment[] = [];

  for (let i = 0; i < prefix; i++) {
    beforeSegments.push({ text: a[i], changed: false });
    afterSegments.push({ text: b[i], changed: false });
  }

  if (
    midA.length * midB.length <= 10_000 &&
    midA.length > 0 &&
    midB.length > 0
  ) {
    const matches = lcsMatches(midA, midB);
    let ia = 0;
    let ib = 0;
    for (const [ma, mb] of matches) {
      while (ia < ma) {
        beforeSegments.push({ text: midA[ia++], changed: true });
      }
      while (ib < mb) {
        afterSegments.push({ text: midB[ib++], changed: true });
      }
      beforeSegments.push({ text: midA[ia++], changed: false });
      afterSegments.push({ text: midB[ib++], changed: false });
    }
    while (ia < midA.length) {
      beforeSegments.push({ text: midA[ia++], changed: true });
    }
    while (ib < midB.length) {
      afterSegments.push({ text: midB[ib++], changed: true });
    }
  } else {
    for (const tok of midA) beforeSegments.push({ text: tok, changed: true });
    for (const tok of midB) afterSegments.push({ text: tok, changed: true });
  }

  for (let i = suffix; i > 0; i--) {
    beforeSegments.push({ text: a[a.length - i], changed: false });
    afterSegments.push({ text: b[b.length - i], changed: false });
  }

  const resBefore = coalesce(beforeSegments);
  const resAfter = coalesce(afterSegments);

  const unchangedChars = countNonWs(resBefore, true);
  const totalNonWs = countNonWs(resBefore, false) + countNonWs(resAfter, false);
  if (
    unchangedChars < 3 ||
    (totalNonWs > 0 && (unchangedChars * 2) / totalNonWs < 0.15)
  ) {
    return {
      before: [{ text: before, changed: false }],
      after: [{ text: after, changed: false }],
    };
  }

  return { before: resBefore, after: resAfter };
}

export function mergeHighlights(
  text: string,
  lang: SyntaxLanguage,
  inline?: InlineSegment[],
): StyledSpan[] {
  if (!text) return [];
  const syntaxTokens = tokenizeLine(text, lang);
  if (!inline || inline.length === 0) {
    return syntaxTokens.map((t) => ({
      text: t.text,
      syntax: t.type,
      changed: false,
    }));
  }

  const out: StyledSpan[] = [];
  let si = 0;
  let sOff = 0;
  let ii = 0;
  let iOff = 0;

  while (si < syntaxTokens.length && ii < inline.length) {
    const sTok = syntaxTokens[si];
    const iTok = inline[ii];
    const sRem = sTok.text.length - sOff;
    const iRem = iTok.text.length - iOff;
    const take = Math.min(sRem, iRem);
    const slice = sTok.text.slice(sOff, sOff + take);
    if (slice) {
      const prev = out[out.length - 1];
      if (prev && prev.syntax === sTok.type && prev.changed === iTok.changed) {
        prev.text += slice;
      } else {
        out.push({
          text: slice,
          syntax: sTok.type,
          changed: iTok.changed,
        });
      }
    }
    sOff += take;
    iOff += take;
    if (sOff >= sTok.text.length) {
      si++;
      sOff = 0;
    }
    if (iOff >= iTok.text.length) {
      ii++;
      iOff = 0;
    }
  }

  return out;
}
