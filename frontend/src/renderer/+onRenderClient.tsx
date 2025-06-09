export { onRenderClient }

declare global {
  interface Window {
    __VIKE_INITIAL_STATE__?: any;
    __VIKE_STATE_APPLIED__?: boolean;
    __INITIAL_LANGUAGE__?: string;
    __NEEDS_LANGUAGE_SWITCH__?: boolean;
  }
}

import React from 'react'
import ReactDOM, { createRoot, hydrateRoot } from 'react-dom/client'
import { PageLayout } from './PageLayout'
import type { OnRenderClientAsync } from 'vike/types'
import { PageContextProvider } from 'vike-react/usePageContext'
let root: ReactDOM.Root | null = null;

// Check for server-injected state
const getInitialState = () => {
  if (typeof window !== 'undefined' && window.__VIKE_INITIAL_STATE__ && !window.__VIKE_STATE_APPLIED__) {
    // Mark that we've applied the state to avoid reapplying on subsequent renders
    window.__VIKE_STATE_APPLIED__ = true;
    return window.__VIKE_INITIAL_STATE__;
  }
  return null;
};

const onRenderClient: OnRenderClientAsync = async (pageContext): ReturnType<OnRenderClientAsync> => {
  const initialState = pageContext.isHydration ? getInitialState() : null;
  if (initialState) {
    pageContext = {
      ...pageContext,
      urlOriginal: initialState.originalUrl || pageContext.urlOriginal,
      routeParams: initialState.routeParams || pageContext.routeParams
    };
    
    // Log for debugging
    console.log('Using server-injected state:', initialState);
  } else if (pageContext.isClientSideNavigation) {
    // For client-side navigation, log the current context but don't override it
    console.log('[Client Navigation] Using navigation state:', {
      url: pageContext.urlOriginal,
      params: pageContext.routeParams
    });
  }

  const { Page } = pageContext
  if (!Page) throw new Error('My onRenderClient() hook expects pageContext.Page to be defined')
  const container = document.getElementById('root')
  if (!container) throw new Error('DOM element #root not found')
  const PageComponent = Page as React.ComponentType<any>
  const pageElement = (
    <PageContextProvider pageContext={pageContext}>
      <PageLayout pageContext={pageContext}>
          <PageComponent />
      </PageLayout>
    </PageContextProvider>
  )
  if (pageContext.isHydration) {
    try {
      root = hydrateRoot(container, pageElement);
    } catch (hydrationError) {
      console.warn('Hydration failed, falling back to client rendering:', hydrationError);
      
      // Clear the container to avoid hydration errors
      container.innerHTML = '';
      
      // Create a new root for client-side rendering
      root = createRoot(container);
      root.render(pageElement);
    }
  } else if (!root) {
    // Create the root only once (when root is null)
    root = createRoot(container)
    root.render(pageElement)
  } else {
    // Reuse the existing root for subsequent renders
    root.render(pageElement)
  }

  if (typeof window !== 'undefined') {
    // Set up loading screen size management
    setupLoadingScreen();
    
    // Set up window resize handler
    window.addEventListener('resize', () => {
      setupLoadingScreen();
    });
  }
  
  const needsLanguageSwitch = window.__NEEDS_LANGUAGE_SWITCH__;
  // After rendering completes, show content and hide loader
  setTimeout(() => {
    const rootElement = document.getElementById('root');
    if (rootElement) {
      rootElement.classList.remove('i18n-content-hidden');
      rootElement.classList.add('i18n-content-visible');
    }
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.style.display = 'none';
  }, needsLanguageSwitch ? 100 : 0); // Small delay if switching language
}

// Set up loading screen size management
const setupLoadingScreen = () => {
  // Get actual header and footer heights
  const navbar = document.querySelector('.navbar-container') as HTMLElement;
  const footer = document.querySelector('.lower-bar') as HTMLElement;
  
  if (navbar && footer) {
    const navbarHeight = navbar.offsetHeight;
    const footerHeight = footer.offsetHeight;
    
    // Set CSS variables for the loading screen to use
    document.documentElement.style.setProperty('--header-height', `${navbarHeight}px`);
    document.documentElement.style.setProperty('--footer-height', `${footerHeight}px`);
  }
};
