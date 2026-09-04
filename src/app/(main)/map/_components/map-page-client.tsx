'use client';

import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import type {
  CurrentLocation,
  MapDataState,
  MapPostFeature,
} from '@/types/map';

/**
 * โหลด Leaflet เฉพาะฝั่ง browser เพื่อไม่ให้ SSR เรียกใช้ window/document
 * และแสดง placeholder ที่มีขนาดใกล้เคียงกับแผนที่ระหว่างโหลด bundle
 */
const RealLeafletMap = dynamic(
  () => import('@/components/map/RealLeafletMap'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[520px] min-h-[480px] w-full items-center justify-center bg-muted/60 lg:h-[calc(100vh-220px)]">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <p className="text-sm font-medium text-muted-foreground">
            กำลังโหลดแผนที่...
          </p>
        </div>
      </div>
    ),
  },
);

import { DEFAULT_MAP_CENTER } from './map-page.constants';
import { matchesTimeFilter } from './map-page.utils';
import { MapSidebar } from './map-sidebar';
import type {
  DistanceFilter,
  PostTypeFilter,
  TimeFilter,
} from './map-page.types';
import { useCurrentLocation } from './use-current-location';
import { useNearbyMapPosts } from './use-nearby-map-posts';

/**
 * หน้าหลัก Map: ใช้ Header/Footer จาก main layout เดิม และจัด content เป็น
 * sidebar 300px + แผนที่ responsive โดยไม่เพิ่มข้อมูลตัวอย่างใน production
 */
export function MapPageClient() {
  const [postTypeFilter, setPostTypeFilter] = useState<PostTypeFilter>('ALL');
  const [viewportData, setViewportData] = useState<MapDataState>({
    features: [],
    isLoading: true,
    errorMessage: null,
  });
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>('10');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('ALL');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedPostLocation, setSelectedPostLocation] =
    useState<CurrentLocation | null>(null);
  const [selectionRequestToken, setSelectionRequestToken] = useState(0);

  const {
    currentLocation,
    isLocating,
    locationError,
    requestCurrentLocation: handleRequestCurrentLocation,
  } = useCurrentLocation();
  const { data: nearbyData, retry: handleRetryNearby } = useNearbyMapPosts(
    currentLocation,
    distanceFilter,
    postTypeFilter,
  );

  const handleDataStateChange = useCallback((nextState: MapDataState) => {
    setViewportData(nextState);
  }, []);

  /**
   * กรอง marker และ nearby list ด้วย eventDate จริงจาก response ของแต่ละ endpoint
   * โดยใช้เกณฑ์เดียวกันและไม่เปลี่ยน viewport หรือเรียก API ใหม่
   */
  const visibleMarkerPosts = useMemo(
    () =>
      viewportData.features.filter((feature) =>
        matchesTimeFilter(feature.properties.eventDate, timeFilter),
      ),
    [timeFilter, viewportData.features],
  );
  const visibleNearbyPosts = useMemo(
    () =>
      nearbyData.features.filter((feature) =>
        matchesTimeFilter(feature.properties.eventDate, timeFilter),
      ),
    [nearbyData.features, timeFilter],
  );
  const visibleNearbyData = useMemo<MapDataState>(
    () => ({ ...nearbyData, features: visibleNearbyPosts }),
    [nearbyData, visibleNearbyPosts],
  );

  /**
   * เปลี่ยนช่วงเวลาจาก user event และล้าง selection เฉพาะเมื่อ post เดิม
   * ไม่อยู่ในช่วงใหม่ จึงไม่มี effect ที่ setState หรือ movement loop
   */
  const handleTimeFilterChange = useCallback(
    (nextFilter: TimeFilter) => {
      setTimeFilter((currentFilter) =>
        currentFilter === nextFilter ? currentFilter : nextFilter,
      );

      if (!selectedPostId) {
        return;
      }

      const selectedPost = [
        ...viewportData.features,
        ...nearbyData.features,
      ].find((feature) => feature.properties.id === selectedPostId);
      if (
        !selectedPost ||
        !matchesTimeFilter(selectedPost.properties.eventDate, nextFilter)
      ) {
        setSelectedPostId(null);
        setSelectedPostLocation(null);
      }
    },
    [nearbyData.features, selectedPostId, viewportData.features],
  );

  /**
   * เลือก post ด้วย id และเพิ่ม token ทุกครั้ง เพื่อให้คลิก post เดิมซ้ำแล้ว
   * แผนที่ยังสั่ง flyTo/openPopup ใหม่ได้ โดยไม่มี state update จาก map event
   */
  const handleSelectPost = useCallback((feature: MapPostFeature) => {
    const postId = feature.properties.id;
    const [longitude, latitude] = feature.geometry.coordinates;

    setSelectedPostId((currentPostId) =>
      currentPostId === postId ? currentPostId : postId,
    );
    setSelectedPostLocation({ latitude, longitude });
    setSelectionRequestToken((token) => token + 1);
  }, []);

  const distanceOrigin: [number, number] = currentLocation
    ? [currentLocation.latitude, currentLocation.longitude]
    : DEFAULT_MAP_CENTER;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-muted/30">
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        {/* Intro bar ของหน้า Map; Header global มีโลโก้และ navigation อยู่ด้านบนแล้ว */}
        <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              แผนที่สัตว์เลี้ยง
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              ดูประกาศสัตว์หายและพบสัตว์พลัดหลงจากข้อมูลจริงบนแผนที่แบบ
              interactive
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full bg-destructive"
                aria-hidden="true"
              />
              สัตว์หาย
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full bg-primary"
                aria-hidden="true"
              />
              พบสัตว์
            </span>
          </div>
        </header>

        {/* บนจอเล็ก sidebar จะอยู่ด้านบนและแผนที่จะเลื่อนลงด้านล่าง */}
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <MapSidebar
            data={visibleNearbyData}
            center={distanceOrigin}
            postTypeFilter={postTypeFilter}
            onPostTypeFilterChange={setPostTypeFilter}
            currentLocation={currentLocation}
            distanceFilter={distanceFilter}
            onDistanceFilterChange={setDistanceFilter}
            timeFilter={timeFilter}
            onTimeFilterChange={handleTimeFilterChange}
            selectedPostId={selectedPostId}
            onSelectPost={handleSelectPost}
            onRequestCurrentLocation={handleRequestCurrentLocation}
            isLocating={isLocating}
            onRetry={handleRetryNearby}
          />

          <section
            aria-label="แผนที่ประกาศสัตว์เลี้ยง"
            className="relative min-h-[520px] overflow-hidden rounded-3xl border border-border bg-card p-1 shadow-sm sm:p-2 lg:min-h-[560px]"
          >
            <RealLeafletMap
              heightClass="h-[520px] min-h-[480px] sm:h-[640px] lg:h-[calc(100vh-220px)]"
              scrollWheelZoom
              postType={postTypeFilter === 'ALL' ? undefined : postTypeFilter}
              currentLocation={currentLocation}
              onRequestCurrentLocation={handleRequestCurrentLocation}
              isLocating={isLocating}
              locationError={locationError}
              selectedPostId={selectedPostId}
              selectedPostLocation={selectedPostLocation}
              selectionRequestToken={selectionRequestToken}
              visibleFeatures={visibleMarkerPosts}
              onDataStateChange={handleDataStateChange}
            />
          </section>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden="true" />
          แตะ marker หรือรายการประกาศเพื่อเปิดรายละเอียดโพสต์
        </p>
      </div>
    </div>
  );
}
