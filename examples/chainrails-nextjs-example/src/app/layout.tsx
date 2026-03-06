import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chainrails Demo",
  description: "Minimal Chainrails Payment Modal Demo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
