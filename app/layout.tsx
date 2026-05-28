import type { Metadata } from "next";
import { BottomNav } from "@/app/components/BottomNav";
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
          {children}
          <BottomNav />
        </QueryProvider>
      </body>
    </html>
  );
}
