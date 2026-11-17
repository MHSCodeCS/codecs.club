import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "@fontsource/open-sauce-sans/400.css";
import "@fontsource/open-sauce-sans/500.css";
import "@fontsource/open-sauce-sans/600.css";
import "@fontsource/open-sauce-sans/700.css";
import "@fontsource/open-sauce-sans/800.css";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "CodeCS", template: "%s · CodeCS" },
  description: "Python learning workspace for the basic and advanced groups.",
};

// Applies the saved theme before first paint so there is no light/dark flash.
const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={geistMono.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
