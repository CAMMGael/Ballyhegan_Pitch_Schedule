import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/layout/Header";

export const metadata: Metadata = {
  title: "Ballyhegan Davitts GAA — Pitch Schedule",
  description: "Pitch booking and scheduling for Ballyhegan Davitts GAA Club",
  icons: {
    icon: "/favicon.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white font-sans text-primary-950">
        <Providers>
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
          <footer className="bg-primary-800 text-white mt-12">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src="/logo.png"
                    alt="Ballyhegan Davitts"
                    className="h-10 w-10"
                  />
                  <div>
                    <p className="font-semibold">Ballyhegan Davitts GAA</p>
                    <p className="text-sm text-gray-300">Pitch Schedule System</p>
                  </div>
                </div>
                <p className="text-sm text-gray-400">
                  &copy; {new Date().getFullYear()} Ballyhegan Davitts GAA Club
                </p>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
