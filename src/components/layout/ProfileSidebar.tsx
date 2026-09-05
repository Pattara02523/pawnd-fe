'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  User,
  Heart,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserProfile } from '@/types/user';
import { useSession } from 'next-auth/react';
import { logoutAction } from '@/lib/action/logout.actions';
import { UserAvatar } from '@/components/common/UserAvatar';

interface ProfileSidebarProps {
  user: UserProfile;
}

/**
 * รายการเมนูหลักในระบบโปรไฟล์
 */
const PROFILE_NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'แดชบอร์ด',
    icon: LayoutDashboard,
  },
  {
    href: '/profile',
    label: 'โปรไฟล์ผู้ใช้',
    icon: User,
  },
  {
    href: '/profile/pets',
    label: 'โปรไฟล์สัตว์เลี้ยง',
    icon: Heart,
  },
  {
    href: '/profile/settings',
    label: 'ตั้งค่าระบบ',
    icon: Settings,
  },
];

/**
 * ProfileSidebar Component (Client Component)
 * - บน Desktop: Sidebar ด้านซ้ายที่กดย่อ-ขยายเข้าออกได้ (Collapsible Sidebar)
 * - บน Mobile: แถบแท็บแนวนอนด้านบน (Mobile Tab Bar) พร้อมปุ่ม Drawer สไลด์เปิดเมนูผู้ใช้เต็มรูปแบบ
 * - แสดงสถานะ Active Highlight สวยงามทุกหน้าจอ
 */
export function ProfileSidebar({ user: initialUser }: ProfileSidebarProps) {
  const pathname = usePathname();
  // อ่านชื่อและรูปจาก session เดียวกับ Header
  const { data: session } = useSession();
  const user = session?.user ?? initialUser;

  // State ย่อ-ขยาย Sidebar บน Desktop (True = ขยายเต็ม, False = ย่อเหลือกะทัดรัด)
  const [isExpanded, setIsExpanded] = useState(true);

  // State เปิด-ปิด Drawer บน Mobile
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const toggleSidebar = () => {
    setIsExpanded((prev) => !prev);
  };

  const handleLogout = async () => {
    await logoutAction();
  };

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. แถบแท็บแนวนอนบนหน้าจอมือถือ (Mobile Horizontal Tab Bar - แสดงเฉพาะ < md) */}
      {/* ========================================================================= */}
      <div className="flex flex-col border-b border-border/70 bg-card/80 backdrop-blur-md md:hidden">
        {/* แถบด้านบน: Avatar ผู้ใช้ + ปุ่มเปิด Drawer */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="flex items-center gap-2.5 rounded-2xl p-1 text-left transition-colors hover:bg-muted"
          >
            <div className="relative size-9 overflow-hidden rounded-full ring-2 ring-primary/30">
              <UserAvatar
                src={user.avatarUrl}
                alt={`${user.firstName} ${user.lastName}`}
                sizes="36px"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-foreground line-clamp-1">
                คุณ{user.firstName} {user.lastName}
              </span>
              <span className="text-[10px] font-semibold text-primary">
                {user.role}
              </span>
            </div>
          </button>

          {/* ปุ่มเปิดเมนู Drawer */}
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="flex size-9 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="เปิดเมนูบัญชี"
          >
            <Menu className="size-4.5" />
          </button>
        </div>

        {/* แถบแท็บ 4 เมนูแนวนอน (Scrollable Horizontal Tabs) */}
        <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2 no-scrollbar">
          {PROFILE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard' || pathname === '/profile/dashboard'
                : item.href === '/profile'
                  ? pathname === '/profile'
                  : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. เมนู Drawer สไลด์ออกบนหน้าจอมือถือ (Mobile Off-Canvas Drawer) */}
      {/* ========================================================================= */}
      {isMobileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
          onClick={() => setIsMobileDrawerOpen(false)}
        >
          <div
            className="relative flex h-full w-[280px] max-w-[80vw] flex-col border-r border-border bg-card p-5 shadow-2xl transition-transform animate-in slide-in-from-left duration-250"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ปุ่มปิด Drawer */}
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(false)}
              className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="ปิดเมนู"
            >
              <X className="size-5" />
            </button>

            {/* ข้อมูลโปรไฟล์ใน Drawer */}
            <div className="flex flex-col items-center border-b border-border/60 pb-5 pt-2">
              <div className="relative size-18 overflow-hidden rounded-full ring-3 ring-primary/30 shadow-md">
                <UserAvatar
                  src={user.avatarUrl}
                  alt={`${user.firstName} ${user.lastName}`}
                  sizes="72px"
                />
              </div>
              <h3 className="mt-3 text-base font-bold text-foreground">
                คุณ {user.firstName} {user.lastName}
              </h3>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                <ShieldCheck className="size-3" />
                {user.role}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>

            {/* รายการเมนูใน Drawer */}
            <nav className="mt-4 flex flex-1 flex-col gap-1.5">
              {PROFILE_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === '/profile'
                    ? pathname === '/profile'
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileDrawerOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary/15 font-semibold text-primary'
                        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              {/* ปุ่มออกจากระบบใน Drawer */}
              <div className="mt-auto border-t border-border/50 pt-4">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="size-4.5" />
                  <span>ออกจากระบบ</span>
                </button>
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. Sidebar เต็มรูปแบบบน Desktop (แสดงเฉพาะหน้าจอ >= md) */}
      {/* ========================================================================= */}
      <aside
        className={cn(
          'relative hidden md:flex min-h-[calc(100vh-4rem)] flex-col border-r border-border/70 bg-card/60 transition-all duration-300 ease-in-out dark:bg-card/40 backdrop-blur-xs',
          isExpanded ? 'w-64 sm:w-72 p-5' : 'w-20 p-3 items-center',
        )}
        aria-label="เมนูโปรไฟล์ผู้ใช้งาน"
      >
        {/* ปุ่ม Toggle ย่อ-ขยาย Sidebar บริเวณขอบขวา */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="absolute -right-3.5 top-7 z-20 flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition-transform hover:scale-110 hover:text-foreground"
          aria-label={isExpanded ? 'ย่อแถบเมนูข้าง' : 'ขยายแถบเมนูข้าง'}
          title={isExpanded ? 'ย่อเมนู' : 'ขยายเมนู'}
        >
          {isExpanded ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>

        {/* ส่วนหัวโปรไฟล์ผู้ใช้ (คลิกที่รูป Icon เพื่อย่อ-ขยายได้) */}
        <div
          className={cn(
            'flex flex-col items-center border-b border-border/60 pb-6 transition-all',
            !isExpanded && 'pb-4',
          )}
        >
          <button
            type="button"
            onClick={toggleSidebar}
            className="group relative flex items-center justify-center rounded-full ring-3 ring-primary/20 transition-all hover:scale-105 hover:ring-primary/50 focus:outline-none"
            title="กดที่รูปโปรไฟล์เพื่อย่อ-ขยายเมนูข้าง"
          >
            <div
              className={cn(
                'relative overflow-hidden rounded-full transition-all',
                isExpanded ? 'size-20' : 'size-12',
              )}
            >
              <UserAvatar
                src={user.avatarUrl}
                alt={`${user.firstName} ${user.lastName}`}
                sizes={isExpanded ? '80px' : '48px'}
                priority
              />
            </div>
          </button>

          {isExpanded && (
            <div className="mt-3.5 flex flex-col items-center text-center">
              <h3 className="text-base font-bold text-foreground">
                คุณ {user.firstName} {user.lastName}
              </h3>
              <div className="mt-1 flex items-center gap-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-primary">
                  <ShieldCheck className="size-3" />
                  {user.role}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* รายการเมนูนำทางหลัก 5 เมนู */}
        <nav className="mt-6 flex flex-1 flex-col gap-2">
          {PROFILE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard' || pathname === '/profile/dashboard'
                : item.href === '/profile'
                  ? pathname === '/profile'
                  : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center rounded-2xl transition-all duration-200',
                  isExpanded
                    ? 'gap-3.5 px-4 py-3 text-sm font-medium'
                    : 'justify-center p-3',
                  isActive
                    ? 'bg-primary/15 font-semibold text-primary shadow-2xs dark:bg-primary/20'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
                title={!isExpanded ? item.label : undefined}
              >
                <Icon
                  className={cn(
                    'shrink-0 transition-transform group-hover:scale-110',
                    isExpanded ? 'size-5' : 'size-5.5',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
                {isExpanded && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}

          {/* ปุ่มออกจากระบบ (Logout) */}
          <div className="mt-auto border-t border-border/50 pt-4">
            <button
              type="button"
              onClick={handleLogout}
              className={cn(
                'group flex w-full items-center rounded-2xl text-destructive transition-all duration-200 hover:bg-destructive/10 hover:text-destructive',
                isExpanded
                  ? 'gap-3.5 px-4 py-3 text-sm font-medium'
                  : 'justify-center p-3',
              )}
              title={!isExpanded ? 'ออกจากระบบ' : undefined}
            >
              <LogOut className="size-5 shrink-0 transition-transform group-hover:scale-110" />
              {isExpanded && <span>ออกจากระบบ</span>}
            </button>
          </div>
        </nav>
      </aside>
    </>
  );
}
