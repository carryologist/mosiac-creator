import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEGO Mosaic Creator",
  description: "Convert images to LEGO mosaic files for BrickLink Studio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-white antialiased min-h-screen font-[system-ui,_-apple-system,_'Segoe_UI',_Roboto,_sans-serif]">
        {children}
      </body>
    </html>
  );
}
