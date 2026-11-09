import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
	main: {
		build: {
			externalizeDeps: true,
			lib: {
				entry: 'electron/main.ts',
			},
			outDir: 'dist/main',
			rollupOptions: {
				output: {
					entryFileNames: '[name].js',
				},
			},
		},
	},
	preload: {
		build: {
			externalizeDeps: true,
			lib: {
				entry: 'electron/preload.ts',
			},
			outDir: 'dist/preload',
			rollupOptions: {
				output: {
					format: 'cjs',
					entryFileNames: '[name].cjs',
				},
			},
		},
	},
	renderer: {
		root: 'src/renderer',
		publicDir: '../../public',
		plugins: [
			react(),
			{
				name: 'development-csp',
				apply: 'serve',
				transformIndexHtml: html => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*"),
			},
		],
		build: {
			outDir: 'dist',
			emptyOutDir: false,
			rollupOptions: {
				input: fileURLToPath(new URL('./src/renderer/index.html', import.meta.url)),
			},
		},
	},
})
