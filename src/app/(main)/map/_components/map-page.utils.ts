import type { TimeFilter } from './map-page.types';

/** คำนวณระยะทางเส้นตรงโดยประมาณด้วย Haversine formula สำหรับแสดงผลใน sidebar */
export function calculateDistanceKm(
  first: [number, number],
  second: [number, number],
): number {
  const earthRadiusKm = 6371;
  const latitudeDelta = ((second[0] - first[0]) * Math.PI) / 180;
  const longitudeDelta = ((second[1] - first[1]) * Math.PI) / 180;
  const firstLatitude = (first[0] * Math.PI) / 180;
  const secondLatitude = (second[0] * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 *
      Math.cos(firstLatitude) *
      Math.cos(secondLatitude);

  return (
    earthRadiusKm *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

/** แสดงระยะทางให้กระชับและอ่านง่ายทั้งบนมือถือและ desktop */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} ม.`;
  }

  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} กม.`;
}

/**
 * กรองวันที่เกิดเหตุของประกาศในฝั่ง client โดยไม่ส่ง query ที่ Backend ไม่รองรับ
 * ใช้ eventDate ซึ่งเป็นวันที่หาย/พบที่ผู้ใช้ระบุในประกาศและเห็นใน Popup
 */
export function matchesTimeFilter(
  eventDate: string | null | undefined,
  filter: TimeFilter,
): boolean {
  if (filter === 'ALL') {
    return true;
  }

  if (!eventDate) {
    return false;
  }

  const parsedDate = new Date(eventDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  const days = filter === 'ONE_DAY' ? 1 : filter === 'SEVEN_DAYS' ? 7 : 30;
  const now = Date.now();
  const eventTimestamp = parsedDate.getTime();
  return (
    eventTimestamp <= now &&
    eventTimestamp >= now - days * 24 * 60 * 60 * 1000
  );
}
