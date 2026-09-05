# Google / LINE authentication

## พฤติกรรมที่ยืนยันแล้ว

- Google และ LINE สมัคร/เข้าสู่ระบบโดยไม่ส่ง email OTP หรือ login OTP จาก PAWND
- การสมัคร/เข้าสู่ระบบด้วยรหัสผ่านคง OTP เดิม รวมถึงค่าตั้ง 2FA ของบัญชี
- บัญชี social ใหม่เป็น ACTIVE หลังตรวจ token จาก provider และมีอีเมลจาก provider
- ใช้ provider subject เป็นตัวตนหลัก ไม่ผูกกับบัญชีเดิมอัตโนมัติจากอีเมลที่ตรงกัน
- บัญชี LINE ใหม่ที่ไม่มีอีเมลได้รับข้อความให้แชร์อีเมลแล้วลองใหม่ ไม่มีฟอร์มกรอกอีเมลเอง
- LINE ที่ผูกกับบัญชี ACTIVE แล้วสามารถเข้าสู่ระบบด้วย subject เดิมแม้ไม่มี email scope
- บัญชี social เดิมที่รอการยืนยันจะเปิดใช้ได้เมื่อ provider ยืนยันอีเมลเดิมและไม่มีรหัสผ่าน local; บัญชีที่ถูกระงับ/ลบ/blacklist ยังถูกปฏิเสธ
- `/auth/line/complete` เก่าปฏิเสธคำขอทั้งหมด ไม่สร้างหรือผูกบัญชีจากอีเมลที่ผู้ใช้กรอก

## การตั้งค่าบน Production

โดเมนเว็บ: `https://pawnd.vercel.app`

### Vercel (Production environment)

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: Web OAuth Client ID จาก Google
- `NEXT_PUBLIC_LINE_CHANNEL_ID`: LINE Login channel ID
- `API_URL`: URL ของ Backend ที่ deploy โค้ดชุดนี้แล้ว
- `AUTH_SECRET`: ใช้ secret ของ environment เดิม ไม่ใส่ secret ในเอกสารหรือ client code
- หลังเปลี่ยน `NEXT_PUBLIC_*` ต้องสร้าง deployment ใหม่ เพราะค่าถูกฝังตอน build

### Backend

- `GOOGLE_CLIENT_ID`: ตรงกับ Google Client ID ฝั่ง Frontend
- `LINE_CHANNEL_ID` และ `LINE_CHANNEL_SECRET`: มาจาก LINE Login channel เดียวกัน
- `FRONTEND_URL`: `https://pawnd.vercel.app`
- `CORS_ALLOWED_ORIGINS`: ต้องอนุญาตโดเมน Production นี้; callback ยอมรับเฉพาะ origin ที่ตั้งค่าไว้ต่อท้ายด้วย `/login`
- ไม่ต้องเปลี่ยน schema หรือรัน migration สำหรับงานนี้

### Google Cloud Console

- ใช้ OAuth client ประเภท Web application
- Authorized JavaScript origins: `https://pawnd.vercel.app` (local เพิ่ม `http://localhost:3000`)
- โค้ดใช้ Google Identity Services button แบบ popup และส่ง ID token ไป Backend ไม่มี Google redirect endpoint ใหม่
- ตรวจ consent screen และ test users หากแอปยังอยู่ในสถานะทดสอบ

### LINE Developers Console

- ใช้ LINE Login channel สำหรับ Web app
- Callback URL: `https://pawnd.vercel.app/login` (local เพิ่ม `http://localhost:3000/login`)
- เปิด permission สำหรับ email ใน LINE Login channel และขอ scope `profile openid email`
- หาก channel ยัง Developing ให้บัญชีทดสอบมีสิทธิ์ใน channel; ก่อนเปิดให้ผู้ใช้ทั่วไปต้องตรวจสถานะ Published
- หากไม่สามารถรับอีเมลได้ ให้แก้สิทธิ์/channel/บัญชี LINE ก่อนสมัคร ไม่รับอีเมลที่พิมพ์เองทดแทน
- Preview domain ไม่ได้รับอนุญาตอัตโนมัติ ต้องเพิ่ม origin/callback ที่แน่นอนหากจะใช้ทดสอบ

## ลำดับ deploy และตรวจรับ

1. Deploy Backend ก่อน แล้วตรวจ config ทั้งสองฝั่งโดยไม่คัดลอก secret ลงแชท
2. Deploy Frontend และ Promote deployment ที่ถูกต้องเป็น Production
3. ทดสอบ Google/LINE บัญชีใหม่และบัญชีเดิม: ไม่มี PAWND OTP, เข้า `/` และ refresh แล้วยังมี session
4. ทดสอบยกเลิก LINE, state หมดอายุ/ไม่ตรง, code ใช้ซ้ำ และ Google script ไม่โหลด
5. ทดสอบ LINE ไม่มีอีเมล, บัญชีอีเมลซ้ำต่าง provider, บัญชีถูกระงับ และ endpoint `/auth/line/complete` เก่า
6. ทดสอบ login ด้วยรหัสผ่านว่ายังใช้ OTP เดิม

การทดสอบอัตโนมัติใช้ provider/database mock จึงไม่ยืนยันค่าของ Console หรือการเข้าสู่ระบบด้วยบัญชีจริงแทนขั้นตอนตรวจรับนี้

เอกสารอ้างอิง: [Google GIS button](https://developers.google.com/identity/gsi/web/guides/display-button), [LINE Login](https://developers.line.biz/en/docs/line-login/integrate-line-login/)
