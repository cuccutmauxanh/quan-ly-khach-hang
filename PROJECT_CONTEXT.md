# PROJECT CONTEXT — AutoVoice Pro (quan-ly-khach-hang)

> File này dùng để mở tab mới và tiếp tục làm việc với đầy đủ context.
> Cập nhật lần cuối: 2026-04-22

---

## Tổng quan dự án

**AutoVoice Pro** — B2B SaaS AI Voice Agent cho phòng khám nha khoa (và các doanh nghiệp khác).

Sản phẩm gồm 2 phần:
1. **Dashboard khách hàng** (repo này) — Next.js app trên Vercel
2. **n8n workflows** — xử lý post-call, webhook từ Retell AI

---

## Stack kỹ thuật

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS |
| Database & Auth | Supabase (PostgreSQL + Google OAuth) |
| Hosting | Vercel (auto-deploy từ GitHub push) |
| AI Voice | Retell AI (v2 API) |
| Workflow | n8n self-hosted tại `https://letanai.tino.page` |
| Appointment | Cal.com |

---

## URLs quan trọng

| Tên | URL |
|-----|-----|
| Dashboard (production) | `https://quan-ly-khach-hang-roan.vercel.app` |
| GitHub repo | `https://github.com/cuccutmauxanh/quan-ly-khach-hang` |
| Supabase project | `https://qluwqmspfnkcfuuqamca.supabase.co` |
| n8n instance | `https://letanai.tino.page` |
| Vercel dashboard | `https://vercel.com` |

---

## Cấu trúc file dự án

```
quan-ly-khach-hang/
├── app/
│   ├── dashboard/page.tsx      # Trang chính: KPI + gọi outbound + lịch sử cuộc gọi
│   ├── contacts/page.tsx       # Danh bạ: thêm/import/gọi/filter
│   ├── appointments/page.tsx   # Lịch hẹn: nhóm theo ngày, cập nhật trạng thái
│   ├── analytics/page.tsx      # Báo cáo: KPI 30 ngày, biểu đồ 7 ngày, phễu CV
│   ├── login/page.tsx          # Google OAuth login
│   ├── auth/callback/route.ts  # Auto-link user → client theo contact_email
│   └── api/outbound/route.ts   # Server-side Retell API call
├── components/
│   └── nav.tsx                 # Thanh điều hướng dùng chung (4 tabs)
├── lib/
│   └── supabase.ts             # Supabase client + types (Client, Call, Contact, Appointment)
└── .env.local                  # Env vars (không commit)
```

---

## Env vars (.env.local)

```env
NEXT_PUBLIC_SUPABASE_URL=https://qluwqmspfnkcfuuqamca.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsdXdxbXNwZm5rY2Z1dXFhbWNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNDY2NTgsImV4cCI6MjA4ODgyMjY1OH0.rlgbGZIZZs7pF0_j33hnHdEHVnmucY9vxX4gUe1vFaQ
RETELL_API_KEY=key_b94b6d45cb14399c3ed7bb356f79
```

(Vercel cũng đã có 3 env vars này)

---

## Supabase Schema (public)

### `clients` — thông tin từng khách hàng SaaS
| Cột quan trọng | Mô tả |
|---------------|-------|
| id (uuid) | PK, dùng làm tenant_id |
| name | Tên phòng khám |
| slug | VD: `nhakhoa-client-01` |
| retell_agent_id | ID agent Retell AI |
| retell_phone_number | Số điện thoại gọi đi |
| contact_email | Email để auto-link user khi đăng nhập |
| calcom_event_type_id | Cal.com event type |
| telegram_chat_id | Chat ID Telegram (không dùng nữa) |

### `client_users` — liên kết user ↔ client (multi-tenant)
- user_id → auth.users.id
- client_id → clients.id

### `calls` — lịch sử cuộc gọi
- tenant_id, direction (inbound/outbound), duration_seconds
- appointment_booked (bool), summary (AI), status
- contact_phone, contact_name, retell_call_id
- appointment_datetime, appointment_notes

### `contacts` — danh bạ
- tenant_id, full_name, phone, email
- call_count, last_called_at, interest_level (high/medium/low)
- notes

### `appointments` — lịch hẹn
- tenant_id, contact_id, call_id
- scheduled_at, status (confirmed/pending/cancelled/completed)
- appointment_notes

---

## Tích hợp Retell AI

- **API Key**: `key_b94b6d45cb14399c3ed7bb356f79`
- **Agent ID chính** (Nha Khoa): `agent_45c60a9d4d4fc363032073cbd0`
- **Số gọi đi**: `+842883876780`
- **Endpoint tạo cuộc gọi**: `POST https://api.retellai.com/v2/create-phone-call`
- **Param quan trọng**: dùng `override_agent_id` (KHÔNG phải `agent_id`)
- **Post-call webhook** (chưa cấu hình): `https://letanai.tino.page/webhook/saas-post-call?client={slug}`

---

## Luồng hoạt động

### Đăng nhập
1. User vào `/login` → bấm "Đăng nhập với Google"
2. Google OAuth → Supabase → `/auth/callback`
3. Callback tự động tìm `clients` có `contact_email` = email user
4. Nếu tìm thấy → tạo `client_users` liên kết
5. Redirect về `/dashboard`

### Gọi outbound
1. User upload Excel hoặc vào `/contacts`
2. Bấm nút "Gọi" → POST `/api/outbound`
3. Server gọi Retell API `create-phone-call` với `override_agent_id`
4. Retell kết nối cuộc gọi AI

### Post-call (chưa hoàn chỉnh — WF1 chưa import)
1. Retell kết thúc cuộc gọi → gọi webhook n8n
2. n8n WF1 xử lý: lưu call vào Supabase, nếu đặt lịch → tạo Cal.com booking
3. Dashboard tự refresh mỗi 30s hiển thị kết quả

---

## n8n Workflows

File JSON tại `e:\nha khoa AI\chiến lược facebook hút khách hàng\DEV_n8n_mcp\saas-workflows\`

| File | Tên | Trạng thái |
|------|-----|-----------|
| WF1-post-call-handler.json | Post-call handler | **Chưa import vào n8n** |
| WF2-fb-lead-outbound.json | Facebook Lead → Outbound | Chưa dùng |

### Để WF1 hoạt động cần làm:
1. Vào `https://letanai.tino.page` → New Workflow → Import from File → chọn `WF1-post-call-handler.json`
2. Activate workflow
3. Trong Retell agent settings → Post-call webhook URL: `https://letanai.tino.page/webhook/saas-post-call?client=nhakhoa-client-01`

---

## Tính năng đã build

| Tính năng | Trang | Trạng thái |
|-----------|-------|-----------|
| Google OAuth + auto-link | /login | ✅ Done |
| Dashboard KPI (hôm nay/gọi đến/gọi đi/đặt lịch) | /dashboard | ✅ Done |
| Upload Excel + gọi hàng loạt | /dashboard | ✅ Done |
| Gọi từng người (per-row) | /dashboard | ✅ Done |
| Auto-refresh 30s | /dashboard | ✅ Done |
| Call detail modal + chấm điểm | /dashboard | ✅ Done |
| Quản lý danh bạ (CRUD + import) | /contacts | ✅ Done |
| Filter danh bạ theo trạng thái | /contacts | ✅ Done |
| Gọi trực tiếp từ danh bạ | /contacts | ✅ Done |
| Lịch hẹn nhóm theo ngày | /appointments | ✅ Done |
| Cập nhật trạng thái lịch hẹn | /appointments | ✅ Done |
| Báo cáo KPI 30 ngày | /analytics | ✅ Done |
| Biểu đồ 7 ngày (CSS) | /analytics | ✅ Done |
| Phễu chuyển đổi | /analytics | ✅ Done |
| Post-call webhook (n8n WF1) | n8n | ⏳ Chưa import |

---

## Tính năng có thể làm tiếp

- **Retry tự động** — tự gọi lại sau X giờ nếu không nghe máy
- **Zalo/SMS follow-up** — gửi tin nhắn sau cuộc gọi
- **Trang cài đặt** — khách tự cấu hình begin_message, lịch làm việc
- **Admin panel** — quản lý nhiều clients (trang `/clients`)
- **Export báo cáo** — xuất PDF/Excel cho khách

---

## Khách hàng hiện có

| Tên | Slug | Retell Agent | Số gọi | Contact Email |
|-----|------|-------------|--------|---------------|
| (Nha Khoa) | nhakhoa-client-01 | agent_45c60a9d4d4fc363032073cbd0 | +842883876780 | (email đăng nhập của khách) |

---

## Quy tắc khi làm việc tiếp

1. **Luôn deploy qua git push** — Vercel tự build từ GitHub `main`
2. **Retell API**: dùng `override_agent_id`, không phải `agent_id`
3. **Multi-tenant**: mọi query Supabase phải filter theo `tenant_id = client.id`
4. **Không hardcode** thông tin nhạy cảm vào code (dùng env vars)
5. **Giao tiếp**: tiếng Việt với người dùng, code/tên biến bằng tiếng Anh