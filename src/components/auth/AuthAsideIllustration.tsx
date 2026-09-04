'use client';

import { DotLottieReact } from '@lottiefiles/dotlottie-react';

import petHugAnimation from '@/components/common/pet-hug-animation.json';

/**
 * AuthAsideIllustration (Client Component)
 * - แสดงแอนิเมชัน Pet Hug ชุดเดียวกับหน้า Loading (PetHugLoader) เพื่อความสอดคล้องของแบรนด์
 * - แยกเป็น Client Component ย่อย เพื่อไม่ให้ AuthAside (Server Component) ต้องกลายเป็น Client ทั้งไฟล์
 */
export function AuthAsideIllustration() {
  return (
    <DotLottieReact
      data={petHugAnimation}
      loop
      autoplay
      className="h-full w-full object-contain"
    />
  );
}
