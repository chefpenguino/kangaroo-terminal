"use client";
import { useSidebar } from "@/context/SidebarContext";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";

export default function PageWrapper({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();
  const notifiedIds = useRef<Set<number>>(new Set());

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // play sound helper
  const playAlertSound = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio("/assets/ping.mp3");
        audioRef.current.volume = 0.5;
      }

      // reset if already playing
      audioRef.current.currentTime = 0;

      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          // ignore common browser-blocked audio errors
          if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') {
            console.error("Audio play failed", e);
          }
        });
      }
    } catch (e) {
      console.error("Audio internal error", e);
    }
  };

  useEffect(() => {
    let isFirstCheck = true;

    const checkAlerts = async () => {
      try {
        const res = await fetch("http://localhost:8000/alerts/triggered");
        if (!res.ok) return;
        const alerts = await res.json();

        let hasNew = false;
        alerts.forEach((alert: any) => {
          if (!notifiedIds.current.has(alert.id)) {
            // mark as notified immediately to avoid duplicates
            notifiedIds.current.add(alert.id);

            // visual toast always shows for new/active alerts
            toast(`PRICE ALERT: ${alert.ticker}`, {
              description: `Price is ${alert.condition} $${alert.target_price.toFixed(2)}`,
              icon: <BellRing className="text-red-500" size={18} />,
              duration: 10000,
            });

            // attempt audio alert - if browser blocks it, it will fail silently via catch block
            hasNew = true;
          }
        });

        if (hasNew) {
          playAlertSound();
        }

        isFirstCheck = false;
      } catch (e) {
        console.error("Alert poll failed", e);
      }
    };

    // run immediately on mount
    checkAlerts();

    const interval = setInterval(checkAlerts, 5000); // check every 5s
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.main
      // animate margin based on sidebar state
      initial={{ marginLeft: "16rem" }} // 16rem = w-64
      animate={{ marginLeft: isCollapsed ? "5rem" : "16rem" }} // 5rem = w-20
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="flex-1 p-8"
    >
      {children}
    </motion.main>
  );
}