import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { BuscarLeads } from './pages/BuscarLeads'
import { Dashboard } from './pages/Dashboard'
import { Mensagens } from './pages/Mensagens'
import { ContratosList } from './pages/contratos/ContratosList'
import { ContratoWizard } from './pages/contratos/ContratoWizard'
import { ContratoView } from './pages/contratos/ContratoView'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<BuscarLeads />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="mensagens" element={<Mensagens />} />
          <Route path="contratos" element={<ContratosList />} />
          <Route path="contratos/novo" element={<ContratoWizard />} />
          <Route path="contratos/:id" element={<ContratoView />} />
          <Route path="*" element={<div style={{padding: 20}}><h2>Em construcao</h2></div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
