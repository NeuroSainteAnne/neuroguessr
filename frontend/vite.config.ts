import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy';
import vike from 'vike/plugin'
import path from 'path';

// https://vite.dev/config/
export default {
  plugins: [
        {
      name: 'intercept-source-maps',
      configureServer(server) {
        // Add middleware that runs very early in the stack
        server.middlewares.use((req, res, next) => {
          if (req.url) {
            const url = req.url.split('?')[0]; // Remove query parameters
            
            // More flexible pattern matching
            if ((url.includes('/node_modules/') || url.startsWith('/@fs/')) && 
                (url.endsWith('.ts') || url.endsWith('.map') || 
                url.endsWith('.tsx') || url.includes('.ts?'))) {
              
              // Return a 200 response with empty content
              res.statusCode = 200;
              
              // Set appropriate content type
              if (url.endsWith('.map')) {
                res.setHeader('Content-Type', 'application/json');
                res.end('{}');
              } else {
                res.setHeader('Content-Type', 'application/typescript');
                res.end('// Source not available');
              }
              return;
            }
          }
          next();
        });
      }
    },
    react(), vike(),
  ],
  server:{
    port: 9876,
    proxy:{
      '/api':{
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,   
      },
      '/websocket':{
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,   
        ws: true,
      }
    },
    watch: {
      // Watch the /styles directory for changes
      usePolling: true, // Optional: Use polling if file changes are not detected
      interval: 1000, // Optional: Polling interval in milliseconds
    }
  },
  preview:{
    port: 9876
  },
  build: {
    sourcemap: false
  }
}
