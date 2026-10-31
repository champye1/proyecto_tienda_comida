import type { ReactNode } from 'react'

/** Marco centrado para login y registro. */
export function AuthCard({ title, subtitle, children, footer }: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/logo.svg" alt="" className="mb-4 size-12" />
          <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-zinc-600">{footer}</div>}
      </div>
    </main>
  )
}
