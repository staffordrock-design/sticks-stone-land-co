import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initializeGoogleAds } from '@/lib/googleAdsTracking'

initializeGoogleAds()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
