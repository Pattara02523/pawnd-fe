'use server';

import { redirect } from 'next/navigation';

import { signIn } from '@/auth';
import { ApiError } from '@/lib/api/api-error';
import { ErrorActionResult } from '@/lib/api/types/action.type';
import {
  loginRequest,
  verifyTwoFactorRequest,
  loginWithGoogleRequest,
  loginWithLineRequest,
  resendTwoFactorRequest,
  LoginPayload,
  VerifyTwoFactorPayload,
  ResendTwoFactorPayload,
  getMeRequest,
} from '@/services/auth.service';

import {
  isOtpRequired,
  isLoginTokensResponse,
  LoginTokensResponse,
} from '@/types/auth';

type LoginActionResult =
  | ErrorActionResult
  | { success: true; needsOtp: true; tempToken: string }
  | { success: true; needsOtp: false };

function toErrorResult(err: unknown, fallback: string): ErrorActionResult {
  if (err instanceof ApiError) {
    return {
      success: false,
      message: err.message,
      code: String(err.statusCode),
    };
  }
  return { success: false, message: fallback, code: 'UNKNOWN' };
}

async function establishSession(tokens: LoginTokensResponse) {
  await signIn('credentials', {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: JSON.stringify(tokens.user),
    redirect: false,
  });
}

export async function loginAction(
  payload: LoginPayload,
): Promise<LoginActionResult> {
  let response;
  try {
    response = await loginRequest(payload);
  } catch (err) {
    return toErrorResult(err, 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }

  if (isOtpRequired(response)) {
    return { success: true, needsOtp: true, tempToken: response.tempToken };
  }

  await establishSession(response);
  redirect('/');
}

/** ตรวจ Google token ผ่าน Backend แล้วเปิด session โดยไม่เข้าเส้นทาง OTP */
export async function loginWithGoogleAction(
  idToken: string,
): Promise<ErrorActionResult> {
  let response;
  try {
    response = await loginWithGoogleRequest({ idToken });
  } catch (err) {
    return toErrorResult(
      err,
      'เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    );
  }
  if (!isLoginTokensResponse(response))
    return {
      success: false,
      code: 'SOCIAL_RESPONSE_INVALID',
      message: 'ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
    };
  await establishSession(response);
  redirect('/');
}

/** แลก LINE code แล้วสร้าง session เฉพาะเมื่อ Backend ส่งผลล็อกอินที่สมบูรณ์ */
export async function loginWithLineAction(
  code: string,
  redirectUri: string,
): Promise<ErrorActionResult> {
  let response;
  try {
    response = await loginWithLineRequest({ code, redirectUri });
  } catch (err) {
    return toErrorResult(
      err,
      'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    );
  }
  if (!isLoginTokensResponse(response))
    return {
      success: false,
      code: 'SOCIAL_RESPONSE_INVALID',
      message: 'ระบบเข้าสู่ระบบยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
    };
  await establishSession(response);
  redirect('/');
}

export async function verifyLoginOtpAction(
  payload: VerifyTwoFactorPayload,
): Promise<LoginActionResult> {
  let tokens;
  try {
    tokens = await verifyTwoFactorRequest(payload);
  } catch (err) {
    return toErrorResult(err, 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ');
  }

  let me;
  try {
    me = await getMeRequest(tokens.accessToken);
  } catch (err) {
    return toErrorResult(
      err,
      'ไม่สามารถโหลดข้อมูลผู้ใช้ได้ กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง',
    );
  }

  await establishSession({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: me.user,
  });

  redirect('/');
}

export async function resendTwoFactorAction(
  payload: ResendTwoFactorPayload,
): Promise<ErrorActionResult | { success: true }> {
  try {
    await resendTwoFactorRequest(payload);
  } catch (err) {
    return toErrorResult(
      err,
      'ส่งรหัสยืนยันใหม่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    );
  }

  return { success: true };
}
