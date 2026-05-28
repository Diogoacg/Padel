import type { Metadata } from "next";
import { BottomNav } from "@/app/components/BottomNav";
import { InactivityDecayRunner } from "@/app/components/InactivityDecayRunner";
import { QueryProvider } from "@/app/components/QueryProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Padel Weekends",
  description: "Regista jogos, jogadores e ratings do teu grupo de padel."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body>
        <QueryProvider>
          <InactivityDecayRunner />
          {children}
          <BottomNav />
        </QueryProvider>
      </body>
    </html>
  );
}
