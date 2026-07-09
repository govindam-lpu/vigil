import type { Metadata, Viewport } from "next";
import { Literata, Spline_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

// The three type voices (DESIGN.md — Typography): Spline Sans is the
// instrument (UI), Spline Sans Mono is the record (timestamps, doses),
// Literata is the person (wordmark, page titles, names).
const splineSans = Spline_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

const splineSansMono = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap"
});

const literata = Literata({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Vigil",
  description: "Shared operational memory for family care coordination."
};

export const viewport: Viewport = {
  themeColor: "#12211C"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${splineSans.variable} ${splineSansMono.variable} ${literata.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
