import React from 'react';
import { cn } from '../../lib/utils';

export function Skeleton({ className, ...props }) {
  return (
    <div className={cn('skeleton', className)} {...props} />
  );
}

export function SkeletonStatCard() {
  return (
    <div className="bg-white rounded-2xl shadow-card p-5">
      <div className="flex items-start justify-between mb-5">
        <Skeleton className="w-9 h-9 rounded-xl" />
        <Skeleton className="w-4 h-4 rounded-full" />
      </div>
      <Skeleton className="w-12 h-9 rounded-lg mb-2" />
      <Skeleton className="w-20 h-3 rounded-full" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3.5 px-5">
      <Skeleton className="w-12 h-4 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="w-full h-3.5 rounded-full" />
        <Skeleton className="w-2/3 h-2.5 rounded-full" />
      </div>
    </div>
  );
}
