import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    base44({
      // Keep Base44 editor helpers out of the public production build while
      // preserving the analytics tracker used by the app.
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: mode !== 'production',
      navigationNotifier: mode !== 'production',
      analyticsTracker: true,
      visualEditAgent: mode !== 'production'
    }),
    react(),
  ]
}));
