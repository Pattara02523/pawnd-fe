import { Suspense } from 'react';
import { Metadata } from 'next';
import { AuthEntryLayout } from '@/components/auth/auth-entry-layout';
import { LoginForm } from './_components/login-form';

export const metadata: Metadata = { title: 'Login' };

/** หน้า Login แบบ Server Component ใช้โครงดีไซน์ร่วมกันและฟอร์มเดิม */
export default function LoginPage() {
  return (
    <AuthEntryLayout>
      {/* ส่วนฟอร์มคง validation และขั้นตอนยืนยันตัวตนเดิม */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthEntryLayout>
  );
}
