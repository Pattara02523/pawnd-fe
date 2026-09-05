import Link from 'next/link';
import type { ReactNode } from 'react';
import Image from 'next/image';

import { AuthAside } from './AuthAside';

/** โครงหน้า Server Component สำหรับ Login/Register ใช้ระยะและขนาดฟอร์มชุดเดียวกัน */
export function AuthEntryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      {/* แผงต้อนรับใช้ภาพใหม่เฉพาะสองหน้าที่ผู้ใช้ระบุ */}
      <AuthAside
        appearance="entry"
        title="ยินดีต้อนรับสู่ PAWND"
        description="แพลตฟอร์มช่วยตามหาสัตว์เลี้ยงหาย ด้วยพลัง AI จับคู่แม่นยำ พร้อมชุมชนคนรักสัตว์ที่พร้อมช่วยเหลือกันตลอด 24 ชั่วโมง"
      />

      <div className="flex min-w-0 flex-1 flex-col bg-muted/30">
        {/* โลโก้เดิมจัดสัดส่วนให้ตรงกับด้านซ้าย โดยไม่เปลี่ยนอัตลักษณ์แบรนด์ */}
        <Link
          href="/"
          aria-label="PAWND กลับหน้าแรก"
          className="flex w-fit items-center gap-3 px-6 py-6 sm:px-10"
        >
          <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-background">
            <Image
              src="/logo.png"
              alt="PAWND"
              width={40}
              height={40}
              className="size-10 object-contain"
            />
          </div>
          <span className="text-xl font-bold tracking-wide text-foreground">
            PAWND
          </span>
        </Link>

        {/* กรอบฟอร์มและขนาด controls จำกัดผลเฉพาะ Login/Register ไม่แก้ UI primitives ทั่วเว็บ */}
        <main className="flex flex-1 items-center justify-center px-4 pb-8 sm:px-8 sm:pb-10">
          <div className="w-full max-w-lg rounded-3xl border border-border/80 bg-card p-6 shadow-sm sm:p-8 [&_form]:gap-5 [&_h1]:tracking-tight [&_h1+p]:mt-2 [&_h1+p]:leading-relaxed [&_[data-slot=input]]:h-12 [&_[data-slot=input]]:border-border [&_[data-slot=input]]:bg-background [&_[data-slot=input]]:px-4 [&_input:has(+button)]:pr-12 [&_input+button]:size-10 [&_input+button]:border-0 [&_[data-slot=button]]:min-h-12 [&_[data-slot=button]]:rounded-2xl [&_label]:leading-relaxed">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
