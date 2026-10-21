import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif4" });

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23fff'/%3E%3Cpath d='M9 5h10l6 6v15a1.5 1.5 0 0 1-1.5 1.5h-14.5A1.5 1.5 0 0 1 7.5 26V6.5A1.5 1.5 0 0 1 9 5z' fill='%230078d4'/%3E%3Cpath d='M19 5v6h6z' fill='%2366b2ec'/%3E%3Cpath d='M11.5 18l3 3 6-6.5' fill='none' stroke='%23fff' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: "origincheck – similarity checker",
  description: "Open-source similarity checker and writing assistant. Find matching wording, fix it honestly, cite properly. Runs in your browser.",
  icons: { icon: ICON },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Apply the saved theme before first paint.
const THEME = `try{var t=JSON.parse(localStorage.getItem("oc-prefs")||"{}").theme;if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body className="font-sans text-[15px] leading-normal antialiased">{children}</body>
    </html>
  );
}
