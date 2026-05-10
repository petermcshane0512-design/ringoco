import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "BellAveGo — The Best AI Implementation for Teams of 1–15",
  description:
    "Replace the $60K/yr office manager you can't afford to hire. BellAveGo answers your calls, hunts down quotes, collects past-due invoices, and replies to reviews — for $497/month. First month free.",
  openGraph: {
    title: "BellAveGo — The Best AI Implementation for Teams of 1–15",
    description:
      "Four AIs. One office manager. Built for home-service teams of 1–15. $497/mo, first month free, 90-day money-back if we don't book you 5 jobs.",
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
