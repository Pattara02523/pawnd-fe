'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { io } from 'socket.io-client';
import {
  Bell,
  Plus,
  Menu as MenuIcon,
  X,
  LayoutDashboard,
  User,
  Heart,
  Settings,
  LogOut,
} from 'lucide-react';

import { HeaderNavigation } from './header-navigation';
import { buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { UserAvatar } from '@/components/common/UserAvatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { logoutAction } from '@/lib/action/logout.actions';
import type { NotificationItem } from '@/types/notification';
import {
  getNotificationIcon,
  getNotificationLink,
  formatNotificationTimeAgo,
} from '@/lib/notification-utils';
import {
  getRecentNotificationsAction,
  markAsReadAction as markNotificationAsReadAction,
  markAllAsReadAction as markAllNotificationsAsReadAction,
} from '@/lib/action/notifications.actions';

/**
 * Header Component (Client Component)
 * - แถบส่วนหัวด้านบนแบบ Sticky Navigation (ติดอยู่ด้านบนเสมอขณะเลื่อนหน้าจอ)
 * - ฝั่งซ้าย: โลโก้แบรนด์ Pawnd
 * - ตรงกลาง: ลิงก์เมนูนำทางหลักบน Desktop (แสดงสถานะ Active Link ตาม pathname)
 *   รวมปุ่ม "แอดมิน" เพิ่มต่อท้ายเฉพาะบัญชีที่ role เป็น ADMIN
 * - ฝั่งขวา: ปุ่มสลับธีม (ThemeToggle), กระดิ่งแจ้งเตือน (Notification, real-time ผ่าน Socket.IO),
 *   ดรอปดาวน์เมนู avatar (แดชบอร์ด/โปรไฟล์/ตั้งค่า/ออกจากระบบ) และปุ่ม "+ แจ้งสัตว์เลี้ยงหาย"
 * - รองรับ Mobile Drawer Menu และ Touch Target ขนาด >= 40x40px ตามมาตรฐาน Mobile-First
 * - สถานะ login เช็คจาก useSession() ของ next-auth/react (ต้องมี <SessionProvider> ครอบใน layout.tsx)
 *   reactive ต่อการเรียก update() จากที่อื่น เช่นตอนเปลี่ยนรูปโปรไฟล์ที่ AvatarUpload
 * - ลิงก์ "หน้าแรก" ชี้ไปที่ / เสมอ ไม่สลับไป /dashboard ตามสถานะ login อีกต่อไป
 *   (ย้ายไปเป็นเมนู "แดชบอร์ด" ในดรอปดาวน์ avatar แทน)
 * - ดรอปดาวน์ avatar เขียนด้วย React state + CSS ล้วนๆ (ไม่ใช้ Base UI Menu/Portal)
 * - จุดแดงแจ้งเตือน: ดึงค่าเริ่มต้นครั้งเดียวผ่าน Server Action ตอน mount
 *   แล้วต่อ Socket.IO (namespace /notifications, auth ผ่าน query.token ตาม Backend contract
 *   เหมือนหน้า Notification) ฟัง event 'notification_count_update' เพื่ออัปเดตแบบ real-time ต่อ
 */
export default function Header() {
  const pathname = usePathname();
  // ดึง session จริงผ่าน useSession() (ต้องมี <SessionProvider> ครอบใน layout.tsx)
  // reactive ต่อการเรียก update() จากที่อื่น เช่นตอนเปลี่ยนรูปโปรไฟล์ที่ AvatarUpload
  const { data: session } = useSession();
  // State สำหรับเปิด/ปิดเมนู Drawer บนมือถือ
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // State ว่ามีการแจ้งเตือนที่ยังไม่อ่านไหม ดึงฝั่ง client หลัง mount แล้วอัปเดตสดผ่าน socket ต่อ
  const [hasUnread, setHasUnread] = useState(false);
  // รายการแจ้งเตือนล่าสุด (สูงสุด 5 รายการ) สำหรับโชว์ preview ใน dropdown กระดิ่ง
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // logic เดียวกับที่ src/middleware.ts ใช้เช็ค route protection —
  // session ที่ refresh token หมดอายุยังมี user object อยู่ แต่ถือว่า logged out
  const isLoggedIn =
    !!session?.user && session.error !== 'RefreshAccessTokenError';
  const user = isLoggedIn ? session!.user : null;
  const accessToken = isLoggedIn ? session!.accessToken : null;
  const isAdmin = user?.role === 'ADMIN';

  // ดึงรายการแจ้งเตือนล่าสุด + จำนวนที่ยังไม่อ่านครั้งแรกตอน mount
  // (ให้ dropdown preview และจุดแดงขึ้นทันทีโดยไม่ต้องรอ socket handshake)
  useEffect(() => {
    if (!isLoggedIn) return;
    let active = true;

    getRecentNotificationsAction(5)
      .then(({ notifications, unreadCount }) => {
        if (!active) return;
        setNotifications(notifications);
        setHasUnread(unreadCount > 0);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isLoggedIn]);

  // ต่อ Socket.IO เพื่ออัปเดตจุดแดงแบบ real-time ต่อจากการดึงครั้งแรกด้านบน
  // (แพทเทิร์นเดียวกับ NotificationsList — auth ผ่าน query.token ไม่ใช่ auth.token แบบ Chat)
  useEffect(() => {
    if (!isLoggedIn || !accessToken) return;

    const socketBaseUrl =
      process.env.NEXT_PUBLIC_PAWND_API_URL || 'http://localhost:8000';
    const namespaceUrl = `${socketBaseUrl.replace(/\/$/, '')}/notifications`;

    const socket = io(namespaceUrl, {
      query: { token: accessToken },
      forceNew: true,
    });

    const handleCountUpdate = (payload: { unreadCount: number }) => {
      setHasUnread(payload.unreadCount > 0);
    };
    const handleNewNotification = (notification: NotificationItem) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 5));
    };

    socket.on('notification_count_update', handleCountUpdate);
    socket.on('new_notification', handleNewNotification);

    return () => {
      socket.off('notification_count_update', handleCountUpdate);
      socket.off('new_notification', handleNewNotification);
      socket.disconnect();
    };
  }, [isLoggedIn, accessToken]);

  const userName = user ? `${user.firstName} ${user.lastName}` : 'ผู้ใช้งาน';

  // กดรายการแจ้งเตือนที่ยังไม่อ่านใน dropdown -> อัปเดต UI ทันที (optimistic) แล้วยิง Server Action ตามหลัง
  const handleNotificationClick = (item: NotificationItem) => {
    if (item.isRead) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
    );
    void markNotificationAsReadAction(item.id);
  };

  // กดปุ่ม "อ่านทั้งหมดแล้ว" ใน dropdown -> อัปเดต UI ทันที แล้วยิง Server Action ตามหลัง
  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setHasUnread(false);
    void markAllNotificationsAsReadAction();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-20 max-w-7xl gap-4 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* 1. โลโก้และชื่อแบรนด์ Pawnd ทางซ้าย */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-90"
        >
          <Image
            src="/logo.png"
            alt="PAWND Logo"
            width={40}
            height={40}
            className="size-10 rounded-full object-contain"
          />
          <span className="text-xl font-bold tracking-tight text-primary">
            Pawnd
          </span>
        </Link>

        {/* 2. เมนูนำทางบนหน้าจอ Desktop (กึ่งกลาง) */}
        <HeaderNavigation pathname={pathname} isAdmin={isAdmin} />

        {/* 3. ส่วนเครื่องมือและข้อมูลผู้ใช้บน Desktop (ทางขวา) */}
        <div className="hidden xl:flex items-center gap-2">
          {/* ปุ่มสลับโหมดมืด / โหมดสว่าง (Dark / Light Theme Toggle) */}
          <ThemeToggle />

          {isLoggedIn ? (
            <>
              {/* ดรอปดาวน์กระดิ่งแจ้งเตือน: โชว์ preview รายการล่าสุด 5 รายการ + จุดแดงเมื่อมีค้างอ่าน */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="การแจ้งเตือน"
                  className="relative flex size-10 min-h-[40px] min-w-[40px] items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground active:scale-95"
                >
                  <Bell className="size-5" />
                  {hasUnread && (
                    <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-destructive ring-2 ring-background" />
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-80 p-0">
                  <div className="flex items-center justify-between px-3.5 py-3">
                    <span className="text-sm font-bold text-foreground">
                      การแจ้งเตือน
                    </span>
                    {hasUnread && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        อ่านทั้งหมดแล้ว
                      </button>
                    )}
                  </div>
                  <DropdownMenuSeparator className="my-0" />

                  {notifications.length === 0 ? (
                    <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">
                      ยังไม่มีการแจ้งเตือน
                    </p>
                  ) : (
                    <div className="max-h-80 overflow-y-auto py-1">
                      {notifications.map((item) => (
                        <DropdownMenuItem
                          key={item.id}
                          href={getNotificationLink(item)}
                          onClick={() => handleNotificationClick(item)}
                          className={cn(
                            'items-start gap-3 rounded-xl',
                            !item.isRead && 'bg-primary/5',
                          )}
                        >
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card shadow-2xs">
                            {getNotificationIcon(item.type)}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <p className="truncate text-xs font-bold text-foreground">
                              {item.title}
                            </p>
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {item.message}
                            </p>
                            <span className="text-[11px] text-muted-foreground">
                              {formatNotificationTimeAgo(item.createdAt)}
                            </span>
                          </div>
                          {!item.isRead && (
                            <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  )}

                  <DropdownMenuSeparator className="my-0" />
                  <DropdownMenuItem
                    href="/notifications"
                    className="justify-center text-xs font-semibold text-primary"
                  >
                    ดูการแจ้งเตือนทั้งหมด
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* ดรอปดาวน์เมนู Avatar: แดชบอร์ด / โปรไฟล์ผู้ใช้ / โปรไฟล์สัตว์เลี้ยง / ตั้งค่า / ออกจากระบบ */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`เมนูผู้ใช้งาน: ${userName}`}
                  className="relative size-10 min-h-[40px] min-w-[40px] overflow-hidden rounded-full ring-2 ring-border transition-transform hover:scale-105 active:scale-95"
                >
                  <UserAvatar
                    src={user?.avatarUrl}
                    alt={userName}
                    sizes="40px"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem href="/dashboard">
                    <LayoutDashboard className="size-4" />
                    แดชบอร์ด
                  </DropdownMenuItem>
                  <DropdownMenuItem href="/profile">
                    <User className="size-4" />
                    โปรไฟล์ผู้ใช้
                  </DropdownMenuItem>
                  <DropdownMenuItem href="/profile/pets">
                    <Heart className="size-4" />
                    โปรไฟล์สัตว์เลี้ยง
                  </DropdownMenuItem>
                  <DropdownMenuItem href="/profile/settings">
                    <Settings className="size-4" />
                    ตั้งค่าระบบ
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      void logoutAction();
                    }}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="size-4" />
                    ออกจากระบบ
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* ปุ่ม CTA: แจ้งสัตว์เลี้ยงหาย */}
              <Link
                href="/posts/create?type=LOST"
                className={cn(
                  buttonVariants({ variant: 'default', size: 'default' }),
                  'h-10 min-h-[40px] rounded-2xl gap-1.5 px-4 font-medium shadow-xs',
                )}
              >
                <Plus className="size-4 stroke-[2.5]" />
                <span>แจ้งสัตว์เลี้ยงหาย</span>
              </Link>
            </>
          ) : (
            /* กรณี Guest ยังไม่ได้เข้าสู่ระบบ */
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'h-10 min-h-[40px] rounded-xl px-4',
                )}
              >
                เข้าสู่ระบบ
              </Link>
              <Link
                href="/register"
                className={cn(
                  buttonVariants({ variant: 'default', size: 'sm' }),
                  'h-10 min-h-[40px] rounded-xl px-4',
                )}
              >
                สมัครสมาชิก
              </Link>
            </div>
          )}
        </div>

        {/* 4. แถบเครื่องมือบนมือถือ (ปุ่มสลับธีม + ปุ่มเปิดเมนู Hamburger) */}
        <div className="flex xl:hidden items-center gap-1.5">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? 'ปิดเมนูนำทาง' : 'เปิดเมนูนำทาง'}
            aria-expanded={mobileMenuOpen}
            aria-controls="header-mobile-menu"
            className="flex size-10 min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-foreground hover:bg-muted active:scale-95"
          >
            {mobileMenuOpen ? (
              <X className="size-5" />
            ) : (
              <MenuIcon className="size-5" />
            )}
          </button>
        </div>
      </div>

      {/* 5. เมนู Drawer สำหรับหน้าจอมือถือ (เปิดขึ้นเมื่อกดปุ่ม Hamburger) */}
      {mobileMenuOpen && (
        <div
          id="header-mobile-menu"
          className="max-h-[calc(100dvh-5rem)] overflow-y-auto border-t border-border bg-muted/40 px-4 py-4 xl:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-4">
            <HeaderNavigation
              pathname={pathname}
              isAdmin={isAdmin}
              mobile
              onNavigate={() => setMobileMenuOpen(false)}
            />
            {/* ทางเข้าบัญชีบนมือถือ ใช้ปุ่มส่วนกลางและเส้นทางเดิม */}
            <div className="grid grid-cols-2 gap-2 border-t border-border pt-4">
              <Link
                href={isLoggedIn ? '/profile' : '/login'}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(buttonVariants({ variant: 'outline' }), 'h-11')}
              >
                {isLoggedIn ? 'โปรไฟล์ผู้ใช้' : 'เข้าสู่ระบบ'}
              </Link>
              <Link
                href={isLoggedIn ? '/notifications' : '/register'}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(buttonVariants({ variant: 'outline' }), 'h-11')}
              >
                {isLoggedIn ? 'การแจ้งเตือน' : 'สมัครสมาชิก'}
              </Link>
            </div>
            {/* แถวสลับธีมบนมือถือ */}
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-medium text-muted-foreground">
                ธีมการแสดงผล
              </span>
              <ThemeToggle showLabel={true} />
            </div>

            {/* ปุ่ม CTA แจ้งสัตว์หายบนมือถือ */}
            <div className="pt-2">
              <Link
                href="/posts/create?type=LOST"
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  buttonVariants({ variant: 'default' }),
                  'h-11 w-full rounded-2xl gap-1.5 font-medium',
                )}
              >
                <Plus className="size-4 stroke-[2.5]" />
                <span>แจ้งสัตว์เลี้ยงหาย</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
