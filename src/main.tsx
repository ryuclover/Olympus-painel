import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { BuscarLeads } from './pages/BuscarLeads'
import { Dashboard } from './pages/Dashboard'
import { Mensagens } from './pages/Mensagens'
import { Leads } from './pages/Leads'
import { ContratosList } from './pages/contratos/ContratosList'
import { ContratoWizard } from './pages/contratos/ContratoWizard'
import { ContratoView } from './pages/contratos/ContratoView'
import { Automacoes } from './pages/Automacoes'
import { Logs } from './pages/Logs'
import './index.css'

const originalFetch = window.fetch.bind(window)
const apiOrigin = import.meta.env.DEV ? '' : 'http://127.0.0.1:9001'
window.fetch = (input, init) => {
  if (typeof input === 'string' && input.startsWith('/api/')) {
    return originalFetch(`${apiOrigin}${input}`, init)
  }
  return originalFetch(input, init)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<BuscarLeads />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="leads" element={<Leads />} />
          <Route path="mensagens" element={<Mensagens />} />
          <Route path="contratos" element={<ContratosList />} />
          <Route path="contratos/novo" element={<ContratoWizard />} />
          <Route path="contratos/:id" element={<ContratoView />} />
          <Route path="automacoes" element={<Automacoes />} />
          <Route path="logs" element={<Logs />} />
          <Route path="*" element={<div style={{padding: 20}}><h2>Em construcao</h2></div>} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>,
)
