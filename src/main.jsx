import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AgendarPublico from './components/agenda/AgendarPublico.jsx'

// /agendar/<sucursal> es la página pública de reagendado: no pasa por el login ni carga el sistema.
const esAgendar = location.pathname.startsWith('/agendar/')
ReactDOM.createRoot(document.getElementById('root')).render(esAgendar ? <AgendarPublico/> : <App/>)
