import { ReactNode, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Factory,
  Users,
  Warehouse,
  Plus,
  Menu,
  X,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Orders", path: "/orders", icon: ClipboardList },
  { label: "Paperwork", path: "/paperwork", icon: FileText },
  { label: "Production", path: "/production", icon: Factory },
  { label: "Customers", path: "/customers", icon: Users },
  { label: "Inventory", path: "/inventory", icon: Warehouse },
];

function NavItem({
  item,
  active,
  onClick,
}: {
  item: (typeof navItems)[0];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left text-[15px] font-medium transition-colors ${
        active
          ? "bg-white/10 text-catl-teal"
          : "text-white/70 hover:text-white hover:bg-white/5"
      }`}
    >
      <Icon size={20} />
      <span>{item.label}</span>
    </button>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Logo area */}
      <div className="px-5 py-6">
        <h1 className="text-catl-gold font-extrabold text-lg tracking-wider">
          CATL EQUIPMENT
        </h1>
        <p className="text-white/40 text-xs mt-0.5">Order Manager</p>
      </div>

      {/* New Order button */}
      <div className="px-4 mb-4">
        <button
          onClick={() => {
            navigate("/orders/new");
            setDrawerOpen(false);
          }}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-full bg-catl-gold text-catl-navy font-bold text-sm active:scale-[0.97] transition-transform"
        >
          <Plus size={18} />
          New Order
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <NavItem
            key={item.path}
            item={item}
            active={location.pathname === item.path}
            onClick={() => {
              navigate(item.path);
              setDrawerOpen(false);
            }}
          />
        ))}
      </nav>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col w-[220px] flex-shrink-0 fixed inset-y-0 left-0 z-30"
        style={{
          background: "linear-gradient(180deg, #153566 0%, #081020 100%)",
        }}
      >
        {sidebar}
      </aside>

      {/* Mobile header */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between px-4 h-14"
        style={{
          background: "linear-gradient(90deg, #153566 0%, #081020 100%)",
        }}
      >
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <button className="text-white p-2">
              <Menu size={24} />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[280px] p-0 border-0"
            style={{
              background: "linear-gradient(180deg, #153566 0%, #081020 100%)",
            }}
          >
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-4 text-white/60 hover:text-white z-10"
            >
              <X size={20} />
            </button>
            {sidebar}
          </SheetContent>
        </Sheet>
        <span className="text-catl-gold font-extrabold text-base tracking-wider">
          CATL EQUIPMENT
        </span>
        <div className="w-10" />
      </header>

      {/* Main content */}
      <main className="flex-1 md:ml-[220px] pt-14 md:pt-0">
        <div className="p-4 md:p-8 max-w-6xl mx-auto">{children}</div>
      </main>

      {/* Mobile FAB */}
      <button
        onClick={() => navigate("/orders/new")}
        className="md:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-catl-gold text-catl-navy shadow-lg flex items-center justify-center active:scale-[0.95] transition-transform"
      >
        <Plus size={28} />
      </button>
    </div>
  );
}
