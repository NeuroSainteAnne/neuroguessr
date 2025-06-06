import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'src/assets', // or just 'assets' if it's at the root
          dest: ''           // copies to dist/assets
        }
      ]
    })],
  server:{
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
      // Watch the /assets/styles directory for changes
      usePolling: true, // Optional: Use polling if file changes are not detected
      interval: 1000, // Optional: Polling interval in milliseconds
    },
  }
})
