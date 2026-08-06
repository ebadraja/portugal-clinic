"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { Toast, ToastType, ToastContainer } from "@/components/toast";

interface ToastContextType {
  showToast: (message: string, type: ToastType, duration?: number) => void;
  toasts: Toast[];
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType, duration?: number) => {
      const id = generateId();
      const newToast: Toast = { id, message, type, duration };
      setToasts((prev) => [...prev, newToast]);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast, toasts, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
