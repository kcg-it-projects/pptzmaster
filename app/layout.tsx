import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PPTZMaster — AI Template Präsentationen",
  description: "Erstelle Präsentationen die exakt wie dein Template aussehen — mit AI Content.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="antialiased">{children}</body>
    </html>
  );
}
