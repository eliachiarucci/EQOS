import type { ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TopBar } from './TopBar'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps): React.JSX.Element {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <TopBar />
        <main className="flex-1 overflow-hidden p-4">{children}</main>
      </div>
    </TooltipProvider>
  )
}
