import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { BuscarLeads } from './pages/BuscarLeads'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<BuscarLeads />} />
          <Route path="dashboard" element={<div style={{padding: 20}}><h2>Dashboard (Em construcao)</h2></div>} />
          <Route path="*" element={<div style={{padding: 20}}><h2>Em construcao</h2></div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
