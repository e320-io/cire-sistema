import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AgendarPublico from './components/agenda/AgendarPublico.jsx'

// /agendar y /agendar/<sucursal> son la página pública de reagendado: no pasa por el login ni carga el sistema.
const esAgendar = /^\/agendar(\/|$)/.test(location.pathname)
ReactDOM.createRoot(document.getElementById('root')).render(esAgendar ? <AgendarPublico/> : <App/>)
