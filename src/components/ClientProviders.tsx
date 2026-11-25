"use client";

import { useState, lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { NotificationProvider } from "@/context/NotificationProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/context/ThemeContext";
import Navbar from "@/components/Navbar";
import { NavigationProgress } from "@/components/NavigationProgress";
const GlobalSearch = lazy(() => import("@/components/GlobalSearch"));
import { SystemAlertNotice } from "@/components/ui/SystemAlertNotice";
import { EmailVerificationBanner } from "@/components/ui/EmailVerificationBanner";
import MobileBottomNav from "@/components/ui/MobileBottomNav";
import PushSync from "@/components/notifications/PushSync";
import LivePushPrompt from "@/components/notifications/LivePushPrompt";

export default function ClientProviders({ children }: { children: React.ReactNode }) {
    // Create QueryClient once per component instance (prevents SSR issues)
    const [queryClient] = useState(() => createQueryClient());

    return (
        <ErrorBoundary>
            <ThemeProvider>
                <QueryClientProvider client={queryClient}>
                    <AuthProvider>
                        <ToastProvider>
                            <NotificationProvider>
                                <SystemAlertNotice />
                                <EmailVerificationBanner />
                                <Suspense fallback={null}>
                                    <NavigationProgress />
                                </Suspense>
                                <Navbar />
                                <Suspense fallback={null}>
                                    <GlobalSearch />
                                </Suspense>
                                <main className="pb-20 md:pb-0">{children}</main>
                                <MobileBottomNav />
                                <PushSync />
                                <LivePushPrompt />
                            </NotificationProvider>
                        </ToastProvider>
                    </AuthProvider>
                </QueryClientProvider>
            </ThemeProvider>
        </ErrorBoundary>
    );
}
