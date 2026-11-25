import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// assetsDir propio: el sitio principal (ciredepilacion.com, proyecto cire-site) "presta" /agendar de esta app con un rewrite y también usa /assets/;
// así los archivos de la agenda (/agenda-assets/…) no chocan con los del sitio.
export default defineConfig({ plugins: [react()], build: { assetsDir: 'agenda-assets' } })
