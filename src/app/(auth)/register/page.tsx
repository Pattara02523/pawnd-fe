import { Metadata } from 'next';
import { AuthEntryLayout } from '@/components/auth/auth-entry-layout';
import { RegisterForm } from './_components/register-form';

export const metadata: Metadata = { title: 'Register' };

/** หน้า Register แบบ Server Component ใช้โครงดีไซน์ร่วมกันและฟอร์มเดิม */
export default function RegisterPage() {
  return (
    <AuthEntryLayout>
      {/* ส่วนฟอร์มคง validation และขั้นตอนยืนยันตัวตนเดิม */}
      <RegisterForm />
    </AuthEntryLayout>
  );
}
