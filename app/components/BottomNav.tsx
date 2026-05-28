"use client";

import { Home, List, PlusCircle, Shuffle, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Início", icon: Home },
  { href: "/registar", label: "Registar", icon: PlusCircle },
  { href: "/sorteio", label: "Sorteio", icon: Shuffle },
  { href: "/jogos", label: "Jogos", icon: List },
  { href: "/jogadores", label: "Malta", icon: Users }
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottomNav" aria-label="Navegação principal">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link className={active ? "active" : ""} href={item.href} key={item.href}>
            <Icon size={19} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
