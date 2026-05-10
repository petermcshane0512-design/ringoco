import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "BellAveGo — The Best AI Implementation for Teams of 1–15",
  description:
    "Grow your home service business without growing your team. BellAveGo answers your phone, follows up on quotes, recovers past-due invoices, and drafts replies to every Google review — automatically. Built for teams of 1–15.",
  openGraph: {
    title: "BellAveGo — Grow your home service business without growing your team",
    description:
      "AI built for home service pros. Answers calls, follows up on quotes, recovers past-due invoices, drafts review replies. Quietly, in the background, while you stay focused on the work.",
    url: "https://www.bellavego.com",
    siteName: "BellAveGo",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
