import type { Metadata, Viewport } from "next";
// Self-hosted fonts (no build-time call to Google Fonts).
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/fraunces/full-italic.css";
import "@fontsource-variable/onest/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SarafuPay — group collections on WhatsApp, powered by PayPal",
  description:
    "An AI agent in WhatsApp that runs michango — weddings, funerals, medical bills, NGOs — collects with PayPal and pays out transparently.",
};

export const viewport: Viewport = { themeColor: "#0e3b2c" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
