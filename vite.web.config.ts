import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
	root: 'src/renderer',
	publicDir: '../../public',
	plugins: [react(), { name: 'web-manifest', transformIndexHtml: html => html.replace('</head>', '<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="theme-color" content="#0c101b"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"></head>').replace('width=device-width, initial-scale=1.0', 'width=device-width, initial-scale=1.0, viewport-fit=cover') }],
	build: { outDir: fileURLToPath(new URL('./dist-web/client', import.meta.url)), emptyOutDir: true },
})
