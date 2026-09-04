'use server';

import { ApiError } from '@/lib/api/api-error';
import { ErrorActionResult } from '@/lib/api/types/action.type';
import { registerRequest, RegisterPayload } from '@/services/auth.service';

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

type RegisterActionResult = ErrorActionResult | { success: true };

export async function registerAction(
  payload: RegisterPayload,
): Promise<RegisterActionResult> {
  try {
    await registerRequest(payload);
  } catch (err) {
    console.error('[registerAction Error]:', err);
    return toErrorResult(err, 'สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }

  return { success: true };
}
