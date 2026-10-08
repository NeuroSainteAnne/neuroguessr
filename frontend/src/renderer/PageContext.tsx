import React, { useContext } from 'react'
import type { PageContextClient } from 'vike/types'

// Create the context
export const PageContext = React.createContext<PageContextClient | undefined>(undefined)

// Create a custom hook to use it easily in components
export function usePageContext() {
  const pageContext = useContext(PageContext)
  return pageContext
}

// Create the Provider component
export function PageContextProvider({ 
  pageContext, 
  children 
}: { 
  pageContext: PageContextClient
  children: React.ReactNode 
}) {
  return (
    <PageContext.Provider value={pageContext}>
      {children}
    </PageContext.Provider>
  )
}