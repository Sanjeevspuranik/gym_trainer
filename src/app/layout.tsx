import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gym Trainer — Make every set count",
  description:
    "A personal workout log for building strength, one session at a time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
