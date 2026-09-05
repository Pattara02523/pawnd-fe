'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type FieldPath, type FieldPathValue } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Camera,
  Plus,
  X,
  Sparkles,
  Search,
  PawPrint,
  MapPin,
  Calendar,
  Phone,
  Wand2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Eye,
  Check,
  Share2,
  ShieldCheck,
  AlertCircle,
  Coins,
  Info,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCurrentLocation } from '@/app/(main)/map/_components/use-current-location';
import { cn } from '@/lib/utils';
import type { CurrentLocation } from '@/types/map';
import type { PetProfile } from '@/types/pet';
import type { PetGender, PetType, PostType } from '@/types/post';
import { AiAnalysisResult } from '@/services/ai.service';
import {
  createPostAction,
  analyzeImageAction,
  getPetProfileAction,
  uploadPostImagesAction,
} from '../_actions/create-post.actions';
import {
  reverseGeocode,
  searchGeocodingPlaces,
  type GeocodingSearchResult,
} from '@/services/geocoding.service';
import {
  createPostFormSchema,
  type CreatePostFormValues,
} from '../_schemas/create-post.schema';

// Backend รับ JSON ของ /ai/analyze-image ผ่าน body parser ค่าเริ่มต้นที่ค่อนข้างเล็ก
// จึงย่อรูปให้ Data URL มีขนาดไม่เกินประมาณ 72 KB เพื่อไม่ให้ request ถูกตัดก่อนถึง AI
const AI_IMAGE_MAX_DIMENSION = 768;
const AI_IMAGE_MIN_DIMENSION = 384;
const AI_IMAGE_MAX_DATA_URL_BYTES = 72 * 1024;
const AI_IMAGE_JPEG_QUALITY_STEPS = [0.72, 0.58, 0.46, 0.36];
const MAX_POST_IMAGES = 3;
const MAX_POST_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_POST_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

interface CreatePostFormProps {
  initialPets: PetProfile[];
}

type ToastVariant = 'success' | 'error' | 'info';

interface ToastState {
  message: string;
  variant: ToastVariant;
  duration: number;
}

const CreatePostLocationMap = dynamic(
  () => import('@/components/map/RealLeafletMap'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center bg-muted/60 text-xs text-muted-foreground sm:h-72">
        กำลังโหลดแผนที่...
      </div>
    ),
  },
);

/** ตัวเลือกประเภทประกาศที่ตรงกับ PostType enum ของ Backend */
const POST_TYPE_OPTIONS: Array<{
  value: PostType;
  title: string;
  description: string;
}> = [
  {
    value: 'LOST',
    title: 'สัตว์เลี้ยงของฉันหาย',
    description: 'ฉันกำลังตามหาสัตว์เลี้ยงของตัวเอง',
  },
  {
    value: 'FOUND',
    title: 'ฉันพบสัตว์',
    description: 'ฉันพบสัตว์ที่อาจเป็นของคนอื่น',
  },
];

/**
 * ย่อขนาดรูปภาพด้วย Canvas แล้วแปลงเป็น Base64 Data URL (JPEG)
 * ใช้สำหรับส่งรูปภาพที่ยังไม่ได้อัปโหลดขึ้น server ไปให้ AI วิเคราะห์
 * (เพราะตอนกรอกฟอร์มยังไม่มีประกาศให้ผูกไฟล์ด้วย จึงยังไม่มี URL สาธารณะ)
 * ใช้ window.Image ตรงๆ (ไม่ใช่ตัว Image ที่ import จาก next/image) เพื่อสร้าง HTMLImageElement
 */
function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const longestSide = Math.max(img.width, img.height);
      const initialScale = Math.min(1, AI_IMAGE_MAX_DIMENSION / longestSide);
      const initialWidth = Math.max(1, Math.round(img.width * initialScale));
      const initialHeight = Math.max(1, Math.round(img.height * initialScale));

      const renderAtSize = (maxDimension: number): string | null => {
        const scale = Math.min(1, maxDimension / longestSide);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        for (const quality of AI_IMAGE_JPEG_QUALITY_STEPS) {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);

          if (dataUrl.length <= AI_IMAGE_MAX_DATA_URL_BYTES) {
            return dataUrl;
          }
        }

        return null;
      };

      const dataUrl =
        renderAtSize(
          initialWidth > initialHeight ? initialWidth : initialHeight,
        ) || renderAtSize(AI_IMAGE_MIN_DIMENSION);

      if (!dataUrl) {
        reject(new Error('ไม่สามารถประมวลผลรูปภาพได้'));
        return;
      }

      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('ไม่สามารถโหลดรูปภาพได้'));
    };
    img.src = objectUrl;
  });
}

/**
 * สร้าง key สำหรับระบุตัวตนของรูปภาพที่ใช้วิเคราะห์ (ใช้เทียบว่าเป็นรูปเดิมหรือไม่)
 * ใช้ name+size+lastModified เพื่อไม่วิเคราะห์ไฟล์เดิมซ้ำโดยไม่จำเป็น
 */
function getImageKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

/** สร้าง key สำหรับรูปจาก Pet Profile เพื่อแยก cache ออกจากไฟล์ที่ผู้ใช้อัปโหลด */
function getProfileImageKey(imageUrl: string): string {
  return `profile:${imageUrl}`;
}

/** แปลงค่า datetime-local ให้แสดงใน Preview เป็นวันที่และเวลาอ่านง่าย */
function formatEventDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** สร้างค่าเริ่มต้นสำหรับ input datetime-local ตามเวลาท้องถิ่นของผู้ใช้ */
function getLocalDateTimeValue(date = new Date()): string {
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
}

/** เลือกรูปหลักของ Pet Profile จากข้อมูลย่อหรือรายละเอียดเต็มที่ Backend ส่งกลับ */
function getPetProfileImageUrl(pet: PetProfile): string | null {
  return (
    pet.profileImageUrl ||
    pet.images?.find((image) => image.isProfile)?.imageUrl ||
    pet.images?.[0]?.imageUrl ||
    null
  );
}

/**
 * CreatePostForm Component (Client Component)
 * - ฟอร์มสร้างประกาศ Lost & Found แบบ 3 ขั้นตอน:
 *   Step 0: เลือกประเภทประกาศ
 *   Step 1: กรอกข้อมูลสัตว์เลี้ยงและอัปโหลดรูปภาพ
 *   Step 2: ตรวจสอบและดูตัวอย่างประกาศ (Live Preview) ก่อนยืนยันเผยแพร่
 * - รองรับระบบ AI วิเคราะห์ภาพถ่ายและช่วยเขียนคำบรรยาย
 */
export function CreatePostForm({ initialPets }: CreatePostFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageUrlsRef = useRef<string[]>([]);
  const locationLookupAbortRef = useRef<AbortController | null>(null);
  const locationSearchAbortRef = useRef<AbortController | null>(null);

  // State ขั้นตอน: 0 = เลือกประเภท, 1 = กรอกข้อมูล, 2 = ตรวจสอบ & ดูตัวอย่าง
  const [currentStep, setCurrentStep] = useState<0 | 1 | 2>(0);
  // LOST มีขั้นตอนคั่นกลางเพื่อเลือกว่าจะใช้ข้อมูลจาก Pet Profile หรือกรอกเอง
  const [isPetSourceStep, setIsPetSourceStep] = useState(false);
  const [petSource, setPetSource] = useState<'PROFILE' | 'MANUAL' | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [isLoadingPetProfile, setIsLoadingPetProfile] = useState(false);
  // รูปจาก Pet Profile แสดงเป็นรูปหลักของประกาศ แต่ไม่ใช่ไฟล์ใหม่ที่ต้องอัปโหลดซ้ำ
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  // State ประเภทประกาศที่เลือก ซึ่งจะถูกส่งเป็น PostType ไปยัง Backend ตอนเผยแพร่
  const [postType, setPostType] = useState<PostType | null>(null);
  const {
    currentLocation,
    isLocating,
    locationError: geolocationError,
    requestCurrentLocation,
  } = useCurrentLocation();
  const [selectedCoordinates, setSelectedCoordinates] =
    useState<CurrentLocation | null>(null);
  // พิกัดนี้ใช้ส่งเข้า CreatePostPayload เท่านั้น ไม่ถูกนำไปใส่ใน locationDescription
  const coordinates = selectedCoordinates;
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [locationLookupError, setLocationLookupError] = useState<string | null>(
    null,
  );
  const [locationValidationError, setLocationValidationError] = useState<
    string | null
  >(null);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [locationSearchResults, setLocationSearchResults] = useState<
    GeocodingSearchResult[]
  >([]);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState<string | null>(
    null,
  );
  const [searchLocation, setSearchLocation] = useState<CurrentLocation | null>(
    null,
  );
  const [searchLocationRequestToken, setSearchLocationRequestToken] =
    useState(0);

  // React Hook Form ถือค่าฟอร์มและเรียก Zod ตรวจสอบก่อนเข้าสู่หน้า Preview
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<CreatePostFormValues>({
    resolver: zodResolver(createPostFormSchema),
    mode: 'onTouched',
    defaultValues: {
      petName: '',
      petType: 'CAT',
      breed: '',
      gender: 'UNKNOWN',
      color: '',
      distinctiveFeatures: '',
      locationDescription: '',
      eventDate: '',
      rewardAmount: '',
      contactPhone: '',
    },
  });

  // State สำหรับแสดงค่าปัจจุบันใน Preview โดยทุกการเปลี่ยนค่าจะ sync เข้า React Hook Form ด้วย
  const [petName, setPetName] = useState('');
  const [petType, setPetType] = useState<PetType>('CAT');
  const [breed, setBreed] = useState('');
  const [color, setColor] = useState('');
  const [gender, setGender] = useState<PetGender>('UNKNOWN');
  const [distinctiveFeatures, setDistinctiveFeatures] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [rewardAmount, setRewardAmount] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  /** อัปเดตค่าใน RHF พร้อมขอให้ Zod ตรวจสอบ field ที่ผู้ใช้เพิ่งแก้ */
  const syncFormValue = <K extends FieldPath<CreatePostFormValues>>(
    field: K,
    value: FieldPathValue<CreatePostFormValues, K>,
  ) => {
    setValue(field, value, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  /** เติมข้อมูลสัตว์จาก Pet Profile ลงในช่องที่โพสต์รองรับ โดยยังแก้ไขต่อได้ */
  const applyPetProfile = (pet: PetProfile) => {
    const nextPetName = pet.name;
    const nextPetType = pet.type;
    const nextBreed = pet.breed ?? '';
    const nextGender = pet.gender ?? 'UNKNOWN';
    const nextColor = pet.color ?? '';
    const nextDistinctiveFeatures = pet.distinctiveFeatures ?? '';
    const nextProfileImageUrl = getPetProfileImageUrl(pet);

    setPetName(nextPetName);
    setPetType(nextPetType);
    setBreed(nextBreed);
    setGender(nextGender);
    setColor(nextColor);
    setDistinctiveFeatures(nextDistinctiveFeatures);
    setProfileImageUrl(nextProfileImageUrl);
    // เปลี่ยนสัตว์หรือโหลดรายละเอียดเต็มแล้ว ต้องวิเคราะห์รูปใหม่เสมอ
    setAiAnalysisCache(null);

    syncFormValue('petName', nextPetName);
    syncFormValue('petType', nextPetType);
    syncFormValue('breed', nextBreed);
    syncFormValue('gender', nextGender);
    syncFormValue('color', nextColor);
    syncFormValue('distinctiveFeatures', nextDistinctiveFeatures);
  };

  /** ล้างข้อมูลสัตว์ที่เคยเติมจากโปรไฟล์เมื่อผู้ใช้เลือกกรอกข้อมูลเอง */
  const clearPetDetails = () => {
    setSelectedPetId(null);
    setPetName('');
    setPetType('CAT');
    setBreed('');
    setGender('UNKNOWN');
    setColor('');
    setDistinctiveFeatures('');
    setProfileImageUrl(null);
    setAiAnalysisCache(null);

    syncFormValue('petName', '');
    syncFormValue('petType', 'CAT');
    syncFormValue('breed', '');
    syncFormValue('gender', 'UNKNOWN');
    syncFormValue('color', '');
    syncFormValue('distinctiveFeatures', '');
  };

  /** เลือกสัตว์จากรายการ แล้วโหลดรายละเอียดเต็มเพื่อเติมข้อมูลที่มีในโปรไฟล์ */
  const handlePetProfileSelect = async (pet: PetProfile) => {
    setPetSource('PROFILE');
    setSelectedPetId(pet.id);
    applyPetProfile(pet);
    setIsLoadingPetProfile(true);

    try {
      const result = await getPetProfileAction(pet.id);
      if (result.success) {
        applyPetProfile(result.data);
      } else {
        notify(`${result.error} สามารถกรอกข้อมูลที่ขาดในขั้นตอนถัดไปได้`);
      }
    } catch {
      notify(
        'โหลดข้อมูล Pet Profile ไม่สำเร็จ กรุณาตรวจสอบข้อมูลในขั้นตอนถัดไป',
      );
    } finally {
      setIsLoadingPetProfile(false);
    }
  };

  /** เก็บพิกัดที่เลือกและเติมที่อยู่เต็มจากจุดที่ผู้ใช้คลิกบนแผนที่ */
  const handleLocationSelect = (location: CurrentLocation) => {
    setSelectedCoordinates(location);
    setSearchLocation(null);
    setLocationValidationError(null);
    setLocationLookupError(null);
    locationLookupAbortRef.current?.abort();

    const controller = new AbortController();
    locationLookupAbortRef.current = controller;
    setIsResolvingLocation(true);
    setLocationDescription('');
    syncFormValue('locationDescription', '');

    void reverseGeocode(location, controller.signal)
      .then((displayName) => {
        if (
          controller.signal.aborted ||
          locationLookupAbortRef.current !== controller
        ) {
          return;
        }

        setLocationDescription(displayName);
        syncFormValue('locationDescription', displayName);
      })
      .catch(() => {
        if (
          controller.signal.aborted ||
          locationLookupAbortRef.current !== controller
        ) {
          return;
        }

        setLocationLookupError(
          'ไม่สามารถดึงที่อยู่เต็มจากจุดนี้ได้ กรุณาลองคลิกจุดอื่นบนแผนที่',
        );
      })
      .finally(() => {
        if (locationLookupAbortRef.current !== controller) return;

        locationLookupAbortRef.current = null;
        setIsResolvingLocation(false);
      });
  };

  /** ค้นหาสถานที่เมื่อผู้ใช้กดปุ่มค้นหาเอง แล้วเลื่อนแผนที่ไปยังผลลัพธ์ */
  const handleLocationSearch = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const query = locationSearchQuery.trim();
    if (!query) {
      locationSearchAbortRef.current?.abort();
      locationSearchAbortRef.current = null;
      setIsSearchingLocations(false);
      setLocationSearchResults([]);
      setLocationSearchError('กรุณาพิมพ์ชื่อสถานที่ก่อนค้นหา');
      return;
    }

    locationSearchAbortRef.current?.abort();
    const controller = new AbortController();
    locationSearchAbortRef.current = controller;
    setIsSearchingLocations(true);
    setLocationSearchError(null);
    setLocationSearchResults([]);
    setSearchLocation(null);

    try {
      const results = await searchGeocodingPlaces(query, controller.signal);
      if (
        controller.signal.aborted ||
        locationSearchAbortRef.current !== controller
      ) {
        return;
      }

      setLocationSearchResults(results);
      if (results.length === 0) {
        setLocationSearchError(
          'ไม่พบสถานที่จากคำค้นนี้ ลองใช้คำค้นที่ละเอียดขึ้น',
        );
      }
    } catch {
      if (
        controller.signal.aborted ||
        locationSearchAbortRef.current !== controller
      ) {
        return;
      }

      setLocationSearchError(
        'ค้นหาสถานที่ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง',
      );
    } finally {
      if (locationSearchAbortRef.current !== controller) return;

      locationSearchAbortRef.current = null;
      setIsSearchingLocations(false);
    }
  };

  /** เลือกผลค้นหาเป็นพิกัดประกาศทันที และเลื่อนแผนที่ไปยังจุดนั้น */
  const handleLocationSearchResultSelect = (result: GeocodingSearchResult) => {
    const nextLocation = {
      latitude: result.latitude,
      longitude: result.longitude,
    };

    locationLookupAbortRef.current?.abort();
    locationLookupAbortRef.current = null;
    setIsResolvingLocation(false);
    setSelectedCoordinates(nextLocation);
    setSearchLocation({
      ...nextLocation,
    });
    setSearchLocationRequestToken((token) => token + 1);
    setLocationValidationError(null);
    setLocationLookupError(null);
    setLocationDescription(result.displayName);
    syncFormValue('locationDescription', result.displayName);
    setLocationSearchError(null);
  };

  // State รูปภาพที่ผู้ใช้เลือกอัปโหลด (สูงสุด 3 รูปตามกฎ Backend) — เก็บเป็น Preview URL สำหรับแสดงผล
  const [images, setImages] = useState<string[]>([]);

  // State ไฟล์ต้นฉบับของรูปภาพ (คู่กับ images ตาม index) ใช้แปลงเป็น Base64 ส่งให้ AI วิเคราะห์
  const [imageFiles, setImageFiles] = useState<File[]>([]);

  // State AI Assistant & Toast Notification
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  // เก็บ id ของโพสต์ที่สร้างสำเร็จแต่ยังอัปโหลดรูปไม่ผ่าน เพื่อให้กดลองอัปโหลดซ้ำได้โดยไม่สร้างโพสต์ซ้ำ
  const [pendingUploadPostId, setPendingUploadPostId] = useState<string | null>(
    null,
  );
  const [toast, setToast] = useState<ToastState | null>(null);

  /** แสดงข้อความชั่วคราวพร้อมสถานะที่สื่อความหมายตรงกับผลลัพธ์ */
  const notify = (
    message: string,
    duration = 3000,
    variant: ToastVariant = 'error',
  ) => {
    setToast({ message, variant, duration });
  };

  useEffect(() => {
    if (!toast) return;

    const timeoutId = window.setTimeout(() => setToast(null), toast.duration);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    imageUrlsRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imageUrlsRef.current.forEach((imageUrl) => {
        if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
      });
    };
  }, []);

  useEffect(() => {
    return () => {
      locationLookupAbortRef.current?.abort();
      locationSearchAbortRef.current?.abort();
    };
  }, []);

  // Cache ผลวิเคราะห์ AI ล่าสุด ผูกกับ imageKey ของรูปที่ใช้วิเคราะห์
  // ป้องกันการยิง /analyze-image ซ้ำเมื่อกดปุ่ม AI ทั้งสองปุ่มกับรูปเดิม
  const [aiAnalysisCache, setAiAnalysisCache] = useState<{
    imageKey: string;
    data: AiAnalysisResult;
  } | null>(null);

  // ฟังก์ชันเลือกไฟล์รูปภาพ โดยตรวจ MIME type, ขนาด และจำนวนให้ตรงกับกฎ Backend
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // ล้างค่า input เพื่อให้เลือกไฟล์เดิมซ้ำได้หลังจากลบหรือแก้ไขไฟล์
    e.target.value = '';
    if (files.length === 0) return;

    const currentImageCount = images.length + (profileImageUrl ? 1 : 0);
    const remainingSlots = MAX_POST_IMAGES - currentImageCount;
    if (remainingSlots <= 0) {
      notify('อัปโหลดรูปภาพได้สูงสุด 3 รูป');
      return;
    }

    const validFiles: File[] = [];
    let hasInvalidType = false;
    let hasOversizedFile = false;

    files.forEach((file) => {
      if (!ALLOWED_POST_IMAGE_TYPES.has(file.type)) {
        hasInvalidType = true;
        return;
      }
      if (file.size > MAX_POST_IMAGE_SIZE_BYTES) {
        hasOversizedFile = true;
        return;
      }
      validFiles.push(file);
    });

    const filesToAdd = validFiles.slice(0, remainingSlots);
    const newUrls = filesToAdd.map((file) => URL.createObjectURL(file));

    if (filesToAdd.length > 0) {
      setImages((prev) => [...prev, ...newUrls]);
      setImageFiles((prev) => [...prev, ...filesToAdd]);
      // รูปแรกอาจเปลี่ยน → ล้าง cache ผลวิเคราะห์เก่าทิ้ง
      setAiAnalysisCache(null);
    }

    const feedback: string[] = [];
    if (hasInvalidType) feedback.push('รองรับเฉพาะไฟล์ JPG, PNG และ WEBP');
    if (hasOversizedFile) feedback.push('แต่ละไฟล์ต้องมีขนาดไม่เกิน 5 MB');
    if (validFiles.length > filesToAdd.length) {
      feedback.push('อัปโหลดรูปภาพได้สูงสุด 3 รูป');
    }
    if (feedback.length > 0) notify(feedback.join(' '));
  };

  // ลบรูปภาพเดี่ยว (ลบทั้ง Preview URL และไฟล์ต้นฉบับที่ index เดียวกัน)
  const handleRemoveImage = (indexToRemove: number) => {
    const imageUrl = images[indexToRemove];
    if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    setImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setImageFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    // รูปแรกอาจเปลี่ยนไปเป็นรูปอื่น → ล้าง cache ผลวิเคราะห์เก่าทิ้ง
    setAiAnalysisCache(null);
  };

  /** นำรูปหลักจาก Pet Profile ออกจากประกาศ โดยยังคงข้อมูลข้อความที่เติมไว้ */
  const handleRemoveProfileImage = () => {
    setProfileImageUrl(null);
    setAiAnalysisCache(null);
  };

  // เรียก AI วิเคราะห์รูปภาพ (POST /analyze-image)
  // ใช้ไฟล์อัปโหลดเป็นลำดับแรก และใช้รูปจาก Pet Profile เมื่อยังไม่มีไฟล์ใหม่
  // ถ้ารูปเดิมเคยวิเคราะห์แล้ว (imageKey ตรงกับ cache) จะ reuse ผลลัพธ์เดิมแทนการยิง request ซ้ำ
  // คืนค่า Promise<AiAnalysisResult> เพื่อให้ handler แต่ละตัวนำ field ที่ต้องการไปใช้ต่อได้เอง
  const runAiImageAnalysis = async () => {
    const file = imageFiles[0];
    const imageKey = file
      ? `upload:${getImageKey(file)}`
      : profileImageUrl
        ? getProfileImageKey(profileImageUrl)
        : null;

    if (!imageKey) {
      throw new Error('กรุณาเลือกรูปภาพก่อนเริ่มวิเคราะห์');
    }

    if (aiAnalysisCache?.imageKey === imageKey) {
      return { success: true as const, data: aiAnalysisCache.data };
    }

    // ไฟล์ใหม่ยังไม่มี URL สาธารณะ จึง resize + แปลงเป็น Base64 ก่อนส่งให้ AI
    // ส่วนรูปจาก Pet Profile เป็น URL ที่ backend เข้าถึงได้ จึงส่ง URL เดิมไปวิเคราะห์ได้เลย
    const imageUrl = file ? await resizeImageToDataUrl(file) : profileImageUrl;

    if (!imageUrl) {
      throw new Error('ไม่พบ URL ของรูปภาพสำหรับวิเคราะห์');
    }

    const res = await analyzeImageAction(imageUrl);

    if (res.success && res.data) {
      setAiAnalysisCache({ imageKey, data: res.data });
    }

    return res;
  };

  // เรียก AI วิเคราะห์ประเภท สายพันธุ์ และสีขนจากภาพถ่าย
  const handleAiAnalyzeImage = async () => {
    if (imageFiles.length === 0 && !profileImageUrl) {
      notify('กรุณาเลือกรูปภาพก่อนเริ่มวิเคราะห์');
      return;
    }

    setIsAnalyzingAi(true);
    try {
      const res = await runAiImageAnalysis();
      if (res.success && res.data) {
        setPetType(res.data.type);
        setValue('petType', res.data.type, {
          shouldDirty: true,
          shouldValidate: true,
        });
        if (res.data.breed) {
          setBreed(res.data.breed);
          setValue('breed', res.data.breed, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
        if (res.data.color) {
          setColor(res.data.color);
          setValue('color', res.data.color, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
        notify('AI วิเคราะห์สายพันธุ์และสีขนเรียบร้อยแล้ว', 3000, 'success');
      } else {
        notify(
          `วิเคราะห์รูปภาพไม่สำเร็จ: ${res.error ?? 'กรุณาลองใหม่อีกครั้ง'}`,
        );
      }
    } catch {
      notify('เกิดข้อผิดพลาดขณะวิเคราะห์รูปภาพ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  // เรียก AI ช่วยเขียนคำบรรยายลักษณะเด่น (ใช้ field "description" จากผลวิเคราะห์ภาพชุดเดียวกัน)
  const handleAiGenerateDescription = async () => {
    if (imageFiles.length === 0 && !profileImageUrl) {
      notify('กรุณาเลือกรูปภาพก่อนให้ AI ช่วยเขียนคำบรรยาย');
      return;
    }

    setIsGeneratingDesc(true);
    try {
      const res = await runAiImageAnalysis();
      const generatedText =
        res.data?.description || res.data?.distinctiveFeatures;

      if (res.success && generatedText) {
        setDistinctiveFeatures(generatedText);
        setValue('distinctiveFeatures', generatedText, {
          shouldDirty: true,
          shouldValidate: true,
        });
        notify('AI สร้างคำบรรยายลักษณะเด่นสำเร็จ', 3000, 'success');
      } else {
        notify(
          res.success
            ? 'AI ไม่สามารถสร้างคำบรรยายจากรูปภาพนี้ได้'
            : `สร้างคำบรรยายไม่สำเร็จ: ${res.error ?? 'กรุณาลองใหม่อีกครั้ง'}`,
        );
      }
    } catch {
      notify('เกิดข้อผิดพลาดขณะสร้างคำบรรยาย กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  // ไปยังขั้นตอนที่ 2 (ตรวจสอบก่อนยืนยัน) หลัง Zod ตรวจสอบข้อมูลครบถ้วน
  const handleGoToReview = handleSubmit(
    () => {
      if (!postType) {
        setCurrentStep(0);
        notify('กรุณาเลือกประเภทประกาศก่อนกรอกข้อมูล');
        return;
      }

      if (imageFiles.length === 0 && !profileImageUrl) {
        notify('กรุณาอัปโหลดรูปภาพอย่างน้อย 1 รูปก่อนตรวจสอบประกาศ');
        return;
      }

      if (!coordinates) {
        const message =
          'กรุณาเลือกตำแหน่งบนแผนที่หรือกดปุ่มตำแหน่งของฉันก่อนตรวจสอบประกาศ';
        setLocationValidationError(message);
        notify(message);
        return;
      }

      setLocationValidationError(null);
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    () => {
      notify('กรุณาตรวจสอบข้อมูลในช่องที่มีข้อความแจ้งเตือน');
    },
  );

  // ยืนยันและเผยแพร่ประกาศทันที (เชื่อมต่อ Backend createPostAction)
  const handleFinalPublish = async () => {
    setIsPublishing(true);

    try {
      if (!postType) {
        setCurrentStep(0);
        notify('กรุณาเลือกประเภทประกาศก่อนเผยแพร่');
        return;
      }

      if (!coordinates) {
        const message =
          'กรุณาเลือกตำแหน่งบนแผนที่หรือกดปุ่มตำแหน่งของฉันก่อนเผยแพร่ประกาศ';
        setCurrentStep(1);
        setLocationValidationError(message);
        notify(message);
        return;
      }

      const values = getValues();

      const selectedFiles = imageFiles;
      const includeProfileImage = Boolean(profileImageUrl && selectedPetId);

      if (selectedFiles.length === 0 && !profileImageUrl) {
        notify('กรุณาอัปโหลดรูปภาพอย่างน้อย 1 รูปก่อนเผยแพร่ประกาศ');
        return;
      }

      const parsedEventDate = new Date(values.eventDate);
      if (Number.isNaN(parsedEventDate.getTime())) {
        setCurrentStep(1);
        notify('กรุณาระบุวันที่และเวลาเกิดเหตุให้ถูกต้อง');
        return;
      }

      // สร้าง FormData จากไฟล์ที่ผู้ใช้เลือก แล้วให้ Server Action เติมรูปจาก Pet Profile
      // ผ่าน endpoint เดิม เพื่อให้ backend สร้าง PostImage, embedding และ Smart Matching
      const uploadImages = async (postId: string) => {
        const formData = new FormData();
        selectedFiles.forEach((file) => formData.append('images', file));
        return uploadPostImagesAction(
          postId,
          formData,
          includeProfileImage ? (selectedPetId ?? undefined) : undefined,
        );
      };

      let postId = pendingUploadPostId;

      // ถ้ามีโพสต์ค้างจากการอัปโหลดครั้งก่อน ให้ลอง upload ต่อโดยไม่สร้างโพสต์ใหม่
      if (!postId) {
        const numReward = values.rewardAmount
          ? parseInt(values.rewardAmount.replace(/,/g, ''), 10)
          : undefined;
        const res = await createPostAction({
          petId: selectedPetId ?? undefined,
          type: postType,
          petName: values.petName,
          petType: values.petType,
          breed: values.breed,
          gender: values.gender,
          color: values.color,
          distinctiveFeatures: values.distinctiveFeatures,
          locationDescription: values.locationDescription,
          eventDate: parsedEventDate.toISOString(),
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          rewardAmount: isNaN(numReward as number) ? undefined : numReward,
          contactPhone: values.contactPhone,
        });

        if (!res.success) {
          notify(
            res.error ||
              'เกิดข้อผิดพลาดในการเผยแพร่ประกาศ กรุณาเข้าสู่ระบบและลองใหม่อีกครั้ง',
          );
          return;
        }

        postId = res.data.post.id;
        setPendingUploadPostId(postId);
      }

      // รูปบันทึกแล้วแต่ AI อาจขัดข้อง ให้แจ้งแยกกันเพื่อไม่อัปโหลดซ้ำ
      let aiWarning: string | undefined;
      if (selectedFiles.length > 0 || includeProfileImage) {
        const uploadRes = await uploadImages(postId);
        if (!uploadRes.success) {
          notify(
            `สร้างประกาศแล้ว แต่อัปโหลดรูปภาพไม่สำเร็จ: ${uploadRes.error ?? 'กรุณาลองใหม่อีกครั้ง'}`,
          );
          return;
        }
        const result = uploadRes.data;
        if (
          result &&
          typeof result === 'object' &&
          'aiWarning' in result &&
          typeof result.aiWarning === 'string'
        ) {
          aiWarning = result.aiWarning;
        }
      }

      setPendingUploadPostId(null);
      notify(
        aiWarning ??
          (selectedFiles.length > 0 || includeProfileImage
            ? 'เผยแพร่ประกาศและอัปโหลดรูปภาพสำเร็จแล้ว'
            : 'เผยแพร่ประกาศสำเร็จแล้ว'),
        4000,
        'success',
      );
      router.refresh();
      setTimeout(() => {
        router.push(`/posts/${postId}`);
      }, 1500);
    } catch {
      notify('เกิดข้อผิดพลาดในการเผยแพร่ประกาศ กรุณาลองใหม่อีกครั้ง', 4000);
    } finally {
      setIsPublishing(false);
    }
  };

  const getPetTypeLabel = (type: PetType) => {
    switch (type) {
      case 'CAT':
        return 'แมว';
      case 'DOG':
        return 'สุนัข';
      case 'BIRD':
        return 'นก';
      case 'HAMSTER':
        return 'แฮมสเตอร์';
      case 'EXOTIC':
        return 'สัตว์พิเศษ';
      default:
        return 'อื่นๆ';
    }
  };

  const getGenderLabel = (g: PetGender) => {
    switch (g) {
      case 'MALE':
        return 'ตัวผู้';
      case 'FEMALE':
        return 'ตัวเมีย';
      default:
        return 'ไม่ระบุเพศ';
    }
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* 1. ส่วนหัวของหน้าประกาศ */}
      <div
        className={cn(currentStep === 0 && !isPetSourceStep && 'text-center')}
      >
        <h1 className="text-2xl font-bold tracking-tight text-emerald-800 dark:text-emerald-400 sm:text-3xl lg:text-4xl">
          {isPetSourceStep
            ? 'เลือกแหล่งข้อมูลสัตว์เลี้ยง'
            : currentStep === 0
              ? 'เลือกประเภทประกาศที่ตรงกับสถานการณ์ของคุณ'
              : currentStep === 1
                ? postType === 'FOUND'
                  ? 'แจ้งพบสัตว์'
                  : 'แจ้งสัตว์เลี้ยงหาย'
                : 'ตรวจสอบและยืนยันประกาศ'}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          {isPetSourceStep
            ? 'สัตว์ที่หายอยู่ใน Pet Profile ของคุณหรือไม่?'
            : currentStep === 0
              ? 'เลือกประเภทประกาศเพื่อเริ่มกรอกข้อมูล'
              : currentStep === 1
                ? postType === 'FOUND'
                  ? 'กรอกข้อมูลสัตว์ที่พบ เพื่อช่วยตามหาเจ้าของผ่านระบบและชุมชน'
                  : 'กรอกข้อมูลสัตว์เลี้ยงของคุณเพื่อสร้างประกาศตามหาในระบบ แผนที่ และแชร์ไปยังชุมชน'
                : 'ตรวจสอบความถูกต้องของข้อมูลและตัวอย่างประกาศก่อนเผยแพร่สู่ระบบ'}
        </p>
      </div>

      {/* Toast แจ้งเตือน */}
      {toast && (
        <div
          role={toast.variant === 'error' ? 'alert' : 'status'}
          className={cn(
            'flex items-center gap-2 rounded-2xl p-4 text-xs font-bold sm:text-sm animate-in fade-in slide-in-from-top-2',
            toast.variant === 'success' &&
              'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
            toast.variant === 'error' &&
              'bg-destructive/10 text-destructive dark:bg-destructive/15',
            toast.variant === 'info' &&
              'bg-blue-500/10 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
          )}
        >
          {toast.variant === 'success' ? (
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
          ) : toast.variant === 'error' ? (
            <AlertCircle className="size-5 shrink-0 text-destructive" />
          ) : (
            <Info className="size-5 shrink-0 text-blue-600" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* 2. ตัวระบุความคืบหน้าของฟอร์มหลังเลือกประเภทประกาศแล้ว */}
      {currentStep !== 0 && !isPetSourceStep && (
        <div className="flex items-center justify-center rounded-3xl border border-border/80 bg-card p-4 shadow-2xs sm:p-5">
          <div className="flex items-center justify-center gap-3 sm:gap-6 max-w-lg w-full">
            {/* Step 1 */}
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-2.5 text-left group cursor-pointer shrink-0"
            >
              <div
                className={cn(
                  'flex size-8.5 items-center justify-center rounded-full text-xs font-bold shadow-xs transition-colors',
                  currentStep === 1
                    ? 'bg-emerald-700 text-white ring-4 ring-emerald-600/15'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400',
                )}
              >
                {currentStep === 2 ? (
                  <Check className="size-4 stroke-[3]" />
                ) : (
                  '1'
                )}
              </div>
              <div className="flex flex-col">
                <span
                  className={cn(
                    'text-xs font-bold sm:text-sm transition-colors',
                    currentStep === 1
                      ? 'text-emerald-800 dark:text-emerald-400'
                      : 'text-foreground',
                  )}
                >
                  ข้อมูลสัตว์เลี้ยง
                </span>
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  รูปภาพและรายละเอียด
                </span>
              </div>
            </button>

            {/* เส้นเชื่อมต่อระหว่าง Step (ความยาวพอดี ไม่ห่างเกินไป) */}
            <div className="h-0.5 w-12 sm:w-20 bg-border rounded-full shrink-0" />

            {/* Step 2 */}
            <div className="flex items-center gap-2.5 text-left shrink-0">
              <div
                className={cn(
                  'flex size-8.5 items-center justify-center rounded-full text-xs font-bold shadow-xs transition-colors',
                  currentStep === 2
                    ? 'bg-emerald-700 text-white ring-4 ring-emerald-600/15'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                2
              </div>
              <div className="flex flex-col">
                <span
                  className={cn(
                    'text-xs font-bold sm:text-sm transition-colors',
                    currentStep === 2
                      ? 'text-emerald-800 dark:text-emerald-400'
                      : 'text-muted-foreground',
                  )}
                >
                  ตรวจสอบ & ยืนยัน
                </span>
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  ดูตัวอย่างก่อนเผยแพร่
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. STEP LOST: เลือกว่าจะใช้ข้อมูลจาก Pet Profile หรือกรอกเอง */}
      {isPetSourceStep && (
        <section className="mx-auto w-full max-w-3xl animate-in fade-in duration-200">
          <div className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm sm:p-8">
            <div className="mb-6 flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                ขั้นตอนข้อมูลสัตว์เลี้ยง
              </span>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                สัตว์ที่หายอยู่ใน Pet Profile ของคุณหรือไม่?
              </h2>
              <p className="text-sm text-muted-foreground">
                เลือกใช้ข้อมูลที่บันทึกไว้เพื่อกรอกแบบฟอร์มบางส่วนให้โดยอัตโนมัติ
                หรือกรอกข้อมูลสัตว์ตัวอื่นด้วยตัวเอง
              </p>
            </div>

            <div
              role="radiogroup"
              aria-label="แหล่งข้อมูลสัตว์เลี้ยง"
              className="grid gap-4 md:grid-cols-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={petSource === 'PROFILE'}
                disabled={isLoadingPetProfile}
                onClick={() => {
                  if (petSource !== 'PROFILE') clearPetDetails();
                  setPetSource('PROFILE');
                }}
                className={cn(
                  'flex min-h-32 items-start gap-4 rounded-3xl border-2 p-5 text-left transition-all sm:p-6',
                  petSource === 'PROFILE'
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/15'
                    : 'border-border bg-background hover:border-primary/50 hover:bg-muted/30',
                  isLoadingPetProfile && 'cursor-not-allowed opacity-70',
                )}
              >
                <span
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-2xl',
                    petSource === 'PROFILE'
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <PawPrint className="size-6" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-foreground sm:text-lg">
                    ใช่ ใช้ข้อมูลจาก Pet Profile
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    เลือกสัตว์เลี้ยงที่บันทึกไว้ แล้วเติมชื่อ ชนิด สายพันธุ์
                    และรายละเอียดที่มีให้
                  </span>
                </span>
                <span
                  className={cn(
                    'mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                    petSource === 'PROFILE'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/40',
                  )}
                  aria-hidden="true"
                >
                  {petSource === 'PROFILE' && (
                    <Check className="size-4 stroke-[3]" />
                  )}
                </span>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={petSource === 'MANUAL'}
                disabled={isLoadingPetProfile}
                onClick={() => {
                  if (petSource !== 'MANUAL') clearPetDetails();
                  setPetSource('MANUAL');
                }}
                className={cn(
                  'flex min-h-32 items-start gap-4 rounded-3xl border-2 p-5 text-left transition-all sm:p-6',
                  petSource === 'MANUAL'
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/15'
                    : 'border-border bg-background hover:border-primary/50 hover:bg-muted/30',
                  isLoadingPetProfile && 'cursor-not-allowed opacity-70',
                )}
              >
                <span
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-2xl',
                    petSource === 'MANUAL'
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Plus className="size-6" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-foreground sm:text-lg">
                    ไม่ใช่ กรอกข้อมูลด้วยตัวเอง
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    ใช้สำหรับสัตว์ที่ไม่ได้บันทึกไว้ใน Pet Profile
                  </span>
                </span>
                <span
                  className={cn(
                    'mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                    petSource === 'MANUAL'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/40',
                  )}
                  aria-hidden="true"
                >
                  {petSource === 'MANUAL' && (
                    <Check className="size-4 stroke-[3]" />
                  )}
                </span>
              </button>
            </div>

            {petSource === 'PROFILE' && (
              <div className="mt-6 rounded-3xl border border-border/70 bg-muted/20 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-foreground sm:text-base">
                      เลือกสัตว์เลี้ยงของคุณ
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      เลือกการ์ดเพื่อเติมข้อมูลในขั้นตอนถัดไป
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    {initialPets.length} รายการ
                  </span>
                </div>

                {initialPets.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-border bg-background p-5 text-center">
                    <PawPrint className="mx-auto size-8 text-muted-foreground/60" />
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      ยังไม่มีสัตว์เลี้ยงใน Pet Profile
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      เลือกกรอกข้อมูลด้วยตัวเองเพื่อไปต่อได้ทันที
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        clearPetDetails();
                        setPetSource('MANUAL');
                      }}
                      className="mt-4 h-9 rounded-xl text-xs font-bold"
                    >
                      กรอกข้อมูลเอง
                    </Button>
                  </div>
                ) : (
                  <div
                    role="radiogroup"
                    aria-label="สัตว์เลี้ยงใน Pet Profile"
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                  >
                    {initialPets.map((pet) => {
                      const isSelected = selectedPetId === pet.id;
                      const petImageUrl = getPetProfileImageUrl(pet);

                      return (
                        <button
                          key={pet.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          aria-busy={isSelected && isLoadingPetProfile}
                          disabled={isLoadingPetProfile}
                          onClick={() => void handlePetProfileSelect(pet)}
                          className={cn(
                            'flex min-h-20 items-center gap-3 rounded-2xl border-2 bg-background p-3 text-left transition-all',
                            isSelected
                              ? 'border-primary bg-primary/5 ring-2 ring-primary/10'
                              : 'border-border hover:border-primary/50 hover:bg-muted/30',
                            isLoadingPetProfile &&
                              'cursor-not-allowed opacity-70',
                          )}
                        >
                          <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted text-muted-foreground">
                            {petImageUrl ? (
                              <Image
                                src={petImageUrl}
                                alt={pet.name}
                                fill
                                sizes="56px"
                                unoptimized
                                className="object-cover"
                              />
                            ) : (
                              <PawPrint className="size-7" aria-hidden="true" />
                            )}
                          </div>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-foreground sm:text-base">
                              {pet.name}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {getPetTypeLabel(pet.type)}
                              {pet.breed ? ` • ${pet.breed}` : ''}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-muted-foreground/40',
                            )}
                            aria-hidden="true"
                          >
                            {isSelected && isLoadingPetProfile ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              isSelected && (
                                <Check className="size-3.5 stroke-[3]" />
                              )
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {petSource === 'MANUAL' && (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
                <Info className="mt-0.5 size-5 shrink-0 text-primary" />
                <p>
                  ขั้นตอนถัดไปจะเปิดช่องให้กรอกข้อมูลสัตว์เลี้ยงทั้งหมดด้วยตัวเอง
                </p>
              </div>
            )}

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                disabled={isLoadingPetProfile}
                onClick={() => {
                  setIsPetSourceStep(false);
                  setCurrentStep(0);
                }}
                className="h-11 rounded-2xl px-4 font-bold text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="mr-2 size-5" />
                ย้อนกลับ
              </Button>
              <Button
                type="button"
                disabled={
                  !petSource ||
                  (petSource === 'PROFILE' &&
                    (!selectedPetId || isLoadingPetProfile))
                }
                onClick={() => {
                  setIsPetSourceStep(false);
                  setCurrentStep(1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="h-11 rounded-2xl px-6 font-bold"
              >
                ถัดไป
                <ArrowRight className="ml-2 size-5" />
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* 4. STEP 0: เลือกประเภทประกาศก่อนเริ่มกรอกข้อมูล */}
      {currentStep === 0 && !isPetSourceStep && (
        <section className="mx-auto w-full max-w-2xl animate-in fade-in duration-200">
          <div className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm sm:p-8">
            <div
              role="radiogroup"
              aria-label="ประเภทประกาศ"
              className="flex flex-col gap-4"
            >
              {POST_TYPE_OPTIONS.map((option) => {
                const isSelected = postType === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => {
                      if (option.value === 'FOUND' && postType !== 'FOUND') {
                        clearPetDetails();
                        setPetSource(null);
                      }
                      setPostType(option.value);
                    }}
                    className={cn(
                      'flex min-h-28 w-full items-center gap-4 rounded-3xl border-2 px-5 py-5 text-left transition-all sm:px-7',
                      isSelected
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/15'
                        : 'border-border bg-background hover:border-primary/50 hover:bg-muted/30',
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-12 shrink-0 items-center justify-center rounded-2xl',
                        isSelected
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {option.value === 'LOST' ? (
                        <Search className="size-7" aria-hidden="true" />
                      ) : (
                        <PawPrint className="size-7" aria-hidden="true" />
                      )}
                    </div>

                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-bold text-foreground sm:text-lg">
                        {option.title}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground sm:text-sm">
                        {option.description}
                      </span>
                    </span>

                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/40',
                      )}
                      aria-hidden="true"
                    >
                      {isSelected && <Check className="size-4 stroke-[3]" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              disabled={!postType}
              onClick={() => {
                if (!postType) return;

                if (!getValues('eventDate')) {
                  const defaultEventDate = getLocalDateTimeValue();
                  setEventDate(defaultEventDate);
                  setValue('eventDate', defaultEventDate, {
                    shouldDirty: false,
                    shouldValidate: false,
                  });
                }

                if (postType === 'LOST') {
                  clearPetDetails();
                  setPetSource(null);
                  setIsPetSourceStep(true);
                } else {
                  setCurrentStep(1);
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="mt-7 h-12 w-full rounded-2xl text-base font-bold"
            >
              ถัดไป
              <ArrowRight className="ml-2 size-5" />
            </Button>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 4. STEP 1: หน้าฟอร์มกรอกข้อมูลสัตว์เลี้ยง (Form View) */}
      {/* ========================================================================= */}
      {currentStep === 1 && !isPetSourceStep && (
        <div className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm sm:p-8 lg:p-10 dark:border-border/60 animate-in fade-in duration-200">
          <div className="mb-6 flex items-center justify-between gap-3 border-b border-border/60 pb-5">
            <div>
              <span className="text-xs text-muted-foreground">
                ประเภทประกาศ
              </span>
              <p className="text-sm font-bold text-foreground sm:text-base">
                {postType === 'FOUND' ? 'ฉันพบสัตว์' : 'สัตว์เลี้ยงของฉันหาย'}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsPetSourceStep(false);
                setCurrentStep(0);
              }}
              className="text-xs font-bold text-primary sm:text-sm"
            >
              เปลี่ยนประเภท
            </Button>
          </div>
          <form
            onSubmit={handleGoToReview}
            className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10"
          >
            {/* ฝั่งซ้าย: รูปภาพสัตว์เลี้ยง (Pet Images) */}
            <div className="flex flex-col gap-4 lg:col-span-5">
              <h3 className="text-base font-bold text-foreground sm:text-lg">
                รูปภาพสัตว์เลี้ยง
              </h3>

              {/* กล่อง Dashed Dropzone ขนาดใหญ่ */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-emerald-500/50 bg-emerald-50/40 p-6 text-center transition-all hover:border-emerald-600 hover:bg-emerald-50/80 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30 sm:min-h-[250px]"
              >
                <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shadow-xs transition-transform group-hover:scale-110 dark:bg-emerald-900/60 dark:text-emerald-300">
                  <Camera className="size-7 stroke-[2.2]" />
                </div>
                <span className="mt-3.5 text-sm font-bold text-foreground group-hover:text-emerald-700 sm:text-base dark:group-hover:text-emerald-300">
                  คลิกเพื่ออัปโหลดรูปภาพ
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  อัปโหลดได้สูงสุด 3 รูป (ไฟล์ JPG, PNG, WEBP ขนาดไม่เกิน 5
                  MB/ไฟล์)
                </span>
              </div>

              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* รายการ Thumbnails */}
              <div className="flex items-center gap-3 overflow-x-auto py-1">
                {profileImageUrl && (
                  <div className="relative size-18 shrink-0 overflow-hidden rounded-2xl border-2 border-primary/50 shadow-xs">
                    <Image
                      src={profileImageUrl}
                      alt={`รูปจาก Pet Profile ของ ${petName}`}
                      fill
                      sizes="72px"
                      unoptimized
                      className="object-cover"
                    />
                    <span className="absolute bottom-0 left-0 right-0 bg-emerald-800/85 px-1 py-0.5 text-center text-[9px] font-bold text-white">
                      Pet Profile
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveProfileImage}
                      className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-destructive text-white shadow-xs transition-transform hover:scale-110"
                      aria-label="ลบรูปจาก Pet Profile"
                    >
                      <X className="size-3 stroke-[3]" />
                    </button>
                  </div>
                )}

                {images.map((imgUrl, idx) => (
                  <div
                    key={`upload-${idx}`}
                    className="relative size-18 shrink-0 overflow-hidden rounded-2xl border-2 border-border shadow-xs"
                  >
                    <Image
                      src={imgUrl}
                      alt={`รูปที่ ${idx + 1}`}
                      fill
                      sizes="72px"
                      unoptimized
                      className="object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-destructive text-white shadow-xs transition-transform hover:scale-110"
                      aria-label="ลบรูปภาพ"
                    >
                      <X className="size-3 stroke-[3]" />
                    </button>
                  </div>
                ))}

                {Array.from({
                  length: Math.max(
                    0,
                    MAX_POST_IMAGES - images.length - (profileImageUrl ? 1 : 0),
                  ),
                }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex size-18 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-muted/30 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    aria-label="เพิ่มรูปภาพเพิ่มเติม"
                  >
                    <Plus className="size-6" />
                  </button>
                ))}
              </div>

              {/* ปุ่ม AI วิเคราะห์สายพันธุ์และลักษณะสีขน */}
              <button
                type="button"
                onClick={handleAiAnalyzeImage}
                disabled={isAnalyzingAi}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-purple-300 bg-purple-100/70 py-3 text-xs font-bold text-purple-800 shadow-2xs transition-all hover:bg-purple-100 active:scale-95 disabled:opacity-50 sm:text-sm dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300"
              >
                <Sparkles className="size-4 text-purple-600 dark:text-purple-400" />
                <span>
                  {isAnalyzingAi
                    ? 'กำลังวิเคราะห์ภาพถ่าย...'
                    : '✨ AI วิเคราะห์สายพันธุ์และลักษณะสีขน'}
                </span>
              </button>
            </div>

            {/* ฝั่งขวา: ข้อมูลรายละเอียดสัตว์เลี้ยง */}
            <div className="flex flex-col gap-4 lg:col-span-7">
              <h3 className="text-base font-bold text-foreground sm:text-lg">
                ข้อมูลรายละเอียดสัตว์เลี้ยง
              </h3>

              {/* ชื่อ & ประเภท */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="petName" className="text-xs font-semibold">
                    ชื่อสัตว์เลี้ยง <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...register('petName')}
                    id="petName"
                    value={petName}
                    onChange={(event) => {
                      setPetName(event.target.value);
                      syncFormValue('petName', event.target.value);
                    }}
                    placeholder="เช่น น้องส้มส้ม"
                    aria-invalid={Boolean(errors.petName)}
                    className={cn(
                      'rounded-2xl',
                      errors.petName && 'border-destructive',
                    )}
                  />
                  {errors.petName && (
                    <p className="text-xs text-destructive" role="alert">
                      {errors.petName.message}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="petType" className="text-xs font-semibold">
                    ประเภทสัตว์เลี้ยง{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <select
                    {...register('petType')}
                    id="petType"
                    value={petType}
                    onChange={(event) => {
                      const value = event.target.value as PetType;
                      setPetType(value);
                      syncFormValue('petType', value);
                    }}
                    aria-invalid={Boolean(errors.petType)}
                    className={cn(
                      'h-10 rounded-2xl border border-border bg-background px-3 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary',
                      errors.petType && 'border-destructive',
                    )}
                  >
                    <option value="CAT">แมว</option>
                    <option value="DOG">สุนัข</option>
                    <option value="BIRD">นก</option>
                    <option value="HAMSTER">แฮมสเตอร์</option>
                    <option value="EXOTIC">สัตว์พิเศษ</option>
                    <option value="OTHER">อื่นๆ</option>
                  </select>
                  {errors.petType && (
                    <p className="text-xs text-destructive" role="alert">
                      {errors.petType.message}
                    </p>
                  )}
                </div>
              </div>

              {/* สายพันธุ์ & สีขนหลัก */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="breed" className="text-xs font-semibold">
                    สายพันธุ์ <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...register('breed')}
                    id="breed"
                    value={breed}
                    onChange={(event) => {
                      setBreed(event.target.value);
                      syncFormValue('breed', event.target.value);
                    }}
                    placeholder="เช่น แมวไทย (สลิด)"
                    aria-invalid={Boolean(errors.breed)}
                    className={cn(
                      'rounded-2xl',
                      errors.breed && 'border-destructive',
                    )}
                  />
                  {errors.breed && (
                    <p className="text-xs text-destructive" role="alert">
                      {errors.breed.message}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="color" className="text-xs font-semibold">
                    สีขนหลัก <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...register('color')}
                    id="color"
                    value={color}
                    onChange={(event) => {
                      setColor(event.target.value);
                      syncFormValue('color', event.target.value);
                    }}
                    placeholder="เช่น สีส้มสลับขาว"
                    aria-invalid={Boolean(errors.color)}
                    className={cn(
                      'rounded-2xl',
                      errors.color && 'border-destructive',
                    )}
                  />
                  {errors.color && (
                    <p className="text-xs text-destructive" role="alert">
                      {errors.color.message}
                    </p>
                  )}
                </div>
              </div>

              {/* เพศ */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold">
                  เพศ <span className="text-destructive">*</span>
                </Label>
                <div className="flex flex-wrap items-center gap-5 pt-1 text-xs sm:text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      {...register('gender')}
                      type="radio"
                      value="MALE"
                      checked={gender === 'MALE'}
                      onChange={() => {
                        setGender('MALE');
                        syncFormValue('gender', 'MALE');
                      }}
                      className="size-4 accent-emerald-600"
                    />
                    <span>ตัวผู้</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      {...register('gender')}
                      type="radio"
                      value="FEMALE"
                      checked={gender === 'FEMALE'}
                      onChange={() => {
                        setGender('FEMALE');
                        syncFormValue('gender', 'FEMALE');
                      }}
                      className="size-4 accent-emerald-600"
                    />
                    <span>ตัวเมีย</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      {...register('gender')}
                      type="radio"
                      value="UNKNOWN"
                      checked={gender === 'UNKNOWN'}
                      onChange={() => {
                        setGender('UNKNOWN');
                        syncFormValue('gender', 'UNKNOWN');
                      }}
                      className="size-4 accent-emerald-600"
                    />
                    <span>ไม่ทราบเพศ / ไม่ระบุ</span>
                  </label>
                </div>
                {errors.gender && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.gender.message}
                  </p>
                )}
              </div>

              {/* ลักษณะเด่น */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="features" className="text-xs font-semibold">
                    ลักษณะเด่น / ข้อมูลเพิ่มเติม{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <button
                    type="button"
                    onClick={handleAiGenerateDescription}
                    disabled={isGeneratingDesc}
                    className="flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-700 hover:bg-purple-200 dark:bg-purple-950 dark:text-purple-300"
                  >
                    <Wand2 className="size-3" />
                    <span>
                      {isGeneratingDesc
                        ? 'กำลังเขียน...'
                        : '✨ AI ช่วยเขียนคำบรรยาย'}
                    </span>
                  </button>
                </div>
                <textarea
                  {...register('distinctiveFeatures')}
                  id="features"
                  rows={3}
                  value={distinctiveFeatures}
                  onChange={(event) => {
                    setDistinctiveFeatures(event.target.value);
                    syncFormValue('distinctiveFeatures', event.target.value);
                  }}
                  placeholder="ระบุจุดสังเกต เช่น มีปลอกคอ แผลเป็น นิสัย หรือพฤติกรรม..."
                  aria-invalid={Boolean(errors.distinctiveFeatures)}
                  className={cn(
                    'w-full rounded-2xl border border-border bg-background p-3 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed',
                    errors.distinctiveFeatures && 'border-destructive',
                  )}
                />
                {errors.distinctiveFeatures && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.distinctiveFeatures.message}
                  </p>
                )}
              </div>

              {/* พิกัด & วันที่หาย */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="location-picker-button"
                    className="text-xs font-semibold"
                  >
                    {postType === 'FOUND'
                      ? 'พิกัด/สถานที่พบ'
                      : 'พิกัด/สถานที่หาย'}{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <div
                    id="location"
                    role="status"
                    aria-live="polite"
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-2xl border bg-muted/20 px-3.5 text-xs sm:text-sm',
                      errors.locationDescription
                        ? 'border-destructive'
                        : 'border-border',
                    )}
                  >
                    <MapPin className="size-4 shrink-0 text-primary" />
                    <span
                      className={cn(
                        'break-words leading-relaxed',
                        !locationDescription && 'text-muted-foreground',
                      )}
                    >
                      {locationDescription || 'ยังไม่ได้เลือกตำแหน่งจากแผนที่'}
                    </span>
                  </div>
                  {errors.locationDescription && (
                    <p className="text-xs text-destructive" role="alert">
                      {errors.locationDescription.message}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    กดปุ่มด้านล่างเพื่อค้นหาหรือเลือกจุดบนแผนที่
                  </p>
                  <Button
                    id="location-picker-button"
                    type="button"
                    variant="outline"
                    onClick={() => setIsLocationPickerOpen(true)}
                    className="h-11 w-full rounded-2xl text-xs font-semibold sm:text-sm"
                  >
                    <MapPin className="mr-1.5 size-4 text-primary" />
                    {coordinates
                      ? 'เปลี่ยนตำแหน่งจากแผนที่'
                      : 'เลือกตำแหน่งจากแผนที่'}
                  </Button>
                  {coordinates && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      เลือกตำแหน่งสำหรับประกาศแล้ว
                    </p>
                  )}
                  {isResolvingLocation && (
                    <p className="text-[11px] text-muted-foreground">
                      กำลังดึงที่อยู่เต็มจากจุดที่เลือก...
                    </p>
                  )}
                  {locationLookupError && (
                    <p className="text-xs text-destructive" role="alert">
                      {locationLookupError}
                    </p>
                  )}
                  {!coordinates && !geolocationError && (
                    <p className="text-[11px] text-muted-foreground">
                      ต้องเลือกตำแหน่งบนแผนที่ก่อนเข้าสู่หน้าตรวจสอบ
                    </p>
                  )}
                  {locationValidationError && (
                    <p className="text-xs text-destructive" role="alert">
                      {locationValidationError}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="datetime" className="text-xs font-semibold">
                    วันที่และเวลาที่{postType === 'FOUND' ? 'พบ' : 'หาย'}{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <DateTimePicker
                    id="datetime"
                    value={eventDate}
                    onChange={(value) => {
                      setEventDate(value);
                      syncFormValue('eventDate', value);
                    }}
                    hasError={Boolean(errors.eventDate)}
                  />
                  {errors.eventDate && (
                    <p className="text-xs text-destructive" role="alert">
                      {errors.eventDate.message}
                    </p>
                  )}
                </div>
              </div>

              {/* รางวัล & เบอร์ติดต่อ */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reward" className="text-xs font-semibold">
                    เงินรางวัลนำส่ง (ถ้ามี)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                      ฿
                    </span>
                    <Input
                      {...register('rewardAmount')}
                      id="reward"
                      value={rewardAmount}
                      onChange={(event) => {
                        setRewardAmount(event.target.value);
                        syncFormValue('rewardAmount', event.target.value);
                      }}
                      placeholder="5,000"
                      aria-invalid={Boolean(errors.rewardAmount)}
                      className={cn(
                        'rounded-2xl pl-8 font-semibold',
                        errors.rewardAmount && 'border-destructive',
                      )}
                    />
                  </div>
                  {errors.rewardAmount && (
                    <p className="text-xs text-destructive" role="alert">
                      {errors.rewardAmount.message}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone" className="text-xs font-semibold">
                    เบอร์ติดต่อเจ้าของ{' '}
                    <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-primary" />
                    <Input
                      {...register('contactPhone')}
                      id="phone"
                      value={contactPhone}
                      onChange={(event) => {
                        setContactPhone(event.target.value);
                        syncFormValue('contactPhone', event.target.value);
                      }}
                      placeholder="เช่น 089-123-4567"
                      aria-invalid={Boolean(errors.contactPhone)}
                      className={cn(
                        'rounded-2xl pl-10',
                        errors.contactPhone && 'border-destructive',
                      )}
                    />
                  </div>
                  {errors.contactPhone && (
                    <p className="text-xs text-destructive" role="alert">
                      {errors.contactPhone.message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* แถบ Action ด้านล่างของ Step 1 */}
            <div className="lg:col-span-12 flex items-center justify-between border-t border-dashed border-border/80 pt-6 mt-2">
              <Link
                href="/posts"
                className="inline-flex h-11 items-center justify-center rounded-full sm:rounded-2xl border border-destructive/40 bg-destructive/5 px-6 text-xs font-bold text-destructive transition-all hover:bg-destructive/15 hover:border-destructive/60 active:scale-95 sm:text-sm"
              >
                ยกเลิก
              </Link>

              {/* ปุ่มไปยังขั้นตอนตรวจสอบ */}
              <Button
                type="submit"
                className="h-11 rounded-full sm:rounded-2xl bg-emerald-800 px-7 text-xs font-bold text-white shadow-md transition-transform hover:scale-105 hover:bg-emerald-900 sm:text-sm"
              >
                <span>ตรวจสอบก่อนยืนยัน</span>
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. STEP 2: หน้าตรวจสอบและดูตัวอย่างประกาศ (Live Preview View) */}
      {/* ========================================================================= */}
      {currentStep === 2 && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          {/* แบนเนอร์ AI Readiness & Confirmation Alert */}
          <div className="flex items-center gap-3 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-4.5 sm:p-5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-xs">
              <ShieldCheck className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-xs sm:text-sm text-emerald-900 dark:text-emerald-300">
                ระบบพร้อมกระจายประกาศและเปิดใช้งาน AI Smart Matching
              </span>
              <p className="text-xs text-muted-foreground">
                เมื่อกดยืนยัน ประกาศจะขึ้นบนหน้าฟีด แผนที่เรียลไทม์
                และเริ่มสแกนจับคู่กับสัตว์เลี้ยงที่พบเห็นทันที
              </p>
            </div>
          </div>

          {/* กล่องแสดงตัวอย่างประกาศ (2 คอลัมน์) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* ฝั่งซ้าย: การ์ดตัวอย่างประกาศจริง (Feed Card Preview) - 5 Cols */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="size-4 text-primary" />
                <span>ตัวอย่างการ์ดบนหน้าฟีด</span>
              </h3>

              <div className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-lg">
                <div className="relative h-60 w-full bg-muted">
                  {profileImageUrl || images[0] ? (
                    <Image
                      src={profileImageUrl || images[0]}
                      alt={petName}
                      fill
                      sizes="(min-width: 1024px) 40vw, 100vw"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Camera className="size-8" />
                      <span className="text-xs">ยังไม่มีรูปภาพ</span>
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <span className="rounded-full bg-destructive px-3 py-1 text-xs font-bold text-white shadow-xs">
                      {postType === 'FOUND'
                        ? 'พบสัตว์ (FOUND)'
                        : 'ตามหา (LOST)'}
                    </span>
                  </div>

                  {rewardAmount && (
                    <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-amber-300 backdrop-blur-xs">
                      <Coins className="size-3.5" />
                      <span>รางวัล ฿{rewardAmount}</span>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <h4 className="text-lg font-bold text-foreground">
                    {petName}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {getPetTypeLabel(petType)} • {breed} •{' '}
                    {getGenderLabel(gender)}
                  </p>

                  <div className="mt-3 flex flex-col gap-1.5 text-xs text-muted-foreground border-t border-border/50 pt-3">
                    <span className="flex items-center gap-1.5 line-clamp-1">
                      <MapPin className="size-3.5 text-primary shrink-0" />
                      {locationDescription}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="size-3.5 text-primary shrink-0" />
                      {formatEventDate(eventDate)}
                    </span>
                    <span className="flex items-center gap-1.5 font-bold text-foreground">
                      <Phone className="size-3.5 text-primary shrink-0" />
                      {contactPhone}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ฝั่งขวา: รายการสรุปข้อมูลทั้งหมด (Summary Fact Sheet) - 7 Cols */}
            <div className="lg:col-span-7 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                สรุปข้อมูลที่กรอกทั้งหมด
              </h3>

              <div className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm flex flex-col gap-4">
                {/* ข้อมูลทั่วไป */}
                <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                  <div className="rounded-2xl bg-muted/40 p-3">
                    <span className="text-xs text-muted-foreground">
                      ชื่อสัตว์เลี้ยง
                    </span>
                    <p className="font-bold text-foreground mt-0.5">
                      {petName}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-muted/40 p-3">
                    <span className="text-xs text-muted-foreground">
                      ประเภท & สายพันธุ์
                    </span>
                    <p className="font-bold text-foreground mt-0.5">
                      {getPetTypeLabel(petType)} ({breed})
                    </p>
                  </div>

                  <div className="rounded-2xl bg-muted/40 p-3">
                    <span className="text-xs text-muted-foreground">
                      สีขน & เพศ
                    </span>
                    <p className="font-bold text-foreground mt-0.5">
                      {color} • {getGenderLabel(gender)}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-muted/40 p-3">
                    <span className="text-xs text-muted-foreground">
                      เงินรางวัล
                    </span>
                    <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {rewardAmount ? `฿ ${rewardAmount} บาท` : 'ไม่มีระบุ'}
                    </p>
                  </div>
                </div>

                {/* ลักษณะเด่น */}
                <div className="rounded-2xl bg-muted/30 p-4 border border-border/60">
                  <span className="text-xs font-bold text-foreground">
                    ลักษณะเด่น / จุดสังเกต:
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed sm:text-sm">
                    {distinctiveFeatures}
                  </p>
                </div>

                {/* สถานที่และเบอร์ติดต่อ */}
                <div className="flex flex-col gap-2 rounded-2xl bg-emerald-50/50 p-4 border border-emerald-500/20 text-xs sm:text-sm dark:bg-emerald-950/20">
                  <div className="flex items-center gap-2 text-foreground font-semibold">
                    <MapPin className="size-4 text-emerald-600 shrink-0" />
                    <span>สถานที่: {locationDescription}</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground font-semibold">
                    <Calendar className="size-4 text-emerald-600 shrink-0" />
                    <span>
                      วันที่และเวลาที่{postType === 'FOUND' ? 'พบ' : 'หาย'}:{' '}
                      {formatEventDate(eventDate)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground font-semibold">
                    <Phone className="size-4 text-emerald-600 shrink-0" />
                    <span>เบอร์ติดต่อ: {contactPhone}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* แถบ Action ด้านล่างของ Step 2 */}
          <div className="flex items-center justify-between border-t border-dashed border-border/80 pt-6 mt-4">
            {/* ปุ่มกลับไปแก้ไขข้อมูล */}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCurrentStep(1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="h-11 rounded-full sm:rounded-2xl border-border px-5 text-xs font-bold text-foreground sm:text-sm hover:bg-muted"
            >
              <ArrowLeft className="mr-1.5 size-4" />
              <span>กลับไปแก้ไขข้อมูล</span>
            </Button>

            {/* ปุ่มยืนยันและเผยแพร่ประกาศ */}
            <Button
              type="button"
              onClick={handleFinalPublish}
              disabled={isPublishing}
              className="gap-2 h-11 rounded-full sm:rounded-2xl bg-emerald-800 px-7 text-xs font-bold text-white shadow-lg transition-transform hover:scale-105 hover:bg-emerald-900 sm:text-sm"
            >
              {isPublishing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              <span>
                {isPublishing
                  ? 'กำลังเผยแพร่...'
                  : pendingUploadPostId
                    ? 'ลองอัปโหลดรูปภาพอีกครั้ง'
                    : 'ยืนยันและเผยแพร่ประกาศ'}
              </span>
            </Button>
          </div>
        </div>
      )}

      {/* หน้าต่างเลือกพิกัดที่เปิดเมื่อผู้ใช้ต้องการเลือกจุดจากแผนที่ */}
      {isLocationPickerOpen && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="location-picker-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsLocationPickerOpen(false);
            }
          }}
        >
          <section className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl sm:max-h-[calc(100vh-3rem)]">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <h2
                  id="location-picker-title"
                  className="text-base font-bold text-foreground sm:text-lg"
                >
                  เลือกตำแหน่งประกาศ
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                  ค้นหาสถานที่หรือคลิกบนแผนที่เพื่อเลือกพิกัด
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsLocationPickerOpen(false)}
                aria-label="ปิดหน้าต่างเลือกตำแหน่ง"
                className="shrink-0 rounded-full"
              >
                <X className="size-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  แผนที่นี้ใช้เลือกพิกัดสำหรับประกาศเท่านั้น ไม่มีหมุดโพสต์อื่น
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={requestCurrentLocation}
                  disabled={isLocating}
                  className="rounded-xl text-xs font-semibold"
                >
                  {isLocating ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <MapPin className="mr-1.5 size-3.5" />
                  )}
                  {isLocating ? 'กำลังค้นหาตำแหน่ง...' : 'ใช้ตำแหน่งปัจจุบัน'}
                </Button>
              </div>

              <form
                onSubmit={handleLocationSearch}
                className="mb-3 flex flex-col gap-2"
              >
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={locationSearchQuery}
                      onChange={(event) => {
                        setLocationSearchQuery(event.target.value);
                        setLocationSearchError(null);
                      }}
                      placeholder="ค้นหาสถานที่ เช่น Metro Fashion Mall"
                      aria-label="ค้นหาสถานที่"
                      className="rounded-2xl pl-10 text-xs sm:text-sm"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={
                      isSearchingLocations || !locationSearchQuery.trim()
                    }
                    className="shrink-0 rounded-2xl px-4 text-xs font-semibold sm:text-sm"
                  >
                    {isSearchingLocations ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Search className="size-4" />
                    )}
                    <span className="sr-only sm:not-sr-only sm:ml-1.5">
                      ค้นหา
                    </span>
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  คลิกผลค้นหาเพื่อเลือกพิกัดทันที หรือคลิกจุดที่ต้องการบนแผนที่
                </p>
              </form>

              {locationSearchError && (
                <p className="mb-3 text-xs text-destructive" role="alert">
                  {locationSearchError}
                </p>
              )}
              {locationSearchResults.length > 0 && (
                <div className="mb-3 overflow-hidden rounded-2xl border border-border/80 bg-background">
                  <p className="border-b border-border/60 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
                    ผลการค้นหา — คลิกเพื่อเลือกพิกัด
                  </p>
                  <div className="divide-y divide-border/60">
                    {locationSearchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => handleLocationSearchResultSelect(result)}
                        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/60 sm:text-sm"
                      >
                        <MapPin className="mt-0.5 size-4 shrink-0 text-violet-600" />
                        <span className="leading-relaxed text-foreground">
                          {result.displayName}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-border/80">
                <CreatePostLocationMap
                  heightClass="h-[55vh] min-h-72 max-h-[480px]"
                  scrollWheelZoom
                  showPostMarkers={false}
                  currentLocation={currentLocation}
                  isLocating={isLocating}
                  locationError={geolocationError}
                  selectedLocation={coordinates}
                  searchLocation={searchLocation}
                  searchLocationRequestToken={searchLocationRequestToken}
                  onLocationSelect={handleLocationSelect}
                />
              </div>

              {geolocationError && (
                <p className="mt-2 text-xs text-destructive" role="alert">
                  {geolocationError}
                </p>
              )}
              {coordinates && (
                <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  เลือกตำแหน่งแล้ว กด “ใช้ตำแหน่งนี้” เพื่อกลับไปกรอกข้อมูล
                </p>
              )}
              {isResolvingLocation && (
                <p className="mt-2 text-xs text-muted-foreground">
                  กำลังดึงที่อยู่เต็มจากจุดที่เลือก...
                </p>
              )}
              {locationLookupError && (
                <p className="mt-2 text-xs text-destructive" role="alert">
                  {locationLookupError}
                </p>
              )}
              <p className="mt-2 text-[10px] text-muted-foreground">
                ที่อยู่จาก Nominatim / OpenStreetMap contributors
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border/70 px-4 py-3 sm:px-6 sm:py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsLocationPickerOpen(false)}
                className="rounded-xl text-xs font-semibold sm:text-sm"
              >
                ปิด
              </Button>
              <Button
                type="button"
                onClick={() => setIsLocationPickerOpen(false)}
                disabled={!coordinates || isLocating || isResolvingLocation}
                className="rounded-xl text-xs font-semibold sm:text-sm"
              >
                ใช้ตำแหน่งนี้
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
