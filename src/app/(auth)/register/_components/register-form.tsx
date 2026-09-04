'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleIcon, LineIcon } from '@/components/auth/BrandIcons';
import { OtpBoxes } from '@/components/auth/OtpBoxes';
import { useResendCooldown } from '@/hooks/use-resend-cooldown';
import { cn } from '@/lib/utils';
import { registerAction } from '../_actions/register.actions';
import {
  verifyEmailAction,
  resendVerificationAction,
} from '@/lib/action/verify-email.actions';
import { useRouter } from 'next/navigation';

const registerSchema = z
  .object({
    firstName: z.string().min(1, 'กรุณากรอกชื่อจริง'),
    lastName: z.string().min(1, 'กรุณากรอกนามสกุล'),
    email: z.string().min(1, 'กรุณากรอกอีเมล').email('รูปแบบอีเมลไม่ถูกต้อง'),
    password: z.string().min(8, 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร'),
    confirmPassword: z.string().min(1, 'กรุณายืนยันรหัสผ่าน'),
    terms: z.boolean().refine((val) => val === true, {
      message: 'กรุณายอมรับข้อกำหนดในการให้บริการ',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'รหัสผ่านยืนยันไม่ตรงกัน',
    path: ['confirmPassword'],
  });

type RegisterValues = z.infer<typeof registerSchema>;

function PasswordInput({
  className,
  ref,
  ...props
}: React.ComponentProps<'input'>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn('pr-10', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
      >
        {visible ? (
          <EyeOff className="size-3.5" />
        ) : (
          <Eye className="size-3.5" />
        )}
      </button>
    </div>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<'register' | 'otp'>('register');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isResending, startResendTransition] = useTransition();
  // ตัวนับถอยหลังก่อนอนุญาตให้กดขอ OTP ใหม่อีกครั้ง
  const resendCooldown = useResendCooldown(60);

  const {
    register,
    handleSubmit,
    control,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      terms: false,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await registerAction({
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      password: values.password,
    });

    if (!result.success) {
      setFormError(result.message);
      return;
    }

    setRegisteredEmail(values.email);
    setStep('otp');
    resendCooldown.start();
  });

  const handleVerifyOtp = () => {
    setOtpError(null);
    if (otp.length !== 6) {
      setOtpError('กรุณากรอกรหัส OTP ให้ครบ 6 หลัก');
      return;
    }
    startTransition(async () => {
      const result = await verifyEmailAction({ email: registeredEmail, otp });
      if (!result.success) {
        setOtpError(result.message);
      }
    });
  };

  const handleResendOtp = () => {
    setResendMessage(null);
    setOtpError(null);
    startResendTransition(async () => {
      const result = await resendVerificationAction({
        email: registeredEmail,
      });
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
            ยืนยันอีเมลของคุณ
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            เราได้ส่งรหัส OTP ไปยัง {registeredEmail} กรุณากรอกรหัส 6
            หลักเพื่อยืนยันบัญชี
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
          {isPending ? 'กำลังยืนยัน...' : 'ยืนยันอีเมล'}
        </Button>

        <button
          type="button"
          onClick={handleResendOtp}
          disabled={isResending || resendCooldown.isActive}
          className="text-center text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isResending
            ? 'กำลังส่ง...'
            : resendCooldown.isActive
              ? `ส่งรหัสยืนยันอีกครั้งใน ${resendCooldown.remaining} วินาที`
              : 'ส่งรหัสยืนยันอีกครั้ง'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">สมัครสมาชิก</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ร่วมสร้างคอมมูนิตี้สี่ขาแสนอบอุ่นกับเรา 💚
        </p>
      </div>

      {formError && (
        <div className="flex flex-col gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <p>{formError}</p>
          {/* ปุ่มช่วยเหลือกรณีผู้ใช้เคยสมัครไว้แล้วหรือข้อมูลลง DB แล้วแต่ยังไม่ได้ยืนยัน OTP */}
          <button
            type="button"
            className="self-start text-xs font-semibold text-primary underline hover:opacity-80 cursor-pointer"
            onClick={() => {
              const currentEmail = getValues('email') || registeredEmail;
              if (currentEmail) {
                setRegisteredEmail(currentEmail);
                setStep('otp');
                resendCooldown.start();
              }
            }}
          >
            เคยสมัครแล้วแต่ยังไม่ได้ยืนยันรหัส OTP? คลิกที่นี่เพื่อกรอก OTP หรือขอรหัสใหม่
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">ชื่อ</Label>
          <Input
            id="firstName"
            placeholder="กรอกชื่อจริง"
            aria-invalid={!!errors.firstName}
            {...register('firstName')}
          />
          {errors.firstName && (
            <p className="text-xs text-destructive">
              {errors.firstName.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastName">นามสกุล</Label>
          <Input
            id="lastName"
            placeholder="กรอกนามสกุล"
            aria-invalid={!!errors.lastName}
            {...register('lastName')}
          />
          {errors.lastName && (
            <p className="text-xs text-destructive">
              {errors.lastName.message}
            </p>
          )}
        </div>
      </div>

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
        <Label htmlFor="password">รหัสผ่าน</Label>
        <PasswordInput
          id="password"
          placeholder="อย่างน้อย 8 ตัวอักษร"
          aria-invalid={!!errors.password}
          {...register('password')}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">ยืนยันรหัสผ่าน</Label>
        <PasswordInput
          id="confirmPassword"
          placeholder="กรอกรหัสผ่านอีกครั้ง"
          aria-invalid={!!errors.confirmPassword}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <Controller
        control={control}
        name="terms"
        render={({ field }) => (
          <div className="flex flex-col gap-1">
            <Label htmlFor="terms" className="items-start gap-2 font-normal">
              <Checkbox
                id="terms"
                checked={field.value}
                onCheckedChange={field.onChange}
                className="mt-0.5"
              />
              <span className="text-sm text-muted-foreground">
                ฉันยอมรับ ข้อกำหนดในการให้บริการ และนโยบายความเป็นส่วนตัว
              </span>
            </Label>
            {errors.terms && (
              <p className="text-xs text-destructive">{errors.terms.message}</p>
            )}
          </div>
        )}
      />

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'กำลังสมัครสมาชิก...' : 'สร้างบัญชี'}
      </Button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">หรือ</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => router.push('/login')}
      >
        <GoogleIcon className="size-4" />
        สมัครใช้งานด้วย Google
      </Button>

      <Button
        type="button"
        size="lg"
        className="w-full bg-[#06C755] text-white hover:bg-[#05b34c]"
        onClick={() => router.push('/login')}
      >
        <LineIcon className="size-4" />
        สมัครใช้งานด้วย LINE
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        มีบัญชีอยู่แล้ว?{' '}
        <Link
          href="/login"
          className="font-medium text-primary hover:underline"
        >
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  );
}
