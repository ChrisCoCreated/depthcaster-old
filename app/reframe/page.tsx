"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReframePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/feed/reframe");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-500 dark:text-gray-400">Redirecting...</div>
    </div>
  );
}

