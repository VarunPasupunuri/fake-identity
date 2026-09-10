/**
 * Identity Sentinel mark and wordmark.
 *
 * The mark: a square frame with its top-right corner open, and a solid square
 * set inside toward the opening — a watch post looking outward across a
 * boundary. Four strokes and one square; reads at 16px, works in one colour.
 */
import { cx } from '../../lib/format.js';

export function LogoMark({ size = 24, className, title = 'Identity Sentinel' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title} className={cx('shrink-0', className)}>
      <path d="M4 4h9M4 4v16h16v-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" />
      <rect x="12.5" y="6.5" width="5.5" height="5.5" fill="currentColor" />
    </svg>
  );
}

export const PRODUCT_NAME = 'Identity Sentinel';
export const PRODUCT_TAGLINE = 'Intelligent Identity & Document Verification Platform';

/**
 * @param {{ size?: 'sm'|'md'|'lg', tagline?: boolean, className?: string }} props
 */
export default function Logo({ size = 'md', tagline = false, className }) {
  const dims = { sm: { mark: 20, name: 'text-sm', tag: 'text-[11px]' }, md: { mark: 24, name: 'text-base', tag: 'text-xs' }, lg: { mark: 36, name: 'text-2xl', tag: 'text-sm' } }[size];
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={dims.mark} className="text-[var(--brand)]" />
      <span className="min-w-0 leading-tight">
        <span className={cx('block font-semibold tracking-tight text-[var(--ink)]', dims.name)}>Identity <span className="font-bold">Sentinel</span></span>
        {tagline && <span className={cx('block muted', dims.tag)}>{PRODUCT_TAGLINE}</span>}
      </span>
    </span>
  );
}
