import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '../styles/index.css'
import { isWeb } from './platform'
import { installBrowserAPI } from './web/browser-api'
import '../styles/Mobile.css'

if (isWeb) {
	installBrowserAPI()
	if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('/sw.js').catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>
)
