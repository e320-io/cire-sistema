import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AgendarPublico from './components/agenda/AgendarPublico.jsx'
import OpinionPublica from './components/opiniones/OpinionPublica.jsx'

// /agendar y /agendar/<sucursal> son la página pública de reagendado; /opinion/<sucursal> es el QR de opiniones.
// Ninguna pasa por el login ni carga el sistema.
const path = location.pathname
const Raiz = /^\/agendar(\/|$)/.test(path) ? AgendarPublico : /^\/opinion(\/|$)/.test(path) ? OpinionPublica : App
ReactDOM.createRoot(document.getElementById('root')).render(<Raiz/>)
