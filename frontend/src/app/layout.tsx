import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import { Search } from "lucide-react"; // icons
import Header from "./components/Header";
import { SidebarProvider } from "@/context/SidebarContext";
import PageWrapper from "@/app/components/PageWrapper"
import StatusBar from "@/app/components/StatusBar";
import { Toaster } from "sonner";

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter", 
});

const instrumentSerif = Instrument_Serif({
  weight: "400", 
  subsets: ["latin"],
  variable: "--font-instrument", 
});

export const metadata: Metadata = {
    title: "Kangaroo Terminal | ASX Intelligence",
    description: "Advanced financial analytics for the Aussie market.",
    icons:  {
        icon: "/assets/favicon.ico",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${inter.variable} ${instrumentSerif.variable} font-sans antialiased`}>
            <SidebarProvider>
                <div className="flex min-h-screen bg-background text-text">
                    <Sidebar />
                    <PageWrapper>
                        <Header />
                        <div className="pb-12">
                            {children}
                        </div>
                        <StatusBar />
                    </PageWrapper>
                </div>
                    <Toaster 
                        position="bottom-right" 
                        theme="dark" 
                        toastOptions={{
                            style: {
                                background: '#0F0B08', 
                                border: '1px solid rgba(198, 142, 86, 0.4)', 
                                color: '#EBE3DB',
                                boxShadow: '0 0 25px rgba(198, 142, 86, 0.15), 0 4px 10px rgba(0,0,0,0.5)', 
                                borderRadius: '12px',
                                padding: '16px',
                                fontSize: '13px'
                            },
                            className: 'font-sans'
                        }}
                    />
            </SidebarProvider>
            </body>
        </html>
    );
}