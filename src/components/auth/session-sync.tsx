'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getSession } from 'next-auth/react';
/** ซิงก์ cookie หลัง Server Action redirect และแจ้ง SessionProvider รวมกรณี logout ที่เป็น null */
export function SessionSync() {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  // ป้องกันการโหลดซ้ำครั้งแรก และอ่านสถานะใหม่เมื่อเปลี่ยนหน้า
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    void getSession();
  }, [pathname]);
  return null;
}
