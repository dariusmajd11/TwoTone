import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

/**
 * Secret Code by Matthew Welch — MIT-style licence, notice kept beside the file
 * in `fonts/SECRET-CODE-LICENSE.txt` because the licence requires it to travel
 * with any copy.
 *
 * Served as WOFF2 converted from the original 1998 TTF. The shipped TTF carries
 * a malformed zero-length Macintosh cmap subtable, and browsers reject the
 * whole file over it — the face loads with `status: "error"` and silently falls
 * back. Rebuilding through fontTools drops that subtable and keeps the valid
 * Windows Unicode one. Keep `secrcode.ttf` as the provenance of the conversion;
 * do not point `src` back at it.
 *
 * `src` resolves relative to this file.
 */
const secretCode = localFont({
  src: "./fonts/secret-code.woff2",
  variable: "--font-secret-code",
  display: "swap",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TwoTone",
  description:
    "Drop a photo of any garment and find out what it is, when it was made, and where to buy it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      /**
       * Deliberately *not* `antialiased`. That maps to
       * `-webkit-font-smoothing: antialiased`, which on macOS drops text from
       * subpixel to grayscale rendering and thins every stroke — the usual
       * reason a page looks crisper in a mockup than in a browser. On a face as
       * fine as Secret Code it was removing a meaningful fraction of the only
       * ink there is, so the default smoothing stays and the type renders at
       * full weight without any synthetic help.
       */
      className={`${geistSans.variable} ${geistMono.variable} ${secretCode.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
