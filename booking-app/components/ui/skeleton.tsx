import React from "react";

export function Skeleton({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return <div className={`animate-pulse bg-slate-200 dark:bg-slate-800 rounded ${className}`}>{children}</div>;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full" />
      ))}
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
      <div className="h-10 w-10 rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="flex-1">
        <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/3 mb-2" />
        <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded w-1/4" />
      </div>
      <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-12" />
    </div>
  );
}

export default Skeleton;
