'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Script from 'next/script';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LineIcon } from './BrandIcons';
import {
  loginWithGoogleAction,
  loginWithLineAction,
} from '@/app/(auth)/login/_actions/login.actions';

/** API ของ Google Identity Services ที่ใช้สร้างปุ่มเลือกบัญชีอย่างเป็นทางการ */
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type: 'standard';
              theme: 'outline';
              size: 'large';
              text: 'signup_with' | 'signin_with';
              shape: 'pill';
              width: number;
              locale: string;
            },
          ) => void;
        };
      };
    };
  }
}

const LINE_STATE_KEY = 'pawnd_line_oauth_state';

/** ข้อมูล callback เฉพาะหน้า Login ส่วน Register ใช้ปุ่มเริ่มต้นชุดเดียวกัน */
interface SocialAuthButtonsProps {
  mode?: 'login' | 'register';
  lineCode?: string | null;
  lineState?: string | null;
  lineError?: string | null;
}

/** ปุ่ม social ที่ไม่ขอ OTP และแสดงข้อผิดพลาดโดยไม่เปิดเผย token หรือข้อมูล provider */
export function SocialAuthButtons({
  mode = 'login',
  lineCode,
  lineState,
  lineError,
}: SocialAuthButtonsProps) {
  const router = useRouter();
  // เก็บ DOM ของปุ่ม Google และ callback ที่ประมวลผลแล้วเพื่อป้องกันแลก code ซ้ำ
  const googleContainer = useRef<HTMLDivElement>(null);
  const processedCallback = useRef<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [lineStarting, setLineStarting] = useState(false);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const lineChannelId = process.env.NEXT_PUBLIC_LINE_CHANNEL_ID;

  /** ส่ง token ไปตรวจฝั่ง server และให้ Server Action สร้าง session เมื่อสำเร็จ */
  const handleGoogleCredential = useCallback((credential: string) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await loginWithGoogleAction(credential);
        if (!result) return;
        if (!result.success) setMessage(result.message);
      } catch (error) {
        // ให้ Next.js ดำเนินการ redirect หลัง Server Action สำเร็จ ไม่กลืนเป็นข้อผิดพลาดล็อกอิน
        unstable_rethrow(error);
        setMessage('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    });
  }, []);

  // เมื่อ SDK พร้อม สร้างปุ่มจริงแทนการใช้ One Tap เป็นปุ่มล็อกอิน
  useEffect(() => {
    if (
      !googleReady ||
      !googleClientId ||
      !window.google ||
      !googleContainer.current
    )
      return;
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response) => handleGoogleCredential(response.credential),
    });
    const container = googleContainer.current;
    // วาดปุ่มใหม่เมื่อกรอบเปลี่ยนขนาด ให้กว้างเท่ากับ LINE ทั้งมือถือและ Desktop
    const renderGoogleButton = () => {
      container.replaceChildren();
      window.google?.accounts.id.renderButton(container, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: mode === 'register' ? 'signup_with' : 'signin_with',
        shape: 'pill',
        width: Math.min(container.clientWidth, 400),
        locale: 'th',
      });
    };
    renderGoogleButton();
    const observer = new ResizeObserver(renderGoogleButton);
    observer.observe(container);
    return () => {
      observer.disconnect();
      container.replaceChildren();
    };
  }, [googleReady, googleClientId, handleGoogleCredential, mode]);

  // ตรวจ state และอายุของคำขอก่อนส่ง authorization code ไป Backend ทุกครั้ง
  useEffect(() => {
    const callbackId = lineCode || lineError;
    if (!callbackId || processedCallback.current === callbackId) return;
    processedCallback.current = callbackId;
    router.replace('/login');
    startTransition(async () => {
      try {
        const raw = sessionStorage.getItem(LINE_STATE_KEY);
        sessionStorage.removeItem(LINE_STATE_KEY);
        const saved: unknown = raw ? JSON.parse(raw) : null;
        if (
          !saved ||
          typeof saved !== 'object' ||
          !('state' in saved) ||
          !('createdAt' in saved) ||
          typeof saved.createdAt !== 'number' ||
          saved.state !== lineState ||
          !lineState ||
          Date.now() - saved.createdAt > 10 * 60 * 1000
        ) {
          setMessage(
            'คำขอเข้าสู่ระบบหมดอายุหรือไม่ถูกต้อง กรุณากด LINE อีกครั้ง',
          );
          return;
        }
        if (lineError) {
          setMessage(
            'การเข้าสู่ระบบด้วย LINE ถูกยกเลิกหรือไม่สำเร็จ กรุณาลองใหม่',
          );
          return;
        }
        if (!lineCode) return;
        const result = await loginWithLineAction(
          lineCode,
          `${window.location.origin}/login`,
        );
        if (!result) return;
        if (!result.success) setMessage(result.message);
      } catch (error) {
        unstable_rethrow(error);
        setMessage('เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    });
  }, [lineCode, lineState, lineError, router]);

  /** เริ่ม LINE OAuth พร้อม state แบบสุ่มและ redirect กลับโดเมนที่กำลังใช้งาน */
  const handleLineClick = () => {
    if (!lineChannelId) return;
    setMessage(null);
    try {
      const state = crypto.randomUUID();
      sessionStorage.setItem(
        LINE_STATE_KEY,
        JSON.stringify({ state, createdAt: Date.now() }),
      );
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: lineChannelId,
        redirect_uri: `${window.location.origin}/login`,
        state,
        scope: 'profile openid email',
      });
      setLineStarting(true);
      window.location.assign(
        `https://access.line.me/oauth2/v2.1/authorize?${params}`,
      );
    } catch {
      setLineStarting(false);
      setMessage(
        'ไม่สามารถเริ่มเข้าสู่ระบบได้ กรุณาอนุญาตพื้นที่จัดเก็บของเบราว์เซอร์แล้วลองใหม่',
      );
    }
  };

  return (
    <div
      className="mx-auto flex w-full max-w-[400px] flex-col gap-4 [&_[data-slot=button]]:min-h-10 [&_[data-slot=button]]:rounded-full"
      aria-busy={isPending || lineStarting}
    >
      {/* โหลด SDK ที่ทั้งสองหน้าใช้ร่วมกัน รองรับกลับมาใช้สคริปต์ที่โหลดไว้แล้ว */}
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setGoogleReady(true)}
        onError={() => setGoogleFailed(true)}
      />
      {message && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
        >
          {message}
        </p>
      )}
      {isPending && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          กำลังเข้าสู่ระบบ...
        </p>
      )}
      <div
        inert={isPending || lineStarting}
        className="flex min-h-11 justify-center"
        ref={googleContainer}
      />
      {!googleClientId || googleFailed ? (
        <p className="text-center text-sm text-muted-foreground">
          Google ยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง
        </p>
      ) : (
        !googleReady && (
          <p
            role="status"
            className="text-center text-sm text-muted-foreground"
          >
            กำลังโหลด Google...
          </p>
        )
      )}
      {/* ปุ่ม LINE คงสีแบรนด์และขนาดเดิม พร้อมป้องกันการกดซ้ำ */}
      <Button
        type="button"
        size="lg"
        disabled={!lineChannelId || isPending || lineStarting}
        onClick={handleLineClick}
        className="h-10 min-h-10! w-full bg-[#06C755] text-white hover:bg-[#05b34c]"
      >
        <LineIcon className="size-4" />
        {lineStarting
          ? 'กำลังเปิด LINE...'
          : mode === 'register'
            ? 'สมัครใช้งานด้วย LINE'
            : 'เข้าสู่ระบบด้วย LINE'}
      </Button>
      {!lineChannelId && (
        <p className="text-center text-sm text-muted-foreground">
          LINE ยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง
        </p>
      )}
    </div>
  );
}
