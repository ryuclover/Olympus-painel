import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  Search, LayoutDashboard, Users, MessageSquare, GitBranch,
  BookUser, CheckSquare, BarChart2, Zap, FileText, Settings,
  HelpCircle, Headphones, Flame, FileSignature, Terminal, LogOut,
  MoreHorizontal, ChevronDown
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

const MAIN_NAV = [
  { to: "/", icon: Search, label: "Buscar Leads" },
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/leads", icon: Users, label: "Leads" },
  { to: "/mensagens", icon: MessageSquare, label: "Mensagens" },
  { to: "/contratos", icon: FileSignature, label: "Contratos" },
  { to: "/automacoes", icon: Zap, label: "Automacoes" },
  { to: "/logs", icon: Terminal, label: "Logs" },
];

const MORE_NAV = [
  { to: "/diagramas", icon: GitBranch, label: "Diagramas" },
  { to: "/contatos", icon: BookUser, label: "Contatos" },
  { to: "/tarefas", icon: CheckSquare, label: "Tarefas" },
  { to: "/relatorios", icon: BarChart2, label: "Relatorios" },
  { to: "/modelos", icon: FileText, label: "Modelos" },
  { to: "/configuracoes", icon: Settings, label: "Configuracoes" },
];

export function Sidebar() {
  const { usuario, logout } = useAuth();
  const location = useLocation();
  const moreIsActive = MORE_NAV.some(item => location.pathname === item.to);
  const [moreOpen, setMoreOpen] = useState(moreIsActive);

  const renderNavItem = ({ to, icon: Icon, label }: typeof MAIN_NAV[number]) => (
    <NavLink
      key={to}
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `nav-item ${isActive ? "nav-item-active" : ""}`
      }
    >
      <Icon size={16} />
      <span>{label}</span>
    </NavLink>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Flame size={20} />
        </div>
        <span className="sidebar-logo-text">Olympus</span>
      </div>

      <nav className="sidebar-nav">
        {MAIN_NAV.map(renderNavItem)}
        <button
          type="button"
          className={`nav-item nav-more-button ${moreIsActive ? "nav-item-active" : ""}`}
          onClick={() => setMoreOpen(open => !open)}
          aria-expanded={moreOpen}
        >
          <MoreHorizontal size={16} />
          <span>Mais</span>
          <ChevronDown size={15} className={`nav-more-chevron ${moreOpen ? "nav-more-chevron-open" : ""}`} />
        </button>
        {moreOpen && (
          <div className="nav-more-items">
            {MORE_NAV.map(renderNavItem)}
          </div>
        )}
      </nav>

      <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        {usuario && (
          <div style={{ padding: '0 8px 4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {usuario.nome}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#f59e0b' }}>
                {usuario.plano ? usuario.plano.toUpperCase() : 'LICENÇA ATIVA'}
              </div>
            </div>
            <button
              onClick={logout}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer',
                padding: 4
              }}
              title="Sair / Trocar de conta"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
        <a href="#" className="footer-link"><HelpCircle size={14} /> Ajuda</a>
        <a href="#" className="footer-link"><Headphones size={14} /> Suporte</a>
      </div>
    </aside>
  );
}
