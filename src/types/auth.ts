export type UserRole = 'USER' | 'ADMIN';

export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
}

export interface LoginTokensResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

/** ตรวจผล social ที่สำเร็จก่อนเปิด session และปฏิเสธ response เก่าหรือผิดรูปแบบ */
export function isLoginTokensResponse(
  response: unknown,
): response is LoginTokensResponse {
  if (
    !response ||
    typeof response !== 'object' ||
    !('accessToken' in response) ||
    typeof response.accessToken !== 'string' ||
    !response.accessToken ||
    !('refreshToken' in response) ||
    typeof response.refreshToken !== 'string' ||
    !response.refreshToken ||
    !('user' in response)
  )
    return false;
  const user = response.user;
  return (
    !!user &&
    typeof user === 'object' &&
    'id' in user &&
    typeof user.id === 'string' &&
    !!user.id &&
    'email' in user &&
    typeof user.email === 'string' &&
    'firstName' in user &&
    typeof user.firstName === 'string' &&
    'lastName' in user &&
    typeof user.lastName === 'string' &&
    'role' in user &&
    (user.role === 'USER' || user.role === 'ADMIN') &&
    'avatarUrl' in user &&
    (user.avatarUrl === null || typeof user.avatarUrl === 'string')
  );
}

export interface LoginOtpRequiredResponse {
  tempToken: string;
  type: 'OTP_REQUIRED';
  message: string;
}

export interface LineEmailRequiredResponse {
  tempToken: string;
  type: 'LINE_EMAIL_REQUIRED';
  message: string;
}

export interface PendingEmailVerificationResponse {
  email: string;
  message: string;
}

type AnyLoginResult =
  | LoginTokensResponse
  | LoginOtpRequiredResponse
  | LineEmailRequiredResponse
  | PendingEmailVerificationResponse;

export type LoginResponse = LoginTokensResponse | LoginOtpRequiredResponse;

export type GoogleLoginResponse =
  | LoginTokensResponse
  | LoginOtpRequiredResponse
  | PendingEmailVerificationResponse;

export type LineLoginResponse = AnyLoginResult;

export function isOtpRequired(
  response: AnyLoginResult,
): response is LoginOtpRequiredResponse {
  return 'type' in response && response.type === 'OTP_REQUIRED';
}

export function isLineEmailRequired(
  response: AnyLoginResult,
): response is LineEmailRequiredResponse {
  return 'type' in response && response.type === 'LINE_EMAIL_REQUIRED';
}

export function isPendingEmailVerification(
  response: AnyLoginResult,
): response is PendingEmailVerificationResponse {
  // แยกผลรอยืนยันออกจากผลที่มี accessToken เพื่อไม่ให้ล็อกอินสำเร็จถูกตีความผิด
  return (
    'email' in response &&
    'message' in response &&
    !('accessToken' in response) &&
    !('tempToken' in response)
  );
}
