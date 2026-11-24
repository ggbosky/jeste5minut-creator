import type { AnchorHTMLAttributes, ReactNode } from "react";

// Náhrada next/link pro hash router (GitHub Pages)
export default function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode; prefetch?: boolean; scroll?: boolean }) {
  const { prefetch: _p, scroll: _s, ...a } = rest as Record<string, unknown>;
  return <a href={href.startsWith("/") ? `#${href}` : href} {...(a as AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>;
}
