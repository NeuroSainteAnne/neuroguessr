export { PageLayout }

import React from 'react'
import './PageLayout.css'
import type { PageContext } from 'vike/types'
import Header from '../components/Header';
import Footer from '../components/Footer';
import { AppProvider } from '../context/AppContext';
import { Notification } from '../components/Notification';

function PageLayout({ children, pageContext }: { children: React.ReactNode; pageContext: PageContext }) {
    return (
        <React.StrictMode>
            <AppProvider pageContext={pageContext}>
                <div className="main-container">
                    <Header />
                    <Content>{children}</Content>
                    <Footer />
                    <Notification />
                </div>
            </AppProvider>
        </React.StrictMode>
    )
}

function Content({ children }: { children: React.ReactNode }) {
    return (
        <main className="page-container">
            {children}
            <div className="lower-bar-phantom"></div>
        </main>
    )
}