import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AgendarPublico from './components/agenda/AgendarPublico.jsx'
import OpinionPublica from './components/opiniones/OpinionPublica.jsx'
import TarjetaPublica from './components/lealtad/TarjetaPublica.jsx'
import { rutaLimpia } from './lib/dominios.js'

// /agendar y /agendar/<sucursal> son la página pública de reagendado; /opinion/<sucursal> es el QR de opiniones; /tarjeta/<token> es la tarjeta de lealtad de la clienta.
// Ninguna pasa por el login ni carga el sistema. (/sello/<token> sí: es de recepción y vive dentro de App.)
const path = rutaLimpia() // sin el prefijo /sistema (el sistema también abre en ciredepilacion.com/sistema)
const Raiz = /^\/agendar(\/|$)/.test(path) ? AgendarPublico : /^\/tarjeta\//.test(path) ? TarjetaPublica : /^\/opinion(\/|$)/.test(path) ? OpinionPublica : App
ReactDOM.createRoot(document.getElementById('root')).render(<Raiz/>)
