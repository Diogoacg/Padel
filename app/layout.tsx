import type { Metadata } from "next";
import { BottomNav } from "@/app/components/BottomNav";
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
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
