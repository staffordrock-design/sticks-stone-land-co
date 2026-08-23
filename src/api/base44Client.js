import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// The web app can use relative API URLs, but a Capacitor iOS/Android WebView
// runs from a local origin (capacitor://localhost). Use Base44's absolute API
// host so native builds load the same live data as the hosted web app.
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: 'https://base44.app',
  requiresAuth: false,
  appBaseUrl
});
