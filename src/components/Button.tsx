import type { ButtonHTMLAttributes } from 'react'

/**
 * Four variants and no more. `copper` is hazard-only — if a button is copper it destroys
 * something, and if it destroys something it is copper.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'pill'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-thyme text-paper rounded-sm px-5 font-mono text-xs uppercase tracking-[0.08em]',
  secondary:
    'bg-transparent text-thyme border border-thyme rounded-full px-4 font-mono text-[11px] uppercase tracking-[0.08em]',
  ghost:
    'bg-transparent text-ink-soft border border-rule rounded-full px-[13px] font-mono text-[11px] uppercase tracking-[0.08em]',
  destructive:
    'bg-transparent text-copper border border-copper/45 rounded-sm px-5 font-mono text-xs uppercase tracking-[0.08em]',
  pill: 'bg-transparent text-ink-soft font-mono text-xs',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }

export default function Button({ variant = 'primary', className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      // 44px floor everywhere: one thumb, arm's length, possibly wet hands.
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 transition-opacity disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}
