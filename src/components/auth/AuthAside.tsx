import Image from 'next/image';

import { AuthAsideIllustration } from './AuthAsideIllustration';

type AuthAsideProps = {
  title?: string;
  description?: string;
};

/**
 * AuthAside (Server Component)
 * - แผงสีเขียวด้านซ้ายของหน้า Auth (Login/Register/Forgot/Reset Password)
 * - ยืดความสูงเต็มคอลัมน์เสมอ ด้วย flex stretch ตามธรรมชาติ (ไม่ล็อก h-full ทับ)
 */
export function AuthAside({
  title = 'ตรวจสอบกล่องข้อความ',
  description = 'ระบบส่งลิงก์ยืนยันตัวตนความปลอดภัยสูงไปยังกล่องข้อความของคุณแล้ว เพื่อป้องกันสแปมและดูแลความเป็นส่วนตัวให้แก่สมาชิกในเครือข่ายสูงสุด',
}: AuthAsideProps) {
  return (
    <aside className="relative hidden min-h-screen w-full flex-col justify-between overflow-hidden bg-primary px-10 py-8 text-primary-foreground md:flex md:w-[38%] lg:w-[35%]">
      {/* โลโก้แบรนด์ ขยายขนาดให้เด่นขึ้น */}
      <div className="flex items-center gap-3">
        <Image
          src="/logo.png"
          alt="PAWND"
          width={64}
          height={64}
          className="size-16 rounded-full"
        />
        <span className="text-3xl font-bold">PAWND</span>
      </div>

      {/* ภาพประกอบ + ข้อความหลักตรงกลาง */}
      <div className="flex flex-col items-center gap-8 text-center">
        <div className="flex aspect-square w-full max-w-[260px] items-center justify-center rounded-3xl bg-primary-foreground/10 p-8">
          <AuthAsideIllustration />
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
