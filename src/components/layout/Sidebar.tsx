import { NavLink } from "react-router-dom";
import {
  Search, LayoutDashboard, Users, MessageSquare, GitBranch,
  BookUser, CheckSquare, BarChart2, Zap, FileText, Settings,
  HelpCircle, Headphones, Flame, FileSignature, Terminal
} from "lucide-react";

const NAV = [
  { to: "/", icon: Search, label: "Buscar Leads" },
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/leads", icon: Users, label: "Leads" },
  { to: "/mensagens", icon: MessageSquare, label: "Mensagens" },
  { to: "/diagramas", icon: GitBranch, label: "Diagramas" },
  { to: "/contatos", icon: BookUser, label: "Contatos" },
  { to: "/tarefas", icon: CheckSquare, label: "Tarefas" },
  { to: "/relatorios", icon: BarChart2, label: "Relatorios" },
  { to: "/automacoes", icon: Zap, label: "Automacoes" },
  { to: "/modelos", icon: FileText, label: "Modelos" },
  { to: "/configuracoes", icon: Settings, label: "Configuracoes" },
  { to: "/contratos", icon: FileSignature, label: "Contratos" },
  { to: "/logs", icon: Terminal, label: "Logs" },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Flame size={20} />
        </div>
        <span className="sidebar-logo-text">Olympus</span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ to, icon: Icon, label }) => (
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
        ))}
      </nav>

      <div className="sidebar-footer">
        <a href="#" className="footer-link"><HelpCircle size={14} /> Ajuda</a>
        <a href="#" className="footer-link"><Headphones size={14} /> Suporte</a>
      </div>
    </aside>
  );
}
