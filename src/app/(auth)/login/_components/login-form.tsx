'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SocialAuthButtons } from '@/components/auth/social-auth-buttons';
import { OtpBoxes } from '@/components/auth/OtpBoxes';
import { useResendCooldown } from '@/hooks/use-resend-cooldown';

import {
  loginAction,
  verifyLoginOtpAction,
  resendTwoFactorAction,
} from '../_actions/login.actions';

const loginSchema = z.object({
  email: z.string().min(1, 'กรุณากรอกอีเมล').email('รูปแบบอีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

type LoginValues = z.infer<typeof loginSchema>;

/** ฟอร์มรหัสผ่านคง OTP เดิม ส่วน social ใช้คอมโพเนนต์ร่วมที่ไม่ขอ OTP */
export function LoginForm() {
  const searchParams = useSearchParams();
  // ขั้นตอน OTP นี้ใช้เฉพาะอีเมลและรหัสผ่าน
  const [step, setStep] = useState<'login' | 'otp'>('login');
  const [tempToken, setTempToken] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isResending, startResendTransition] = useTransition();
  const resendCooldown = useResendCooldown(60);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await loginAction(values);

    if (!result.success) {
      setFormError(result.message);
      return;
    }
    if (result.needsOtp) {
      setTempToken(result.tempToken);
      setStep('otp');
      resendCooldown.start();
    }
  });

  const handleVerifyOtp = () => {
    setOtpError(null);
    if (otp.length !== 6) {
      setOtpError('กรุณากรอกรหัส OTP ให้ครบ 6 หลัก');
      return;
    }
    startTransition(async () => {
      const result = await verifyLoginOtpAction({ tempToken, otp });
      if (!result.success) {
        setOtpError(result.message);
      }
    });
  };

  const handleResendTwoFactorOtp = () => {
    setResendMessage(null);
    setOtpError(null);
    startResendTransition(async () => {
      const result = await resendTwoFactorAction({ tempToken });
      if (!result.success) {
        setOtpError(result.message);
        return;
      }
      setResendMessage('ส่งรหัสยืนยันใหม่แล้ว กรุณาตรวจสอบอีเมลของคุณ');
      resendCooldown.start();
    });
  };

  if (step === 'otp') {
    return (
      <div className="flex w-full flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            ยืนยันการเข้าสู่ระบบ
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            เราได้ส่งรหัส OTP ไปยังอีเมลของคุณ กรุณากรอกรหัส 6
            หลักเพื่อเข้าสู่ระบบ
          </p>
        </div>

        <OtpBoxes value={otp} onChange={setOtp} />

        {otpError && <p className="text-sm text-destructive">{otpError}</p>}
        {resendMessage && (
          <p className="text-sm text-primary">{resendMessage}</p>
        )}

        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={isPending}
          onClick={handleVerifyOtp}
        >
          {isPending ? 'กำลังยืนยัน...' : 'ยืนยันรหัส OTP'}
        </Button>

        <button
          type="button"
          onClick={handleResendTwoFactorOtp}
          disabled={isResending || resendCooldown.isActive}
          className="text-center text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isResending
            ? 'กำลังส่ง...'
            : resendCooldown.isActive
              ? `ส่งรหัสยืนยันอีกครั้งใน ${resendCooldown.remaining} วินาที`
              : 'ส่งรหัสยืนยันอีกครั้ง'}
        </button>

        <button
          type="button"
          onClick={() => setStep('login')}
          className="text-center text-sm text-muted-foreground hover:text-foreground"
        >
          ← กลับไปเข้าสู่ระบบใหม่
        </button>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ยินดีต้อนรับกลับมา!
            กรุณากรอกข้อมูลเพื่อเข้าสู่ระบบตามหาสัตว์เลี้ยงหาย
          </p>
        </div>

        {formError && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">อีเมล</Label>
          <Input
            id="email"
            type="email"
            placeholder="example@email.com"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">รหัสผ่าน</Label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary hover:underline"
            >
              ลืมรหัสผ่าน?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="กรอกรหัสผ่านของคุณ"
              className="pr-10"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </Button>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">หรือ</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* Social callback รับจาก LINE ส่วน Google ใช้ปุ่มมาตรฐาน */}
        <SocialAuthButtons
          lineCode={searchParams.get('code')}
          lineState={searchParams.get('state')}
          lineError={searchParams.get('error')}
        />

        <p className="text-center text-sm text-muted-foreground">
          ยังไม่มีบัญชี?{' '}
          <Link
            href="/register"
            className="font-medium text-primary hover:underline"
          >
            สมัครสมาชิก
          </Link>
        </p>
      </form>
    </>
  );
}
