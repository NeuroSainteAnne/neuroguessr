export { PageLayout }

import React from 'react'
import './PageLayout.css'
import type { PageContext } from 'vike/types'
import Header from '../components/Header';
import Footer from '../components/Footer';
import { AppProvider } from '../context/AppContext';
import { SocketProvider } from '../context/SocketContext';
import { Notification } from '../components/Notification';
import { Help } from '../components/Help';

function PageLayout({ children, pageContext }: { children: React.ReactNode; pageContext: PageContext }) {
    return (
        <React.StrictMode>
            <SocketProvider>
                <AppProvider pageContext={pageContext}>
                    <div className="main-container">
                        <Header />
                        <Content>{children}</Content>
                        <Footer />
                        <Help />
                        <Notification />
                    </div>
                </AppProvider>
            </SocketProvider>
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