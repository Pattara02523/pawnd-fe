import type {
  CurrentLocation,
  MapDataState,
  MapPostFeature,
} from '@/types/map';
import type { PostType } from '@/types/post';

/** ตัวเลือกประเภทประกาศที่ใช้ทั้งกับ marker และ nearby endpoint */
export type PostTypeFilter = 'ALL' | PostType;

/** ตัวเลือกช่วงเวลาที่กรองข้อมูลจาก eventDate ฝั่ง client */
export type TimeFilter = 'ALL' | 'ONE_DAY' | 'SEVEN_DAYS' | 'THIRTY_DAYS';

/** ตัวเลือกรัศมีที่ตรงกับค่าที่ nearby endpoint รองรับในหน้าเดิม */
export type DistanceFilter = '5' | '10' | '25' | '50';

/** รายการหนึ่งรายการหลังคำนวณระยะเพื่อใช้แสดงใน sidebar */
export interface NearbyFeature {
  feature: MapPostFeature;
  distanceKm: number;
}

/** Props ของแผงค้นหาและตัวกรองที่ควบคุมโดย MapSidebar */
export interface MapFilterPanelProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  postTypeFilter: PostTypeFilter;
  onPostTypeFilterChange: (filter: PostTypeFilter) => void;
  currentLocation: CurrentLocation | null;
  distanceFilter: DistanceFilter;
  onDistanceFilterChange: (filter: DistanceFilter) => void;
  timeFilter: TimeFilter;
  onTimeFilterChange: (filter: TimeFilter) => void;
}

/** Props ของการ์ดประกาศใกล้เคียงหนึ่งใบ */
export interface NearbyPostCardProps {
  item: NearbyFeature;
  currentLocation: CurrentLocation | null;
  selectedPostId: string | null;
  onSelectPost: (feature: MapPostFeature) => void;
}

/** Props ของรายการประกาศและสถานะ loading/empty/error ทั้งหมด */
export interface NearbyPostListProps {
  data: MapDataState;
  filteredFeatures: NearbyFeature[];
  currentLocation: CurrentLocation | null;
  selectedPostId: string | null;
  onSelectPost: (feature: MapPostFeature) => void;
  onRequestCurrentLocation: () => void;
  isLocating: boolean;
  onRetry: () => void;
}

/** Props ของ sidebar ที่รวม filter และรายการ nearby */
export interface MapSidebarProps {
  data: MapDataState;
  center: [number, number];
  postTypeFilter: PostTypeFilter;
  onPostTypeFilterChange: (filter: PostTypeFilter) => void;
  currentLocation: CurrentLocation | null;
  distanceFilter: DistanceFilter;
  onDistanceFilterChange: (filter: DistanceFilter) => void;
  timeFilter: TimeFilter;
  onTimeFilterChange: (filter: TimeFilter) => void;
  selectedPostId: string | null;
  onSelectPost: (feature: MapPostFeature) => void;
  onRequestCurrentLocation: () => void;
  isLocating: boolean;
  onRetry: () => void;
}
