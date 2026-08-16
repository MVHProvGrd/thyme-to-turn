import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { useId } from 'react'

const CONTROL =
  'w-full bg-card border border-rule rounded-sm px-[14px] py-[13px] text-ink placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme'

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
      {children}
    </label>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; serif?: boolean }

export function Input({ label, serif = false, className = '', ...rest }: InputProps) {
  const id = useId()
  const font = serif ? 'font-serif text-[19px]' : 'font-mono text-[13px]'
  return (
    <div className="flex flex-col gap-[6px]">
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <input id={id} className={`${CONTROL} ${font} min-h-[48px] ${className}`} {...rest} />
    </div>
  )
}

/** The search / filter field: no label, mono, 44px. Used on both list screens. */
export function SearchField({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="search" className={`${CONTROL} font-mono text-sm min-h-[44px] ${className}`} {...rest} />
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode }

export function Textarea({ label, className = '', ...rest }: TextareaProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-[6px]">
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <textarea id={id} className={`${CONTROL} font-serif text-base leading-[1.5] ${className}`} {...rest} />
    </div>
  )
}
