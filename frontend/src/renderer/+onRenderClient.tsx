export { onRenderClient }

import React from 'react'
import ReactDOM, { createRoot, hydrateRoot } from 'react-dom/client'
import { PageLayout } from './PageLayout'
import type { OnRenderClientAsync } from 'vike/types'
import { getPageTitle } from './getPageTitle'
import { BrowserRouter } from 'react-router-dom'

let root: ReactDOM.Root | null = null;

const onRenderClient: OnRenderClientAsync = async (pageContext): ReturnType<OnRenderClientAsync> => {
  const { Page } = pageContext
  if (!Page) throw new Error('My onRenderClient() hook expects pageContext.Page to be defined')
  const container = document.getElementById('root')
  if (!container) throw new Error('DOM element #root not found')
  const PageComponent = Page as React.ComponentType<any>
  const pageElement = (
    <BrowserRouter>
        <PageLayout pageContext={pageContext}>
            <PageComponent />
        </PageLayout>
    </BrowserRouter>
  )
  if (pageContext.isHydration) {
    // For the first client-side render, use hydrateRoot
    root =hydrateRoot(container, pageElement)
  } else if (!root) {
    // Create the root only once (when root is null)
    root = createRoot(container)
    root.render(pageElement)
  } else {
    // Reuse the existing root for subsequent renders
    root.render(pageElement)
  }
}