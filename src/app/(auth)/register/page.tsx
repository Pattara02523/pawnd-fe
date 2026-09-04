import { Metadata } from 'next';
import Image from 'next/image';

import { AuthAside } from '@/components/auth/AuthAside';

import { RegisterForm } from './_components/register-form';

export const metadata: Metadata = {
  title: 'Register',
};

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen w-full">
      <AuthAside
        title="ยินดีต้อนรับสู่ PAWND"
        description="แพลตฟอร์มช่วยตามหาสัตว์เลี้ยงหาย ด้วยพลัง AI จับคู่แม่นยำ พร้อมชุมชนคนรักสัตว์ที่พร้อมช่วยเหลือกันตลอด 24 ชั่วโมง"
      />

      <div className="flex w-full flex-1 flex-col">
        <div className="flex items-center gap-3 px-8 py-6">
          <Image
            src="/logo.png"
            alt="PAWND"
            width={44}
            height={44}
            className="size-11 rounded-full"
          />
          <span className="text-2xl font-bold text-foreground">PAWND</span>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-12">
          <div className="w-full max-w-sm">
            <RegisterForm />
          </div>
        </div>
      </div>
    </div>
  );
}
