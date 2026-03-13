# HurryUp

แอปพลิเคชันบันทึกรายงานงานประจำวัน

---

## Features

### Daily Flow
- สร้างรายงานสรุปงานรายวันแบบ Step-by-step
- เลือกโครงการที่ทำงานในวันนั้น (รองรับหลายโครงการ)
- แสดง "โครงการที่คุณมีส่วนร่วมล่าสุด" จาก 7 วันที่ผ่านมาเพื่อเลือกได้เร็ว
- Rich Text Editor สำหรับกรอกรายละเอียดงาน
- แนบรูปภาพหน้าจอหรืออัปโหลดไฟล์พร้อมกับรายงาน
- ยืนยันก่อนบันทึก เพราะแก้ไขภายหลังไม่ได้

### Template & Copy
- เทมเพลตรายงานพร้อม Header ข้อมูลผู้ใช้ (ชื่อ, ตำแหน่ง, สถานที่, วันที่)
- คัดลอกทั้งรายงาน หรือคัดลอกแยกรายโครงการ
- รองรับ Rich Text (HTML + Plain Text) เมื่อคัดลอก

### Taiga Integration
- เชื่อมต่อกับ Taiga Project Management
- แสดง Task / User Story ของแต่ละโครงการใน Dropdown เมื่อ Hover
- Prefetch tasks ขณะ Hover เพื่อ UX ที่รวดเร็ว
- คัดลอก Taiga URL ได้โดยตรงจากเทมเพลต

### AI Report Generation
- สร้างรายงานจาก Bullet Points ด้วย AI อัตโนมัติ
- รองรับ Proxy URL สำหรับ AI API

### Morning Template
- จัดการเทมเพลตงานเช้าพร้อม Variable (`{name}`, `{date}`, `{role}`, `{workplace}`)

### Dashboard
- Heatmap Calendar แสดงประวัติการส่งรายงานรายวัน
- สถิติ: จำนวนโครงการ, รายงานทั้งปี, สถานะวันนี้

### Admin Dashboard
- ดูภาพรวมผู้ใช้ทั้งหมดในระบบ
- Treemap chart แสดงโครงการที่มีส่วนร่วมวันนี้ (นับจากโครงการที่ผู้ใช้เลือกจริง)
- Heatmap และ Bar Chart สรุปการใช้งาน
- จัดการผู้ใช้

---

## Tech Stack

| Category | Library |
|---|---|
| Framework | Vue 3 + Vite |
| State | Pinia |
| Routing | Vue Router |
| Styling | Tailwind CSS v4 + DaisyUI |
| Backend | Supabase (Auth + Database) |
| Editor | Vue-Quill |
| Charts | ApexCharts, Chart.js, D3 |
| Physics | Matter.js |

---

## Changelog

### [Unreleased]

#### Added
- ฟีเจอร์ Taiga Task Picker ใน Dropdown เมื่อ Hover แต่ละ Section ของรายงาน
- คัดลอก Taiga URL จาก Dropdown โดยตรง
- Prefetch Taiga tasks ขณะ Hover เพื่อประสิทธิภาพ
- แสดงชื่อโครงการเป็น Label ใน Dropdown
- ปุ่มยืนยันก่อนบันทึกรายงาน (Inline Tooltip-style Confirm)
- "โครงการที่คุณมีส่วนร่วมล่าสุด" สำหรับเลือกโครงการเร็ว (7 วันย้อนหลัง)
- `getAllReports` API สำหรับ Admin
- ปุ่มทดสอบระบบ (localhost only) บนหน้า Login ข้ามขั้นตอน Auth
- Badge preview ใน Onboarding Step 1 แสดง ชื่อ / ตำแหน่ง / รูปโปรไฟล์ ซ้อนบน badge.svg
- Dropdown Suggestions สำหรับ สถานที่ปฏิบัติงาน และ ชื่อโครงการในเทมเพลต โดยดึงข้อมูลจาก profiles ของผู้ใช้อื่นใน Supabase (ผ่าน SECURITY DEFINER RPC)
- Chevron arrow icon บน Dropdown field พร้อม animation หมุน 180° เมื่อเปิด

#### Fixed
- Cross-hovering bug: Dropdown Taiga อัปเดตงานเมื่อเลื่อนเมาส์ข้ามโครงการ
- Treemap Admin Dashboard นับ Contributor จากโครงการที่เลือกจริงในรายงาน แทนการนับจาก config
- Dropdown suggestions ไม่แสดงเนื่องจาก RLS บน Supabase profiles table — แก้โดยใช้ RPC function `get_profile_suggestions` แบบ SECURITY DEFINER

### [Big Update]
- เชื่อมต่อ Supabase (Auth, Database)
- Dashboard หลักพร้อม Heatmap Calendar
- Admin Dashboard พร้อม Charts
- Taiga Integration (Post report to Taiga)

### [Initial Release]
- Daily Flow สร้างรายงานรายวัน
- Morning Template
- Rich Text Editor
- Polaroid Image Attachments

---

## Setup

```bash
npm install
npm run dev
```

### Environment Variables

สร้างไฟล์ `.env.local`:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Build

```bash
npm run build
```