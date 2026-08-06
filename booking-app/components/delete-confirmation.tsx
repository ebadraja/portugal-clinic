"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface DeleteConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  itemName: string;
  onConfirm: () => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

export function DeleteConfirmation({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  onConfirm,
  onCancel,
  isLoading = false,
}: DeleteConfirmationProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <DialogTitle className="text-lg">{title}</DialogTitle>
            </div>
          </div>
          <DialogDescription className="mt-4 text-base">
            {description}
            <p className="font-semibold text-slate-900 mt-2">"{itemName}"</p>
            <p className="text-slate-600 mt-2">This action cannot be undone.</p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
            }}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            disabled={isLoading}
          >
            {isLoading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
