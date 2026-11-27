import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function baseProps(className: string, props: IconProps): IconProps {
  return {
    viewBox: "0 0 16 16",
    width: 15,
    height: 15,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.55,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
    className: props.className
      ? `anim-icon ${className} ${props.className}`
      : `anim-icon ${className}`,
  };
}

export function AnimFetchIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-fetch", props)}>
      <path d="M3 10.5v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2" />
      <g className="anim-arrow-down">
        <path d="M8 2.5v7" />
        <path d="M5.5 7 8 9.5 10.5 7" />
      </g>
    </svg>
  );
}

export function AnimPullIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-pull", props)}>
      <path d="M3.25 13h9.5" />
      <g className="anim-arrow-down">
        <path d="M8 2.5v7.5" />
        <path d="M5 7l3 3 3-3" />
      </g>
    </svg>
  );
}

export function AnimPushIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-push", props)}>
      <path d="M3.25 13h9.5" />
      <g className="anim-arrow-up">
        <path d="M8 10V2.5" />
        <path d="M5 5.5 8 2.5l3 3" />
      </g>
    </svg>
  );
}

export function AnimBranchIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-branch", props)}>
      <circle cx="4.5" cy="3.5" r="1.5" />
      <circle cx="4.5" cy="12.5" r="1.5" />
      <circle className="anim-node-pop" cx="11.5" cy="5.5" r="1.5" />
      <path d="M4.5 5v6" />
      <path d="M11.5 7c0 2.5-2.5 3-7 3" />
    </svg>
  );
}

export function AnimStashIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-stash", props)}>
      <path className="anim-lid" d="M2 4.25h12v2.25H2z" />
      <path d="M3 6.5v6.25a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.5" />
      <path d="M6.25 9.5h3.5" />
    </svg>
  );
}

export function AnimSearchIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-search", props)}>
      <g className="anim-tilt">
        <circle cx="7" cy="7" r="4.25" />
        <path d="m10.2 10.2 3.1 3.1" />
      </g>
    </svg>
  );
}

export function AnimRefreshIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-refresh", props)}>
      <g className="anim-spin">
        <path d="M13 4.25A5.5 5.5 0 0 0 3.3 5.5" />
        <path d="M13 2.5v2.75h-2.75" />
        <path d="M3 11.75A5.5 5.5 0 0 0 12.7 10.5" />
        <path d="M3 13.5v-2.75h2.75" />
      </g>
    </svg>
  );
}

export function AnimPaletteIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-palette", props)}>
      <g className="anim-tilt">
        <path d="M8 2a6 6 0 1 0 0 12c1 0 1.4-.7 1.1-1.5-.2-.5 0-1 .5-1.2.4-.2.8-.2 1.3-.2h1a2.1 2.1 0 0 0 2.1-2.1A6 6 0 0 0 8 2Z" />
        <circle cx="5.2" cy="7.2" r="0.7" fill="currentColor" stroke="none" />
        <circle cx="7.4" cy="4.8" r="0.7" fill="currentColor" stroke="none" />
        <circle cx="10.4" cy="5.4" r="0.7" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

export function AnimLibraryIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-library", props)}>
      <path d="M2.5 3.25h4a1.5 1.5 0 0 1 1.5 1.5v8.5a1.25 1.25 0 0 0-1.25-1.25H2.5z" />
      <path
        className="anim-book-right"
        d="M13.5 3.25h-4A1.5 1.5 0 0 0 8 4.75v8.5A1.25 1.25 0 0 1 9.25 12h4.25z"
      />
    </svg>
  );
}

export function AnimHelpIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-help", props)}>
      <circle className="anim-node-pop" cx="8" cy="8" r="6" />
      <path d="M6.25 6.25a1.8 1.8 0 0 1 3.45.7c0 1.1-1.7 1.45-1.7 2.45" />
      <circle cx="8" cy="11.8" r="0.65" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AnimChangesIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-changes", props)}>
      <path d="M3.5 2.25h6l3 3v8.5h-9z" />
      <path d="M9.5 2.25v3h3" />
      <path className="anim-line-shift" d="M5.75 8.25h4.5M5.75 10.75h3" />
    </svg>
  );
}

export function AnimHistoryIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-history", props)}>
      <path d="M2.5 8h3M10.5 8h3" />
      <circle className="anim-node-pop" cx="8" cy="8" r="2.5" />
    </svg>
  );
}

export function AnimSyncIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-sync", props)}>
      <g className="anim-arrow-right">
        <path d="M3 8h9.5" />
        <path d="m9.5 5 3 3-3 3" />
      </g>
    </svg>
  );
}

export function AnimToolsIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-tools", props)}>
      <g className="anim-tilt">
        <path d="M9.8 3.2a3.2 3.2 0 0 0-3.9 4.2l-3.4 3.4a1.1 1.1 0 1 0 1.6 1.6l3.4-3.4a3.2 3.2 0 0 0 4.2-3.9l-1.6 1.6-1.9-.3-.3-1.9z" />
      </g>
    </svg>
  );
}

export function AnimRemoteIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-remote", props)}>
      <path d="M4.5 12h7.25a2.25 2.25 0 0 0 .4-4.46A3.75 3.75 0 0 0 5 6.4 2.75 2.75 0 0 0 4.5 12Z" />
    </svg>
  );
}

export function AnimTagIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-tag", props)}>
      <path d="M2.5 8.2V3.5a1 1 0 0 1 1-1h4.7l5.1 5.1a1.2 1.2 0 0 1 0 1.7l-3.9 3.9a1.2 1.2 0 0 1-1.7 0z" />
      <circle cx="5.4" cy="5.4" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AnimWorktreeIcon(props: IconProps) {
  return (
    <svg {...baseProps("anim-worktree", props)}>
      <path d="M2 4.5h4l1.2 1.5H14v6.75a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
      <path className="anim-node-pop" d="M6.5 9.75h3" />
    </svg>
  );
}
