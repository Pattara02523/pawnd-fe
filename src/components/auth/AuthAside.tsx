import Image from 'next/image';
import { cn } from '@/lib/utils';

import { AuthAsideIllustration } from './AuthAsideIllustration';

type AuthAsideProps = {
  /** เปิดดีไซน์ภาพถ่ายเฉพาะหน้า Login/Register ที่ได้รับมอบหมาย */
  appearance?: 'default' | 'entry';
  title?: string;
  description?: string;
};

/**
 * AuthAside (Server Component)
 * - แผงสีเขียวด้านซ้ายของหน้า Auth (Login/Register/Forgot/Reset Password)
 * - ยืดความสูงเต็มคอลัมน์เสมอ ด้วย flex stretch ตามธรรมชาติ (ไม่ล็อก h-full ทับ)
 */
export function AuthAside({
  appearance = 'default',
  title = 'ตรวจสอบกล่องข้อความ',
  description = 'ระบบส่งลิงก์ยืนยันตัวตนความปลอดภัยสูงไปยังกล่องข้อความของคุณแล้ว เพื่อป้องกันสแปมและดูแลความเป็นส่วนตัวให้แก่สมาชิกในเครือข่ายสูงสุด',
}: AuthAsideProps) {
  return (
    <aside
      className={cn(
        'relative hidden min-h-screen w-full flex-col justify-between overflow-hidden bg-primary px-10 py-8 text-primary-foreground md:flex md:w-[38%] lg:w-[35%]',
        appearance === 'entry' && 'gap-10 px-6 py-6 lg:px-10 xl:w-[40%]',
      )}
    >
      {/* โลโก้แบรนด์ ขยายขนาดให้เด่นขึ้น */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            appearance === 'entry' &&
              'flex size-12 items-center justify-center rounded-2xl bg-primary-foreground shadow-xs',
          )}
        >
          <Image
            src="/logo.png"
            alt="PAWND"
            width={64}
            height={64}
            className={cn(
              'size-16 rounded-full',
              appearance === 'entry' && 'size-10 object-contain',
            )}
          />
        </div>
        <span
          className={cn(
            'text-3xl font-bold',
            appearance === 'entry' && 'text-xl tracking-wide',
          )}
        >
          PAWND
        </span>
      </div>

      {/* ภาพประกอบ + ข้อความหลักตรงกลาง */}
      <div className="flex flex-col items-center gap-8 text-center">
        <div
          className={cn(
            'flex aspect-square w-full max-w-[260px] items-center justify-center rounded-3xl bg-primary-foreground/10 p-8',
            appearance === 'entry' &&
              'relative max-w-sm overflow-hidden border border-primary-foreground/20 p-0 shadow-xl',
          )}
        >
          {/* ภาพใหม่แทนจุดกากบาท ส่วนหน้า Auth อื่นใช้ภาพเดิม */}
          {appearance === 'entry' ? (
            <Image
              src="/images/auth-pets.png"
              alt="สุนัขโกลเด้นรีทรีฟเวอร์และแมวนั่งอยู่ด้วยกันหน้าบ้าน"
              fill
              sizes="(min-width: 1280px) 384px, 38vw"
              className="object-cover"
            />
          ) : (
            <AuthAsideIllustration />
          )}
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="max-w-sm text-sm leading-relaxed text-primary-foreground/80">
            {description}
          </p>
        </div>
      </div>

      <p className="text-xs text-primary-foreground/70">
        © 2026 PAWND Thailand. All rights reserved.
      </p>
    </aside>
  );
}
