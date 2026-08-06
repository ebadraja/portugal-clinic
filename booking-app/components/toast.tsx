"use client";

import { useEffect, useState } from "react";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastProps extends Toast {
  onClose: (id: string) => void;
}

const toastConfig = {
  success: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-900",
    icon: "text-emerald-600",
    Icon: CheckCircle2,
  },
  error: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-900",
    icon: "text-red-600",
    Icon: AlertCircle,
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-900",
    icon: "text-amber-600",
    Icon: AlertCircle,
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-900",
    icon: "text-blue-600",
    Icon: Info,
  },
};

export function Toast({
  id,
  message,
  type,
  duration = 5000,
  onClose,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const config = toastConfig[type];
  const Icon = config.Icon;

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose(id), 300); // Allow animation to complete
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  return (
    <div
      className={`transform transition-all duration-300 ${
        isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      }`}
    >
      <div
        className={`${config.bg} ${config.border} border rounded-lg p-4 flex items-start gap-3 shadow-lg`}
      >
        <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${config.icon}`} />
        <p className={`text-sm font-medium ${config.text}`}>{message}</p>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(() => onClose(id), 300);
          }}
          className={`ml-auto flex-shrink-0 ${config.text} hover:opacity-70 transition-opacity`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 max-w-md">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onClose={onClose} />
      ))}
    </div>
  );
}
