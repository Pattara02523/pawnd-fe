import Link from 'next/link';
import { cn } from '@/lib/utils';

/** ข้อมูลเมนูหลักชุดเดียวกันสำหรับเดสก์ท็อปและมือถือ */
const NAV_LINKS = [
  { href: '/', label: 'หน้าแรก' },
  { href: '/posts', label: 'ประกาศ' },
  { href: '/map', label: 'แผนที่' },
  { href: '/community', label: 'ชุมชน' },
  { href: '/chat', label: 'แชท' },
];

/** รับเส้นทางปัจจุบันและสถานะผู้ดูแล พร้อม callback ปิดเมนูมือถือ */
interface HeaderNavigationProps {
  pathname: string;
  isAdmin: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
}

/** เมนูนำทางที่ใช้ภายใน Client Header แสดงหน้าปัจจุบันรวมถึงเส้นทางย่อย */
export function HeaderNavigation({
  pathname,
  isAdmin,
  mobile = false,
  onNavigate,
}: HeaderNavigationProps) {
  const links = isAdmin
    ? [...NAV_LINKS, { href: '/admin', label: 'แอดมิน' }]
    : NAV_LINKS;

  return (
    <nav
      aria-label={mobile ? 'เมนูหลักบนมือถือ' : 'เมนูหลัก'}
      className={cn(
        'gap-1',
        mobile
          ? 'grid grid-cols-2'
          : 'hidden items-center rounded-2xl border border-border/60 bg-muted/60 p-1 xl:flex',
      )}
    >
      {/* ลิงก์ใช้พื้นที่สัมผัสอย่างน้อย 44px และระบุสถานะให้โปรแกรมอ่านหน้าจอ */}
      {links.map((link) => {
        const active =
          pathname === link.href ||
          (link.href !== '/' && pathname.startsWith(`${link.href}/`));
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-background text-primary shadow-xs'
                : 'text-muted-foreground hover:bg-background hover:text-foreground',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
