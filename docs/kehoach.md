Kế hoạch Nâng cấp AutoVoice Pro
Ưu tiên ngắn hạn (1–2 tuần)
1. Hoàn thiện hạ tầng còn thiếu
WF1 Post-call handler — import vào n8n, cấu hình Retell webhook → đây là tính năng cốt lõi chưa hoạt động
Trang Settings (/settings) — khách tự cấu hình begin_message, giờ làm việc, số gọi đi
2. Retry tự động (n8n workflow)
Nếu cuộc gọi no-answer → lên lịch gọi lại sau 2h, tối đa 3 lần
Hiển thị trạng thái retry trên dashboard
Phát triển Web (trung hạn — 2–4 tuần)
3. Admin Panel (/admin/clients)
Quản lý nhiều clients từ 1 tài khoản super-admin
CRUD client: thêm phòng khám mới, gán Retell agent, số điện thoại
Xem KPI tổng hợp cross-tenant
4. Nâng cấp Analytics
Thay biểu đồ CSS thủ công → Recharts (line chart, bar chart thực sự)
Thêm: tỷ lệ gọi thành công theo giờ trong ngày, heatmap ngày trong tuần
Export báo cáo PDF/Excel
5. Zalo/SMS Follow-up (n8n + UI)
Sau cuộc gọi → tự động gửi tin nhắn Zalo/SMS xác nhận lịch hẹn
Dashboard hiển thị trạng thái tin nhắn đã gửi chưa
6. Cải thiện UX tổng thể
Dark mode toggle
Mobile responsive (hiện tại chưa tối ưu mobile)
Skeleton loading thay vì màn hình trắng
Toast notifications thay vì alert
Tính năng chiến lược (dài hạn — 1–2 tháng)
7. Onboarding Flow
Trang /onboarding hướng dẫn từng bước kết nối Retell agent mới
Tự động tạo Retell agent qua API khi onboard client mới
8. Billing & Subscription
Tích hợp Stripe — thanh toán theo tháng, theo số cuộc gọi
Trang /billing cho khách xem usage và hóa đơn
9. Real-time Dashboard
Thay auto-refresh 30s → Supabase Realtime (WebSocket)
Hiển thị cuộc gọi đang diễn ra live
10. Facebook Lead Ads → Outbound (WF2)
Kích hoạt WF2-fb-lead-outbound.json
Khi có lead mới từ Facebook → AI tự động gọi ngay trong 2 phút