// =========================================
// FILE: js/main.js
// Khởi chạy ứng dụng và Quản lý Trạng thái
// =========================================

const app = {
    // 1. BỌC THÉP BỘ NHỚ ĐỆM
    favoriteProcs: (() => { try { return JSON.parse(localStorage.getItem('favDvcProcedures_V2')) || []; } catch(e) { return []; } })(),
    wizardSelectedFields: (() => { try { return JSON.parse(localStorage.getItem('favFields_V2')) || []; } catch(e) { return []; } })(), 
    hiddenTnItems: (() => { try { return JSON.parse(localStorage.getItem('hiddenTnItems_V2')) || []; } catch(e) { return []; } })(),
    tnGroupOrder: (() => { try { return JSON.parse(localStorage.getItem('tnGroupOrder_V2')) || []; } catch(e) { return []; } })(),
    tempTnGroups: [],
    tableState: { data: [], filtered: [], currentPage: 1, rowsPerPage: 20 },
    searchTimeout: null, 
    incognitoMode: (() => { try { return localStorage.getItem('incognitoMode_V2') === 'true'; } catch(e) { return false; } })(),
    isStatsCalculated: false, 
    currentReportData: null,

    // CÁC HÀM TIỆN ÍCH CƠ BẢN (Đã hạ cấp code để tương thích mọi trình duyệt cũ)
    buildAttachmentUrl(attachment) {
        let id = (attachment && attachment.id) ? attachment.id : (attachment && attachment.fileId ? attachment.fileId : null);
        let fileName = (attachment && attachment.fileName) ? attachment.fileName : (attachment && attachment.name ? attachment.name : null);
        if (!id || !fileName) return null;
        return `https://dichvucong.gov.vn/api/v1/files/configuring/${id}/${encodeURIComponent(fileName)}`;
    },
    removeAccents(str) {
        if (!str) return '';
        return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    },    
    isPublicTTHC(item) {
        if (!item || typeof item !== 'object') return false;
        let isCongKhai = true;
        let trangThaiKey = Object.keys(item).find(k => {
            let cleanK = k.toLowerCase().replace(/[_-\s]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
            return cleanK.includes('trangthai') || cleanK === 'state' || cleanK === 'trang_thai';
        });
        if (trangThaiKey) {
            let val = (item[trangThaiKey] || '').toString().toLowerCase().replace(/[_-\s]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
            if (!val.includes('congkhai') && !val.includes('chinhthuc') && val !== 'active' && val !== 'updated') isCongKhai = false;
        }
        return isCongKhai;
    },
    escapeHtml(value) {
        let safeValue = (value !== null && value !== undefined) ? value : '';
        return String(safeValue).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    },
    getFileIcon(fileName) {
        let ext = (fileName || '').split('.').pop().toLowerCase();
        if (['doc', 'docx'].includes(ext)) return '<i class="fa-solid fa-file-word" style="color: #2563eb; margin-right: 8px; font-size: 16px;"></i>';
        if (['xls', 'xlsx'].includes(ext)) return '<i class="fa-solid fa-file-excel" style="color: #16a34a; margin-right: 8px; font-size: 16px;"></i>';
        if (ext === 'pdf') return '<i class="fa-solid fa-file-pdf" style="color: #dc2626; margin-right: 8px; font-size: 16px;"></i>';
        if (['ppt', 'pptx'].includes(ext)) return '<i class="fa-solid fa-file-powerpoint" style="color: #ea580c; margin-right: 8px; font-size: 16px;"></i>';
        if (['zip', 'rar'].includes(ext)) return '<i class="fa-solid fa-file-zipper" style="color: #ca8a04; margin-right: 8px; font-size: 16px;"></i>';
        return '<i class="fa-solid fa-file-lines" style="color: #64748b; margin-right: 8px; font-size: 16px;"></i>';
    },
    downloadAttachment(fileId, btnElement) {
        if (!fileId) return;
        let originalText = '';
        if (btnElement) {
            originalText = btnElement.innerHTML;
            btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang mở...';
            btnElement.style.pointerEvents = 'none';
            setTimeout(() => { btnElement.innerHTML = originalText; btnElement.style.pointerEvents = 'auto'; }, 1000);
        }
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'https://dichvucong.gov.vn/api/v1/submitting/preview-attachment';
        form.target = '_blank';
        form.style.display = 'none';
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'fileId';
        input.value = fileId;
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
        setTimeout(() => { form.remove(); }, 1000);
    },

    // 2. KHỞI TẠO HỆ THỐNG
    async init() {
        try {
            if (typeof window.appData === 'undefined' || !window.appData) window.appData = {};
            window.appData.defaultAgency = localStorage.getItem('dvc_v2_default_agency') || "";
            
            if (localStorage.getItem('dvc_v2_agreed_terms') !== 'true') {
                let modal = document.getElementById('mandatoryTermsModal');
                if (modal) modal.style.display = 'flex';
                return; 
            }
            
            if(localStorage.getItem('theme_V2') === 'dark') document.body.classList.add('dark-mode');

            if (typeof CONFIG !== 'undefined') {
                if (CONFIG.APP_LOGO) { let logoImg = document.getElementById('logo-img'); if (logoImg) logoImg.src = CONFIG.APP_LOGO; }
                if (CONFIG.APP_BANNER) { let bannerEl = document.querySelector('.hero-banner'); if (bannerEl) bannerEl.style.backgroundImage = `url('${CONFIG.APP_BANNER}')`; }
                
                // DÁN TRẢ LẠI ĐOẠN CODE FAVICON BỊ THIẾU VÀO ĐÂY:
                if (CONFIG.APP_FAVICON) {
                    let favicon = document.querySelector("link[rel*='icon']") || document.createElement('link');
                    favicon.type = 'image/png';
                    favicon.rel = 'icon';
                    favicon.href = CONFIG.APP_FAVICON;
                    document.head.appendChild(favicon);
                }
                // ===============================================
            }
        } catch(e) { console.log("Lỗi khởi tạo UI:", e); }
        
        try { this.initFooterStats(); } catch(e) {}
        try { this.updateIncognitoUI(); } catch(e) {}
        try { this.updateExtensionInstallUI(); } catch(e) {}
        setTimeout(() => { try { this.updateExtensionInstallUI(); } catch(e) {} }, 800);
        
        // KÍCH HOẠT ĐỒNG HỒ NGAY LẬP TỨC
        this.updateClock(); 
        setInterval(() => this.updateClock(), 1000);
        
        this.updateFavProvinceUI();
        this.setupEventListeners();

        let loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'block';
        let loadingTextEl = document.getElementById('loading-text');
        if (loadingTextEl) loadingTextEl.innerText = "Đang kiểm tra bộ nhớ đệm...";
        
        try {
            if (typeof DataLoader !== 'undefined') await DataLoader.initData(false);
        } catch(e) { console.log("Lỗi DataLoader:", e); }
        
        if (loadingEl) loadingEl.style.display = 'none';

        if (!window.appData.favoriteProvince) {
            this.openSetupWizard(true); 
        } else {
            this.handleRouting(); 
            // Đoạn code URLSearchParams đã bị xóa khỏi đây!
            setTimeout(() => {
                if (typeof DataLoader !== 'undefined') DataLoader.initData(true).catch(e => e);
            }, 2000); 
        }
    },

    // HÀM QUÉT VÀ HIỂN THỊ DANH SÁCH CƠ QUAN (CÓ TOMSELECT TÌM KIẾM)
    populateDefaultAgency() {
        let select = document.getElementById('default-agency-select');
        if (!select) return;
        
        let agencies = new Set();
        // Kiểm tra xem đã có dữ liệu tải về chưa
        if (window.appData.fullDatabase && window.appData.fullDatabase.length > 0) {
            window.appData.fullDatabase.forEach(item => {
                if (item.TenCQTH) {
                    let names = item.TenCQTH.toString().split(/(?:;|,|\n)/);
                    names.forEach(n => {
                        let cleanName = n.trim();
                        if (cleanName) agencies.add(cleanName);
                    });
                }
            });
        }

        let sortedAgencies = Array.from(agencies).sort();
        let currentDefault = window.appData.defaultAgency;
        
        // Hủy bỏ TomSelect cũ (nếu có) để vẽ lại mới hoàn toàn
        if (this.agencySelectInstance) {
            this.agencySelectInstance.destroy();
            this.agencySelectInstance = null;
        }

        // Vẽ thẻ HTML gốc
        let html = '<option value="">-- Không chọn (Luôn hiển thị bảng danh sách) --</option>';
        if (sortedAgencies.length === 0) {
            html = '<option value="">-- Vui lòng chọn Tỉnh/TP và BẤM LƯU CẤU HÌNH để tải dữ liệu trước --</option>';
        } else {
            sortedAgencies.forEach(agency => {
                let selected = (agency === currentDefault) ? 'selected' : '';
                html += `<option value="${agency}" ${selected}>${agency}</option>`;
            });
        }
        select.innerHTML = html;

        // Chỉ kích hoạt TomSelect nếu có danh sách cơ quan
        if (sortedAgencies.length > 0) {
            this.agencySelectInstance = new TomSelect("#default-agency-select", {
                create: false,
                sortField: { field: "text", direction: "asc" },
                placeholder: "Gõ chữ để tìm nhanh cơ quan...",
                dropdownParent: 'body' // Rất quan trọng: Chống bị kẹt Menu dưới khung cuộn
            });
        }
    },

    // Tải danh sách Cơ quan mặc định trực tiếp theo Tỉnh/TP đang chọn trong Wizard.
    // Không thay đổi favoriteProvince và không cần đóng hộp thoại cấu hình.
    async populateWizardDefaultAgency(provinceName) {
        let select = document.getElementById('wizard-default-agency-select');
        if (!select) return;

        let province = (window.appData.danhSachTinh || []).find(p => p.TenTinh && window.isMatch(p.TenTinh, provinceName));
        if (!province || !province.LinkCSV) {
            if (this.wizardAgencySelectInstance) {
                this.wizardAgencySelectInstance.destroy();
                this.wizardAgencySelectInstance = null;
            }
            select.disabled = false;
            select.innerHTML = '<option value="">-- Chọn Tỉnh/TP trước để tải danh sách cơ quan --</option>';
            return;
        }

        if (this.wizardAgencySelectInstance) {
            this.wizardAgencySelectInstance.destroy();
            this.wizardAgencySelectInstance = null;
        }
        select.innerHTML = '<option value="">-- Đang tải danh sách cơ quan... --</option>';
        select.disabled = true;

        try {
            let rows = await DataLoader.fetchCSV(province.LinkCSV);
            let agencies = new Set();

            (rows || []).forEach(row => {
                let normalized = DataLoader.normalizeRowKeys ? DataLoader.normalizeRowKeys(row) : row;
                let rawName = normalized.TenCQTH || '';
                rawName.toString().split(/(?:;|,|\n)/).forEach(name => {
                    let cleanName = name.trim();
                    if (cleanName) agencies.add(cleanName);
                });
            });

            let sortedAgencies = Array.from(agencies).sort((a, b) => a.localeCompare(b, 'vi'));
            let currentDefault = window.appData.defaultAgency || localStorage.getItem('dvc_v2_default_agency') || '';

            let options = '<option value="">-- Không chọn cơ quan mặc định --</option>';
            sortedAgencies.forEach(agency => {
                let selected = agency === currentDefault ? ' selected' : '';
                options += `<option value="${this.escapeHtml(agency)}"${selected}>${this.escapeHtml(agency)}</option>`;
            });

            select.innerHTML = options;
            select.disabled = false;

            if (sortedAgencies.length > 0) {
                this.wizardAgencySelectInstance = new TomSelect("#wizard-default-agency-select", {
                    create: false,
                    sortField: { field: "text", direction: "asc" },
                    placeholder: "Gõ chữ để tìm nhanh cơ quan...",
                    dropdownParent: 'body'
                });
                if (currentDefault && sortedAgencies.includes(currentDefault)) {
                    this.wizardAgencySelectInstance.setValue(currentDefault, true);
                }
            }
        } catch (e) {
            console.error("Không tải được danh sách cơ quan theo tỉnh:", e);
            select.disabled = false;
            select.innerHTML = '<option value="">-- Không tải được danh sách cơ quan --</option>';
        }
    },

    async renderThongKe() {
        UIRenderer.isSearchFlow = false;
        UIRenderer.currentLevel = 'thongke';

        document.getElementById('content-grid').style.display = 'none';
        document.getElementById('tacnghiep-section').style.display = 'none';
        document.getElementById('donate-section').style.display = 'none';
        document.getElementById('huongdan-section').style.display = 'none';
        let favSec = document.getElementById('favorites-section'); if(favSec) favSec.style.display = 'none';
        let searchWrapper = document.querySelector('.search-wrapper'); if (searchWrapper) searchWrapper.style.display = 'none';
        let sub = document.getElementById('breadcrumb-sub'); if (sub) sub.style.display = 'none';
        
        document.getElementById('thongke-section').style.display = 'block';
        this.setActiveTab('thongke');

        // BƯỚC 1: Render Dashboard trực tiếp từ Google Sheets ngay lập tức (KHÔNG CHỜ GITHUB)
        this.renderProvinceStats();

        // BƯỚC 2: Tải JSON Github ngầm để render bảng
        if (!this.isStatsCalculated) {
            document.getElementById('advanced-search-dashboard').style.display = 'block';
            let tbody = document.getElementById('tk-table-body');
            if(tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 45px; color: var(--primary-color); font-weight: 600; font-size: 15px;"><i class="fa-solid fa-spinner fa-spin" style="margin-right: 10px; font-size: 20px;"></i>Đang tải Kho dữ liệu TTHC Quốc gia... Vui lòng đợi!</td></tr>`;

            await DataLoader.loadMasterData();

            this.initTableData();
            this.isStatsCalculated = true;
        }
    },

    // HÀM ĐỊNH TUYẾN URL ẢO (HASH ROUTING)
    handleRouting() {
        let hash = window.location.hash || '#dvc'; 
        
        switch (hash) {
            case '#tac-nghiep':
                this.stopHuongDanVideos();
                UIRenderer.renderTacNghiep();
                break;
            case '#thong-ke': // THÊM CASE NÀY
                this.stopHuongDanVideos();
                this.renderThongKe();
                break;
            case '#huong-dan':
                this.renderHuongDan();
                break;            
            case '#dvc':
            default:
                this.resetSearchAndGoHome();
                break;
        }
    },
    
    async forceSync() {
        this.isStatsCalculated = false; // BỔ SUNG: Xóa trí nhớ Thống kê cũ
        
        document.getElementById('content-grid').style.display = 'none';
        document.getElementById('tacnghiep-section').style.display = 'none';
        document.getElementById('donate-section').style.display = 'none';
        document.getElementById('favorites-section').style.display = 'none';
        this.stopHuongDanVideos(); 
        document.getElementById('loading').style.display = 'block';
        document.getElementById('loading-text').innerText = "Đang làm mới dữ liệu từ CSDL...";
        
        await DataLoader.initData(true); 
        document.getElementById('loading').style.display = 'none';
        
        this.handleRouting();
    },

    // 1. Hàm mở Modal nhập liệu
    reportBrokenLink(tenThuTuc, maDVC, linkLoi) {
        // Lưu tạm data vào bộ nhớ
        this.currentReportData = { tenThuTuc, maDVC, linkLoi };
        
        // Đổ tên thủ tục ra giao diện cho cán bộ nhìn thấy
        let nameEl = document.getElementById('report-proc-name');
        if(nameEl) nameEl.textContent = tenThuTuc;
        
        // Xóa trắng ô nhập cũ (nếu có)
        let descEl = document.getElementById('report-error-desc');
        if(descEl) descEl.value = ''; 
        
        // Gắn sự kiện gửi cho nút bấm đỏ
        let submitBtn = document.getElementById('btn-submit-report');
        if(submitBtn) {
            submitBtn.onclick = () => this.submitBrokenLinkReport();
        }
        
        // Kích hoạt hiển thị Hộp thoại
        document.getElementById('reportErrorModalOverlay').classList.add('active');
        
        // Tự động focus con trỏ chuột vào ô text sau 100ms
        setTimeout(() => { if(descEl) descEl.focus(); }, 100);
    },

    // 2. Hàm đóng Modal (khi bấm Hủy hoặc dấu X)
    closeReportModal() {
        document.getElementById('reportErrorModalOverlay').classList.remove('active');
        this.currentReportData = null; // Xóa bộ nhớ tạm
    },

    // 3. Hàm thực thi việc bắn dữ liệu đi
    submitBrokenLinkReport() {
        if (!this.currentReportData) return;
        
        let moTaLoi = document.getElementById('report-error-desc').value.trim();
        let { tenThuTuc, maDVC, linkLoi } = this.currentReportData;
        
        // Đóng hộp thoại ngay lập tức cho mượt
        this.closeReportModal();
        this.showToast("Cảm ơn anh/chị! Hệ thống đã ghi nhận link lỗi để khắc phục.");
        
        const formUrl = "https://docs.google.com/forms/d/1CmUCnbTMOXrin_3TNMjQ7XiCy1lNBqP4-JbncMEZ19E/formResponse";
        let formData = new FormData();
        formData.append("entry.1131698331", tenThuTuc);
        formData.append("entry.1310491410", maDVC);
        formData.append("entry.1043547828", linkLoi);
        formData.append("entry.484503073", window.appData.favoriteProvince || "Chưa rõ");
        formData.append("entry.1744408816", moTaLoi || "Cán bộ không nhập mô tả"); 
        
        fetch(formUrl, {
            method: "POST",
            mode: "no-cors", 
            body: formData
        }).catch(err => console.log("Lỗi gửi:", err));
    },

    initFooterStats() {
        // 1. Quản lý lượt sử dụng (Dựa trên click của người dùng tích lũy + Cơ sở toàn quốc)
        let personalClicks = parseInt(localStorage.getItem('personalClicks_V2')) || 0;
        const baseClicks = 214800; // Số lượt tác nghiệp cơ sở toàn quốc
        
        const updateClicksUI = () => {
            const el = document.getElementById('stat-total-clicks');
            if (el) el.innerText = (baseClicks + personalClicks).toLocaleString('vi-VN') + " lượt";
        };
        updateClicksUI();

        // Lắng nghe các cú click quan trọng trên toàn trang để tăng số lượt sử dụng
        document.addEventListener('click', (e) => {
            if (e.target.closest('.btn-copy-info') || 
                e.target.closest('.row-content') || 
                e.target.closest('.btn-fav-province') || 
                e.target.closest('.btn-star') ||
                e.target.closest('.tn-card')) {
                personalClicks++;
                localStorage.setItem('personalClicks_V2', personalClicks);
                updateClicksUI();
            }
        });

        // 2. Lượt truy cập hôm nay (Tự động biến thiên tăng dần theo thời gian trong ngày)
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const secondsPassed = Math.floor((now - startOfDay) / 1000);
        // Cứ mỗi giây trôi qua giả lập có thêm khoảng 0.25 lượt truy cập
        const todayVisits = Math.floor(1250 + (secondsPassed * 0.25)); 
        
        const visitsEl = document.getElementById('stat-today-visits');
        if (visitsEl) visitsEl.innerText = todayVisits.toLocaleString('vi-VN') + " lượt";

        // 3. Số người online thời gian thực (Kịch bản Toàn quốc)
        const updateOnlineUsers = () => {
            const currentHour = new Date().getHours();
            let baseOnline = 120; // Đêm khuya vẫn có cú đêm cày cuốc

            if (currentHour >= 8 && currentHour <= 11) {
                baseOnline = 1450; // Giờ cao điểm sáng: Gần 1500 cán bộ
            } else if (currentHour >= 13 && currentHour <= 17) {
                baseOnline = 2120; // Giờ cao điểm chiều: Hơn 2000 cán bộ
            } else if (currentHour >= 18 && currentHour <= 22) {
                baseOnline = 450;  // Tối làm thêm giờ
            }

            // Tăng độ dao động lên +-35 người để số nhảy "kịch liệt" và thực tế hơn
            const fluctuation = Math.floor(Math.random() * 70) - 35;
            const finalOnline = Math.max(50, baseOnline + fluctuation);

            const onlineEl = document.getElementById('stat-online');
            if (onlineEl) onlineEl.innerText = finalOnline.toLocaleString('vi-VN') + " cán bộ";
        };

        updateOnlineUsers();
        setInterval(updateOnlineUsers, 5000); // Cứ 5 giây đổi số online 1 lần
    },

    // Cập nhật trạng thái nút Extension trên thanh công cụ.
    updateExtensionInstallUI() {
        let btn = document.getElementById('btn-extension-store');
        if (!btn) return;

        let installed = document.documentElement.hasAttribute('data-extension-installed');
        let label = btn.querySelector('span');
        let icon = btn.querySelector('i');

        if (installed) {
            btn.style.color = '#15803d';
            btn.style.borderColor = '#22c55e';
            btn.style.background = '#f0fdf4';
            if (label) label.textContent = 'Extension đã cài';
            if (icon) icon.className = 'fa-solid fa-circle-check';
        } else {
            btn.style.color = 'var(--primary-color)';
            btn.style.borderColor = 'var(--primary-color)';
            btn.style.background = 'var(--card-bg)';
            if (label) label.textContent = 'Cài Extension';
            if (icon) icon.className = 'fa-brands fa-chrome';
        }
    },

    // HÀM XỬ LÝ NÚT BẬT/TẮT ẨN DANH NHANH
    toggleIncognito() {
        this.incognitoMode = !this.incognitoMode;
        localStorage.setItem('incognitoMode_V2', this.incognitoMode);
        this.updateIncognitoUI();

        // Đồng bộ luôn trạng thái vào Checkbox trong hộp thoại Cấu hình (nếu mở)
        let incognitoCb = document.getElementById('wizard-incognito-mode');
        if (incognitoCb) incognitoCb.checked = this.incognitoMode;
    },

    // HÀM CẬP NHẬT GIAO DIỆN NÚT ẨN DANH
    updateIncognitoUI() {
        let btn = document.getElementById('btn-quick-incognito');
        if (!btn) return;
        
        if (this.incognitoMode) {
            btn.style.background = '#fef3c7';
            btn.style.borderColor = '#f59e0b';
            btn.style.color = '#92400e';
            btn.innerHTML = `<i class="fa-solid fa-user-secret"></i> <span>Nộp ẩn danh: BẬT</span>`;
        } else {
            btn.style.background = 'var(--bg-color)';
            btn.style.borderColor = 'var(--border-color)';
            btn.style.color = '#64748b';
            btn.innerHTML = `<i class="fa-solid fa-user-secret"></i> <span>Nộp ẩn danh: TẮT</span>`;
        }
    },

    // ==========================================
    // HỆ THỐNG WIZARD CẤU HÌNH
    // ==========================================
    openSetupWizard(isForce = false) {
        let closeBtn = document.getElementById('wizard-close-btn');
        if (isForce) {
            closeBtn.style.display = 'none'; 
        } else {
            closeBtn.style.display = 'flex';
        }

        // ĐÃ SỬA: Dùng app.incognitoMode
        let incognitoCb = document.getElementById('wizard-incognito-mode');
        if (incognitoCb) incognitoCb.checked = app.incognitoMode;

        let deptFilter = document.getElementById('wizard-dept-filter');
        deptFilter.innerHTML = '<option value="">-- Tất cả Bộ/Ngành & Địa phương --</option>';
        let depts = [...new Set(Object.values(window.appData.cauHinhLink))].sort();
        depts.forEach(d => {
            deptFilter.innerHTML += `<option value="${d}">${d}</option>`;
        });

        let searchInput = document.getElementById('wizard-province-search');
        searchInput.value = window.appData.favoriteProvince || '';
        
        if (window.appData.favoriteProvince) {
            document.getElementById('wizard-fields-section').style.opacity = '1';
            document.getElementById('wizard-fields-section').style.pointerEvents = 'auto';
            this.buildWizardFieldsList();
            this.populateWizardDefaultAgency(window.appData.favoriteProvince);
        } else {
            this.populateWizardDefaultAgency('');
        }

        this.renderWizardTags();
        document.getElementById('setupWizardModalOverlay').classList.add('active');
    },

    // HÀM NÀY ĐÃ BỊ XÓA NHẦM, ANH BỔ SUNG LẠI NHÉ:
    closeWizard() {
        document.getElementById('setupWizardModalOverlay').classList.remove('active');
    },

    // XỬ LÝ SỰ KIỆN CLICK COMBOBOX
    toggleProvinceDropdown(event, isFromInput = false) {
        if (event) event.stopPropagation();
        let dropdown = document.getElementById('wizard-province-dropdown');
        
        // Nếu bấm vào ô nhập text và dropdown đang mở thì để yên cho người dùng gõ
        if (isFromInput && dropdown.style.display === 'block') return;

        // Nếu bấm vào nút mũi tên và dropdown đang mở thì đóng lại
        if (!isFromInput && dropdown.style.display === 'block') {
            dropdown.style.display = 'none';
        } else {
            // Mở dropdown và ép hiển thị toàn bộ danh sách
            this.filterWizardProvinces(true);
        }
    },

    // HÀM LỌC TỈNH TRONG COMBOBOX
    filterWizardProvinces(showAll = false) {
        let input = document.getElementById('wizard-province-search').value.toLowerCase().trim();
        let dropdown = document.getElementById('wizard-province-dropdown');
        dropdown.innerHTML = '';

        let matched = window.appData.danhSachTinh;
        
        // Chỉ lọc nếu có nhập chữ và KHÔNG BỊ ép showAll
        if (!showAll && input !== '') {
            matched = matched.filter(p => p.TenTinh && p.TenTinh.toLowerCase().includes(input));
        }

        if (matched.length > 0) {
            dropdown.style.display = 'block';
            matched.forEach(p => {
                let item = document.createElement('div');
                item.className = 'dropdown-item';
                item.innerText = p.TenTinh;
                item.onclick = (e) => {
                    if (e) e.stopPropagation();
                    document.getElementById('wizard-province-search').value = p.TenTinh;
                    dropdown.style.display = 'none';
                    document.getElementById('wizard-fields-section').style.opacity = '1';
                    document.getElementById('wizard-fields-section').style.pointerEvents = 'auto';
                    window.appData.tempSelectedProvince = p.TenTinh;
                    this.buildWizardFieldsList();
                    this.populateWizardDefaultAgency(p.TenTinh);
            };
                dropdown.appendChild(item);
            });
        } else {
            dropdown.style.display = 'none';
        }
    },

    // Hàm khởi tạo bộ lọc tìm kiếm nhanh lĩnh vực (gọi hàm này 1 lần khi trang web tải xong)
    initWizardSearch() {
        const searchInput = document.getElementById('wizard-search-lv-input');
        const btnClear = document.getElementById('wizard-btn-clear-search');
        const listContainer = document.getElementById('wizard-fields-list');

        if (!searchInput || !listContainer) return;

        // Xử lý khi cán bộ gõ phím
        searchInput.addEventListener('input', function(e) {
            const keyword = e.target.value.toLowerCase().trim();
            
            // Ẩn/hiện nút Xóa (Clear)
            if (btnClear) btnClear.style.display = keyword.length > 0 ? 'block' : 'none';

            // Quét qua tất cả các thẻ con (các ô checkbox lĩnh vực) trong danh sách
            const items = listContainer.children;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                // Lấy nội dung text của lĩnh vực đó
                const text = item.textContent.toLowerCase();
                
                // So khớp: Có chữ thì hiện, không có thì ẩn
                if (text.includes(keyword)) {
                    item.style.display = ''; // Trả về hiển thị mặc định của CSS Grid
                } else {
                    item.style.display = 'none'; // Giấu đi
                }
            }
        });

        // Xử lý khi bấm nút Xóa (Clear)
        if (btnClear) {
            btnClear.addEventListener('click', function() {
                searchInput.value = '';
                btnClear.style.display = 'none';
                searchInput.focus(); // Nháy chuột lại vào ô tìm kiếm
                
                // Hiện lại toàn bộ danh sách
                const items = listContainer.children;
                for (let i = 0; i < items.length; i++) {
                    items[i].style.display = '';
                }
            });
        }
    },

    buildWizardFieldsList() {
        let container = document.getElementById('wizard-fields-list');
        container.innerHTML = '';

        let allFields = Object.keys(window.appData.cauHinhLink).sort();
        
        allFields.forEach(lv => {
            let div = document.createElement('div');
            div.style.cssText = "display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 4px 0;";
            let checked = this.wizardSelectedFields.includes(lv) ? 'checked' : '';
            div.innerHTML = `
                <input type="checkbox" id="chk-${lv}" value="${lv}" ${checked} onchange="app.handleWizardFieldCheck(this)">
                <label for="chk-${lv}" style="cursor:pointer; font-weight: 600; color: var(--text-color);">${lv}</label>
            `;
            let mappedDept = window.appData.cauHinhLink[lv] || 'Địa phương';
            div.setAttribute('data-dept', mappedDept);
            container.appendChild(div);
        });
        
        // Reset nút chọn tất cả khi vừa build xong danh sách
        let selectAllCb = document.getElementById('wizard-select-all');
        if (selectAllCb) selectAllCb.checked = false;

        this.filterWizardFields();
    },

    // 1. HÀM LỌC CHÍNH (Kết hợp cả tìm kiếm chữ & chọn Bộ/Ngành)
    searchWizardFields() {
        let keyword = document.getElementById('wizard-search-lv-input').value.toLowerCase().trim();
        let selectedDept = document.getElementById('wizard-dept-filter').value;
        let items = document.querySelectorAll('#wizard-fields-list > div');
        let btnClear = document.getElementById('wizard-btn-clear-search');
        
        // Hiện/ẩn nút Xóa (X) nếu có chữ
        if (btnClear) btnClear.style.display = keyword.length > 0 ? 'block' : 'none';

        items.forEach(item => {
            let text = item.textContent.toLowerCase();
            let itemDept = item.getAttribute('data-dept');
            
            // Điều kiện 1: Khớp Bộ/Ngành (hoặc đang chọn Tất cả)
            let matchDept = (selectedDept === "" || itemDept === selectedDept);
            
            // Điều kiện 2: Khớp Từ khóa tìm kiếm
            let matchKeyword = (keyword === "" || text.includes(keyword));

            // Chỉ hiển thị khi thỏa mãn CẢ 2 ĐIỀU KIỆN
            if (matchDept && matchKeyword) {
                item.style.display = 'flex'; 
            } else {
                item.style.display = 'none';
            }
        });
    },

    // 2. HÀM KHI BẤM NÚT XÓA NHANH (Dấu X)
    clearWizardSearch() {
        let searchInput = document.getElementById('wizard-search-lv-input');
        if (searchInput) {
            searchInput.value = ''; // Xóa trắng ô nhập
            this.searchWizardFields(); // Cập nhật lại danh sách
            searchInput.focus(); // Nháy con trỏ chuột lại vào ô
        }
    },

    // 3. HÀM KHI ĐỔI BỘ/NGÀNH Ở THẺ SELECT
    filterWizardFields() {
        // Tự động xóa từ khóa đang tìm cũ đi để tránh lỗi hiển thị
        let searchInput = document.getElementById('wizard-search-lv-input');
        if (searchInput) searchInput.value = '';
        
        // Gọi hàm lọc chính
        this.searchWizardFields();

        // Tắt nút chọn tất cả
        let selectAllCb = document.getElementById('wizard-select-all');
        if (selectAllCb) selectAllCb.checked = false;
    },

    handleWizardFieldCheck(cb) {
        let val = cb.value;
        if (cb.checked) {
            if (!this.wizardSelectedFields.includes(val)) this.wizardSelectedFields.push(val);
        } else {
            this.wizardSelectedFields = this.wizardSelectedFields.filter(f => f !== val);
            // Tắt nút "Chọn tất cả" nếu người dùng chủ động uncheck 1 ô con
            let selectAllCb = document.getElementById('wizard-select-all');
            if (selectAllCb) selectAllCb.checked = false; 
        }
        this.renderWizardTags();
    },

    toggleAllWizardFields(selectAllCb) {
        let isChecked = selectAllCb.checked;
        let items = document.querySelectorAll('#wizard-fields-list > div');
        
        items.forEach(item => {
            // Chỉ thao tác chọn/bỏ chọn với các mục ĐANG HIỂN THỊ (thỏa mãn bộ lọc)
            if (item.style.display !== 'none') {
                let cb = item.querySelector('input[type="checkbox"]');
                if (cb && cb.checked !== isChecked) {
                    cb.checked = isChecked;
                    let val = cb.value;
                    
                    // Cập nhật mảng lưu trữ ngầm
                    if (isChecked) {
                        if (!this.wizardSelectedFields.includes(val)) this.wizardSelectedFields.push(val);
                    } else {
                        this.wizardSelectedFields = this.wizardSelectedFields.filter(f => f !== val);
                    }
                }
            }
        });
        
        // Vẽ lại hộp Tag lĩnh vực một lần duy nhất sau khi lặp xong
        this.renderWizardTags();
    },

    renderWizardTags() {
        let container = document.getElementById('wizard-selected-tags');
        container.innerHTML = '';

        if (this.wizardSelectedFields.length === 0) {
            container.innerHTML = '<span style="color: #94a3b8; font-size: 13px; font-style: italic;">Chưa chọn lĩnh vực nào...</span>';
            return;
        }

        this.wizardSelectedFields.forEach(lv => {
            let tag = document.createElement('span');
            tag.className = 'field-tag';
            tag.innerHTML = `${lv} <i class="fa-solid fa-circle-xmark" onclick="app.removeWizardTag('${lv}')"></i>`;
            container.appendChild(tag);
        });
    },

    removeWizardTag(lv) {
        this.wizardSelectedFields = this.wizardSelectedFields.filter(f => f !== lv);
        let cb = document.getElementById(`chk-${lv}`);
        if (cb) cb.checked = false;
        this.renderWizardTags();
    },

    openProcedureLink(event, url) {
        if (event) event.stopPropagation();
        if (!url || url === 'null') {
            this.showToast("⚠️ Đường link này chưa được cấu hình!");
            return;
        }

        // Nếu bật chế độ Nộp ẩn danh
        if (this.incognitoMode) {
            let evt = new CustomEvent("YeuCauMoAnDanh", { detail: { url: url } });
            document.dispatchEvent(evt);

            setTimeout(() => {
                // Kiểm tra xem đã cài Extension chưa
                if (!document.documentElement.hasAttribute('data-extension-installed')) {
                    if (confirm("Anh/chị đã BẬT chế độ Nộp Ẩn Danh nhưng chưa cài Extension hỗ trợ.\n\nHệ thống sẽ mở bằng tab thường. Vẫn tiếp tục?")) {
                        window.open(url, '_blank');
                    }
                }
            }, 150);
        } else {
            // Chế độ bình thường
            window.open(url, '_blank');
        }
    },

    // Kích hoạt/Vô hiệu hóa nút đồng ý khi tích checkbox
    toggleAgreeButton() {
        let checkbox = document.getElementById('agreeTermsCheckbox');
        let btn = document.getElementById('btnAgreeTerms');
        if (checkbox.checked) {
            btn.style.background = 'var(--primary-color)';
            btn.style.cursor = 'pointer';
            btn.disabled = false;
        } else {
            btn.style.background = '#94a3b8';
            btn.style.cursor = 'not-allowed';
            btn.disabled = true;
        }
    },

    // Khi người dùng bấm nút đồng ý
    acceptTerms() {
        localStorage.setItem('dvc_v2_agreed_terms', 'true');
        document.getElementById('mandatoryTermsModal').style.display = 'none';
        // Khởi động lại luồng chạy của ứng dụng ngay lập tức
        this.init();
    },

   async saveWizardConfig() {
        let provInput = document.getElementById('wizard-province-search').value.trim();
        let matchedProv = window.appData.danhSachTinh.find(p => window.isMatch(p.TenTinh, provInput));
        
        let incognitoCb = document.getElementById('wizard-incognito-mode');
        if (incognitoCb) {
            app.incognitoMode = incognitoCb.checked;
            localStorage.setItem('incognitoMode_V2', app.incognitoMode);
            app.updateIncognitoUI();
        }

        let wizardAgencySelect = document.getElementById('wizard-default-agency-select');
        let selectedAgency = wizardAgencySelect ? wizardAgencySelect.value : '';

        if (!matchedProv) {
            alert("⚠️ Lỗi: Vui lòng nhập đúng và click chọn một Tỉnh/TP có trong danh sách gợi ý!");
            return;
        }
        
        provInput = matchedProv.TenTinh.trim();
        let oldProv = window.appData.favoriteProvince;
        
        if (provInput !== oldProv && this.agencySelectInstance) {
            this.agencySelectInstance.destroy();
            this.agencySelectInstance = null;
        }

        window.appData.favoriteProvince = provInput;
        window.appData.defaultAgency = selectedAgency || "";
        localStorage.setItem('favProvince', provInput);
        localStorage.setItem('favFields_V2', JSON.stringify(this.wizardSelectedFields));
        if (selectedAgency) {
            localStorage.setItem('dvc_v2_default_agency', selectedAgency);
        } else {
            localStorage.removeItem('dvc_v2_default_agency');
        }

        this.updateFavProvinceUI();
        this.closeWizard();

        if (provInput !== oldProv || !window.appData.fullDatabase || window.appData.fullDatabase.length === 0) {
            
            this.isStatsCalculated = false; // BỔ SUNG: Xóa trí nhớ Thống kê cũ
            
            document.getElementById('loading').style.display = 'block';
            document.getElementById('loading-text').innerText = `Đang tải nhanh dữ liệu tỉnh/TP: ${provInput}...`;
            
            await DataLoader.loadProvinceData();
            
            try {
                localStorage.setItem('dvc_v2_cache', JSON.stringify({
                    fullDatabase: window.appData.fullDatabase,
                    cauHinhLink: window.appData.cauHinhLink,
                    iconLinhVuc: window.appData.iconLinhVuc, 
                    tacNghiepChung: window.appData.tacNghiepChung,
                    tacNghiepRieng: window.appData.tacNghiepRieng,
                    huongDanData: window.appData.huongDanData 
                }));
            } catch (e) {}
            
            document.getElementById('loading').style.display = 'none';
            this.handleRouting();
            
        } else {
            this.handleRouting();        
        }
    },

    // ==========================================
    // HỆ THỐNG CẤU HÌNH CƠ QUAN MẶC ĐỊNH
    // ==========================================
    openAgencyModal() {
        if (!window.appData.favoriteProvince || !window.appData.fullDatabase || window.appData.fullDatabase.length === 0) {
            alert("⚠️ Vui lòng cấu hình Tỉnh/Thành phố ở thanh menu trên cùng trước!");
            return;
        }
        document.getElementById('agencyConfigModalOverlay').classList.add('active');
        this.populateDefaultAgency(); // Gọi hàm vẽ TomSelect ra
    },

    closeAgencyModal() {
        document.getElementById('agencyConfigModalOverlay').classList.remove('active');
        // BỔ SUNG: Ép TomSelect đóng dropdown lại nếu nó đang mở
        if (this.agencySelectInstance) {
            this.agencySelectInstance.blur();
        }
    },

    saveAgencyConfig() {
        let agencySelect = document.getElementById('default-agency-select');
        if (agencySelect) {
            window.appData.defaultAgency = agencySelect.value;
            localStorage.setItem('dvc_v2_default_agency', agencySelect.value);
        }
        this.closeAgencyModal();
        
        // GỌI HÀM CẬP NHẬT GIAO DIỆN NGAY LẬP TỨC
        this.updateFavProvinceUI(); 
        
        this.showToast("✅ Đã cập nhật Cơ quan mặc định!");
    },

    openProvinceModal() {
        this.openSetupWizard(false);
    },

    // ==========================================
    // HỆ THỐNG TÙY CHỈNH TÁC NGHIỆP NỘI BỘ
    // ==========================================
    openTnConfig() {
        document.getElementById('tnConfigModalOverlay').classList.add('active');
        this.buildTnConfigUI();
    },

    closeTnConfig() {
        document.getElementById('tnConfigModalOverlay').classList.remove('active');
    },

    buildTnConfigUI() {
        // Lấy toàn bộ dữ liệu hợp lệ hiện tại
        let currentProv = window.appData.favoriteProvince || '';
        let chungData = (window.appData.tacNghiepChung || []).map(item => ({...item}));
        // BỌC THÉP: Lọc khớp Tỉnh
        let riengData = (window.appData.tacNghiepRieng || []).filter(item => window.isMatch(item['TenTinh'], currentProv)).map(item => ({...item}));
        let allData = [...chungData, ...riengData];

        let grouped = {};
        allData.forEach(item => {
            let nhom = (item['Nhom'] || 'TÁC NGHIỆP KHÁC').trim().toUpperCase();
            if (!grouped[nhom]) grouped[nhom] = [];
            grouped[nhom].push(item);
        });

        // Xử lý thứ tự nhóm (Dựa trên cấu hình đã lưu hoặc tự tạo mới)
        let currentOrder = this.tnGroupOrder.length > 0 ? [...this.tnGroupOrder] : Object.keys(grouped).sort();
        
        // Bổ sung các nhóm mới (nếu Sheet vừa thêm) chưa có trong cấu hình cũ
        Object.keys(grouped).forEach(g => {
            if (!currentOrder.includes(g)) currentOrder.push(g);
        });
        
        // Loại bỏ các nhóm không còn tồn tại trong Sheet
        currentOrder = currentOrder.filter(g => grouped[g]);

        this.tempTnGroups = currentOrder.map(nhom => ({
            name: nhom,
            items: grouped[nhom]
        }));

        this.renderTnConfigList();
    },

    renderTnConfigList() {
        let container = document.getElementById('tn-config-body');
        container.innerHTML = '';

        this.tempTnGroups.forEach((groupObj, groupIndex) => {
            let groupDiv = document.createElement('div');
            groupDiv.className = 'config-group-container'; // Áp dụng Class mới từ CSS

            // Thanh Header của Nhóm (Gồm Tên và 2 nút Lên/Xuống)
            let header = document.createElement('div');
            header.style.cssText = "padding: 10px 15px; background: var(--border-color); display: flex; justify-content: space-between; align-items: center; font-weight: bold; color: var(--text-color); border-bottom: 1px solid var(--border-color);";
            
            let title = document.createElement('span');
            title.innerHTML = `<i class="fa-solid fa-layer-group" style="color: var(--primary-color); margin-right: 5px;"></i> ${groupObj.name}`;
            
            let controls = document.createElement('div');
            controls.style.cssText = "display: flex; gap: 10px;";
            controls.innerHTML = `
                <button onclick="app.moveTnGroup(${groupIndex}, -1)" title="Chuyển lên trên" style="border:none; background:transparent; cursor:pointer; font-size:16px; color: ${groupIndex === 0 ? 'var(--border-color)' : 'var(--text-color)'};" ${groupIndex === 0 ? 'disabled' : ''}><i class="fa-solid fa-circle-up"></i></button>
                <button onclick="app.moveTnGroup(${groupIndex}, 1)" title="Chuyển xuống dưới" style="border:none; background:transparent; cursor:pointer; font-size:16px; color: ${groupIndex === this.tempTnGroups.length - 1 ? 'var(--border-color)' : 'var(--text-color)'};" ${groupIndex === this.tempTnGroups.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-circle-down"></i></button>
            `;
            
            header.appendChild(title);
            header.appendChild(controls);
            groupDiv.appendChild(header);

            // Danh sách các phần tử bên trong (Checkboxes) - hiển thị giãn hoàn toàn
            let list = document.createElement('div');
            list.className = 'config-links-grid'; // Áp dụng Grid tự động co giãn
            
            groupObj.items.forEach(item => {
                let tenHeThong = (item['TenHeThong'] || '').trim();
                let isHidden = this.hiddenTnItems.includes(tenHeThong);
                
                let itemDiv = document.createElement('div');
                itemDiv.className = 'config-link-item';
                
                itemDiv.innerHTML = `
                    <input type="checkbox" id="tn-chk-${tenHeThong}" value="${tenHeThong}" ${!isHidden ? 'checked' : ''} style="cursor:pointer; width: 17px; height: 17px; margin-top: 1px; accent-color: var(--primary-color);">
                    <label for="tn-chk-${tenHeThong}">${tenHeThong}</label>
                `;
                list.appendChild(itemDiv);
            });

            groupDiv.appendChild(list);
            container.appendChild(groupDiv);
        });
    },

    moveTnGroup(index, direction) {
        if (index + direction < 0 || index + direction >= this.tempTnGroups.length) return;
        let temp = this.tempTnGroups[index];
        this.tempTnGroups[index] = this.tempTnGroups[index + direction];
        this.tempTnGroups[index + direction] = temp;
        this.renderTnConfigList();
    },

    saveTnConfig() {
        // Lưu lại trật tự mảng
        this.tnGroupOrder = this.tempTnGroups.map(g => g.name);
        localStorage.setItem('tnGroupOrder_V2', JSON.stringify(this.tnGroupOrder));

        // Lưu lại các Item bị người dùng uncheck (bỏ chọn)
        let hidden = [];
        this.tempTnGroups.forEach(g => {
            g.items.forEach(item => {
                let tenHeThong = (item['TenHeThong'] || '').trim();
                let cb = document.getElementById(`tn-chk-${tenHeThong}`);
                if (cb && !cb.checked) {
                    hidden.push(tenHeThong);
                }
            });
        });
        this.hiddenTnItems = hidden;
        localStorage.setItem('hiddenTnItems_V2', JSON.stringify(this.hiddenTnItems));

        this.closeTnConfig();
        // Render lại giao diện ngay lập tức
        if (UIRenderer.currentLevel === 'tacnghiep') {
            UIRenderer.renderTacNghiep();
        }
    },

    // ==========================================
    // LOGIC GIAO DIỆN CƠ BẢN
    // ==========================================    

    updateClock() {
        const now = new Date();
        const timeEl = document.getElementById('clock-time');
        const dateEl = document.getElementById('clock-date');
        if(timeEl && dateEl) {
            timeEl.textContent = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            dateEl.textContent = now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        }
    },

    toggleTheme() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme_V2', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    },

    setActiveTab(tab) {
        let dvcTab = document.getElementById('nav-dvc');
        let tnTab = document.getElementById('nav-tacnghiep');
        let tkTab = document.getElementById('nav-thongke'); // Thêm biến này
        let hdTab = document.getElementById('nav-huongdan'); // Nắm thóp tab Hướng dẫn
        let nyTab = document.getElementById('nav-niemyet'); // Bổ sung

        if (dvcTab) dvcTab.style.color = 'var(--text-color)';
        if (tnTab) tnTab.style.color = 'var(--text-color)';
        if (tkTab) tkTab.style.color = 'var(--text-color)'; // Đổi màu mặc định
        if (hdTab) hdTab.style.color = 'var(--text-color)';
        if (nyTab) nyTab.style.color = 'var(--text-color)';

        if (tab === 'dvc') dvcTab.style.color = 'var(--primary-color)';
        else if (tab === 'tacnghiep') tnTab.style.color = 'var(--primary-color)';
        else if (tab === 'thongke') tkTab.style.color = 'var(--primary-color)'; // Bôi đậm màu cam
        else if (tab === 'huongdan') hdTab.style.color = 'var(--primary-color)';
        else if (tab === 'niemyet') nyTab.style.color = 'var(--primary-color)';
    },

    showDVCLayout() {
        document.getElementById('tacnghiep-section').style.display = 'none';
        document.getElementById('donate-section').style.display = 'none';
        let tkSec = document.getElementById('thongke-section'); if(tkSec) tkSec.style.display = 'none';
        this.stopHuongDanVideos(); // GỌI CÔNG TẮC TẮT VIDEO TẠI ĐÂY
        document.getElementById('content-grid').style.display = '';
        document.querySelector('.search-wrapper').style.display = 'flex';
        document.getElementById('search-box').placeholder = "Nhập mã hoặc tên thủ tục hành chính để tìm kiếm...";
        this.setActiveTab('dvc');
    },

    renderHuongDan() {
        UIRenderer.isSearchFlow = false;
        UIRenderer.currentLevel = 'huongdan';

        // 1. Dọn dẹp giao diện
        document.getElementById('content-grid').style.display = 'none';
        document.getElementById('tacnghiep-section').style.display = 'none';
        document.getElementById('donate-section').style.display = 'none';
        let tkSec = document.getElementById('thongke-section'); if(tkSec) tkSec.style.display = 'none';
        let favSec = document.getElementById('favorites-section');
        if(favSec) favSec.style.display = 'none';
        
        let searchWrapper = document.querySelector('.search-wrapper');
        if (searchWrapper) searchWrapper.style.display = 'none';

        document.getElementById('huongdan-section').style.display = 'block';
        this.setActiveTab('huongdan');

        let sub = document.getElementById('breadcrumb-sub');
        if (sub) sub.style.display = 'none';

        // 2. Bắt đầu Render danh sách Video
        let container = document.getElementById('huongdan-grid');
        if (!container) return;
        container.innerHTML = ''; 

        let hdData = window.appData.huongDanData || [];
        
        if (hdData.length === 0) {
            container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 20px; color: #64748b;">Hiện chưa có video hướng dẫn nào được cập nhật.</div>`;
            return;
        }

        hdData.forEach((item) => {
            // THUẬT TOÁN 1: Dò tìm tên cột tự động 
            let keyTen = Object.keys(item).find(k => k.toLowerCase().includes('ten') || k.toLowerCase().includes('huongdan')) || 'TenHuongDan';
            let keyLink = Object.keys(item).find(k => k.toLowerCase().includes('link') || k.toLowerCase().includes('video')) || 'LinkVideo';

            let ten = (item[keyTen] || 'Video Hướng dẫn').trim();
            let linkGoc = (item[keyLink] || '').trim();
            
            // THUẬT TOÁN 2: Trích xuất ID Video 
            let embedUrl = "";
            let ytRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
            let match = linkGoc.match(ytRegExp);
            
            if (match && match[2].length === 11) {
                let videoId = match[2]; 
                embedUrl = "https://www.youtube.com/embed/" + videoId;
                
                let timeMatch = linkGoc.match(/[?&]t=([0-9]+)s?/);
                if (timeMatch) {
                    embedUrl += "?start=" + timeMatch[1];
                }
            } else {
                return; 
            }

            // 3. Đổ dữ liệu ra giao diện 
            let card = document.createElement('div');
            
            // ĐÃ BỎ class 'card' ĐỂ TRÁNH LỖI CSS CHẶN CLICK
            // Tự định dạng inline để có giao diện thẻ tiêu chuẩn
            card.style.cssText = 'display: flex; flex-direction: column; padding: 0; overflow: hidden; border: 1px solid var(--border-color); border-radius: 8px; background: var(--card-bg); box-shadow: 0 4px 6px rgba(0,0,0,0.05);';
            
            card.innerHTML = `
                <div style="position: relative; padding-bottom: 56.25%; height: 0; background: #000; z-index: 10;">
                    <iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: auto;" src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                </div>
                <div style="padding: 15px; background: var(--card-bg); position: relative; z-index: 10;">
                    <h4 style="margin: 0; color: var(--primary-color); font-size: 15px; line-height: 1.4;">${ten}</h4>
                </div>
            `;
            container.appendChild(card);
        });
    },

    // HÀM NGẮT VIDEO KHI CHUYỂN TAB
    stopHuongDanVideos() {
    let hdSection = document.getElementById('huongdan-section');
    if (hdSection) {
        hdSection.style.display = 'none'; // Ẩn giao diện
        // Quét và ép tải lại toàn bộ iframe để ngắt tiếng
        let iframes = hdSection.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            let currentSrc = iframe.src;
            iframe.src = currentSrc;
        });
    }
},

    focusSearchBox() {
        const searchBox = document.getElementById('search-box');
        if (searchBox && window.innerWidth > 768) {
            setTimeout(() => searchBox.focus(), 100);
        }
    },

    resetSearchAndGoHome() {
        document.getElementById('search-box').value = '';
        this.stopHuongDanVideos(); 
        
        // BẢN VÁ LỖI: Đồng bộ URL về #dvc để không bị kẹt Tab
        if (window.location.hash !== '#dvc' && window.location.hash !== '') {
            history.replaceState(null, null, '#dvc'); 
        }
        
        UIRenderer.renderLinhVuc();
    },

    // BỔ SUNG HÀM HIỂN THỊ TRANG ỦNG HỘ TÁC GIẢ VÀO ĐÂY:
    showDonate() {
        // 1. Ẩn các khu vực nội dung khác
        document.getElementById('content-grid').style.display = 'none';
        document.getElementById('tacnghiep-section').style.display = 'none';
        document.getElementById('favorites-section').style.display = 'none';
        document.querySelector('.search-wrapper').style.display = 'none';
        let tkSec = document.getElementById('thongke-section'); if(tkSec) tkSec.style.display = 'none'; 
        this.stopHuongDanVideos(); // GỌI CÔNG TẮC TẮT VIDEO TẠI ĐÂY
        
        // 2. Hiển thị khu vực Donate
        let donateSection = document.getElementById('donate-section');
        donateSection.style.display = 'block';
        
        // 3. Nếu khu vực này chưa có nội dung thì tự động vẽ giao diện vào
        if (donateSection.innerHTML.trim() === '') {
            donateSection.innerHTML = `
                <h2 style="color: var(--primary-color); margin-top: 0;"><i class="fa-solid fa-mug-saucer"></i> MỜI CÀ PHÊ TÁC GIẢ</h2>
                <p style="color: var(--text-color); margin-bottom: 20px;">Đây là dự án cộng đồng, không vì mục tiêu lợi nhuận. Mọi người sử dụng thấy tiện thì mời tác giả ly coffee được rồi!</p>
                
                <div style="background: var(--bg-color); padding: 25px; border-radius: 12px; display: inline-block; border: 1px solid var(--border-color); box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    
                    <img src="https://cdn.jsdelivr.net/gh/ChippedTopaz/dieu-phoi@main/qr-code.png" alt="QR Code" style="max-width: 250px; border-radius: 8px;">
                    
                    <div style="margin-top: 15px; text-align: center;">
                        <div style="font-size: 14px; color: #64748b; margin-bottom: 5px;">Ngân hàng <strong>VIETINBANK</strong></div>
                        <div style="font-size: 22px; font-weight: 900; color: var(--donate-color); letter-spacing: 1px;">104871565409</div>
                        <div style="font-size: 15px; font-weight: bold; color: var(--text-color); margin-top: 5px; text-transform: uppercase;">NGUYEN TIEN VIET</div>
                    </div>
                </div>
                
                <div style="margin-top: 30px;">
                    <button onclick="app.resetSearchAndGoHome()" style="background: var(--primary-color); color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: opacity 0.2s; box-shadow: 0 4px 6px rgba(201, 81, 23, 0.2);">
                        <i class="fa-solid fa-arrow-left"></i> Quay lại trang chủ
                    </button>
                </div>
            `;
        }

        // 4. Cập nhật thanh điều hướng (Breadcrumb)
        UIRenderer.currentLevel = 'donate';
        let sub = document.getElementById('breadcrumb-sub');
        if (sub) {
            sub.style.display = 'block';
            sub.innerHTML = `<span onclick="app.resetSearchAndGoHome()" style="cursor: pointer; color: var(--primary-color);">Dịch vụ công</span> > <span>Ủng hộ tác giả</span>`;
        }
        
        // 5. Bỏ sáng các nút ở Menu
        this.setActiveTab('');
    },

    showToast(message) {
        let toast = document.createElement('div');
        toast.className = 'toast-msg';
        toast.innerText = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 1500);
    },

    showLegalModal(type) {
        let title = "";
        let content = "";
        
        if (type === 'privacy') {
            title = '<i class="fa-solid fa-user-lock"></i> Chính sách bảo mật';
            content = `
                <div style="margin-bottom: 10px;"><strong>1. Không thu thập dữ liệu cá nhân:</strong> Hệ thống được thiết kế như một "bản đồ điều hướng" tĩnh. Chúng tôi tuyệt đối không có cơ sở dữ liệu ngầm (Database backend) để ghi nhận, theo dõi hay thu thập bất kỳ thông tin nào liên quan đến hồ sơ thủ tục của công dân, tổ chức hay tài khoản định danh điện tử của cán bộ.</div>
                <div style="margin-bottom: 10px;"><strong>2. Lưu trữ cục bộ an toàn:</strong> Mọi thiết lập cá nhân hóa (Tỉnh/TP, các phân hệ tác nghiệp nội bộ) đều chỉ được lưu trữ dạng text thuần túy (Local Storage) ngay trên ổ cứng máy tính của anh/chị. Không có bất kỳ dữ liệu nào được gửi ra ngoài máy chủ.</div>
                <div><strong>3. Tuân thủ quy định:</strong> Hệ thống tuân thủ nghiêm ngặt các nguyên tắc về An toàn thông tin mạng đối với các phần mềm, công cụ tiện ích nội bộ trong cơ quan hành chính nhà nước.</div>
            `;
        } else if (type === 'terms') {
            title = '<i class="fa-solid fa-file-contract"></i> Điều khoản sử dụng';
            content = `
                <div style="margin-bottom: 10px;">Hệ thống "Điều phối DVC Siêu tốc" là dự án tiện ích công nghệ phi lợi nhuận, được phát triển với sứ mệnh duy nhất là hỗ trợ tối đa cho cán bộ, công chức, viên chức thao tác xử lý nghiệp vụ nhanh chóng và chính xác hơn.</div>
                <div>Việc sử dụng hệ thống là hoàn toàn tự nguyện. Người sử dụng tự chịu trách nhiệm trong việc quản lý và bảo mật tài khoản Cổng DVC, tài khoản Phần mềm một cửa của cá nhân khi sử dụng các lối tắt điều hướng do hệ thống cung cấp.</div>
            `;
        } else if (type === 'disclaimer') {
            title = '<i class="fa-solid fa-scale-balanced"></i> Miễn trừ trách nhiệm';
            content = `
                <div style="margin-bottom: 10px;">Tất cả các đường dẫn (URL) trỏ đến hệ thống tiếp nhận hồ sơ, các cổng dịch vụ công địa phương và phần mềm chuyên ngành nội bộ đều được tổng hợp từ các nguồn công khai hoặc do cấu hình từ quản trị viên.</div>
                <div>Hệ thống đóng vai trò như một bộ lọc và bảng điều khiển trung gian, không sở hữu hay can thiệp vào các nền tảng đích. Do đó, chúng tôi được miễn trừ trách nhiệm về tính khả dụng, lỗi kết nối hoặc sự cố kỹ thuật xuất phát từ máy chủ của Cổng DVC Quốc gia hay phần mềm của các Bộ, ngành, địa phương.</div>
            `;
        }
        
        document.getElementById('legal-modal-title').innerHTML = title;
        document.getElementById('legal-modal-content').innerHTML = content;
        document.getElementById('legalModalOverlay').classList.add('active');
    },

    copyProcInfo(event, tenThuTuc, maDVC, url) {
        event.stopPropagation();
        let message = `📌 Thủ tục: ${tenThuTuc}\n🏷️ Mã DVC: ${maDVC}\n🔗 Link nộp hồ sơ: ${url}`;
        navigator.clipboard.writeText(message).then(() => {
            this.showToast("✅ Đã copy thông tin!");
        }).catch(err => {
            this.showToast("⚠️ Trình duyệt chặn copy, hãy copy thủ công!");
        });
    },

    updateFavProvinceUI() {
        let badge = document.getElementById('fav-province-badge');
        if(badge) {
            if(window.appData.favoriteProvince) {
                badge.style.display = 'inline-block';
                badge.innerHTML = `<i class="fa-solid fa-location-dot"></i> Tỉnh/TP: ${window.appData.favoriteProvince}`;
            } else {
                badge.style.display = 'none';
            }
        }

        // BỔ SUNG: Xử lý hiển thị Tên Cơ quan mặc định
        let agencyBadge = document.getElementById('default-agency-badge');
        if (agencyBadge) {
            if (window.appData.defaultAgency) {
                agencyBadge.style.display = 'inline-block';
                // ĐÃ GỌT BỎ ICON VÀ CHỮ "CQ MẶC ĐỊNH", CHỈ CÒN ĐÚNG TÊN CƠ QUAN
                agencyBadge.innerHTML = window.appData.defaultAgency;
            } else {
                agencyBadge.style.display = 'none';
            }
        }
    },

    // ==========================================
    // QUẢN LÝ THỦ TỤC YÊU THÍCH
    // ==========================================
    toggleFavorite(event, id, tenThuTuc, tenCoQuan, tenTinh, url) {
        event.stopPropagation();
        if (!url || url === 'null') {
            alert('Không thể lưu do thủ tục này đang bị lỗi thiếu link cấu hình!');
            return;
        }
        let btn = event.currentTarget;
        let existingIndex = this.favoriteProcs.findIndex(f => f.id === id);
        
        if (existingIndex > -1) {
            this.favoriteProcs.splice(existingIndex, 1);
            btn.classList.remove('active');
        } else {
            this.favoriteProcs.push({ id, tenThuTuc, tenCoQuan, tenTinh, url });
            btn.classList.add('active');
        }
        localStorage.setItem('favDvcProcedures_V2', JSON.stringify(this.favoriteProcs));
    },

    toggleFavProcedure(event, id, tenThuTuc, maDVC, tenTinh) {
        event.stopPropagation(); 
        let btn = event.currentTarget;
        let existingIndex = this.favoriteProcs.findIndex(f => f.id === id);
        
        if (existingIndex > -1) {
            this.favoriteProcs.splice(existingIndex, 1);
            btn.classList.remove('active');
        } else {
            this.favoriteProcs.push({ 
                id: id, type: 'procedure', tenThuTuc: tenThuTuc, maDVC: maDVC,
                tenTinh: tenTinh || window.appData.favoriteProvince || '' 
            });
            btn.classList.add('active');
        }
        localStorage.setItem('favDvcProcedures_V2', JSON.stringify(this.favoriteProcs));
    },

    removeFavorite(id) {
        this.favoriteProcs = this.favoriteProcs.filter(f => f.id !== id);
        localStorage.setItem('favDvcProcedures_V2', JSON.stringify(this.favoriteProcs));
        this.renderFavorites();
    },

    renderFavorites() {
        let favSection = document.getElementById('favorites-section');
        let favGrid = document.getElementById('favorites-grid');
        
        if (UIRenderer.currentLevel !== 'linhvuc' || this.favoriteProcs.length === 0) {
            if(favSection) favSection.style.display = 'none';
            return;
        }
        
        favGrid.innerHTML = '';
        let displayedCount = 0; 
        
        this.favoriteProcs.forEach(fav => {
            // Lấy mã DVC và truy xuất data để "chữa cháy" cho các thủ tục cũ chưa lưu Tên tỉnh
            let maDvcHienThi = fav.maDVC || fav.id.split('_')[0];
            let procData = window.appData.fullDatabase.find(item => item['MaDVC'] === maDvcHienThi);
            
            let tinhCuaThuTuc = fav.tenTinh || (procData ? procData['TenTinh'] : "") || "";
            let tinhHienTai = window.appData.favoriteProvince || "";
            
            // Lọc hiển thị theo Tỉnh hiện tại
            if (tinhHienTai && tinhCuaThuTuc !== tinhHienTai) return;

            displayedCount++; 
            let row = document.createElement('div');
            row.className = 'list-row';
            
            let linhVuc = procData ? procData['LinhVuc'] : 'KHÁC';
            let iconData = window.appData.iconLinhVuc[linhVuc] || "fa-solid fa-layer-group";
            
            let iconHtml = iconData.includes('.') 
                ? `<img src="${iconData}" style="width: 24px; height: 24px; object-fit: contain;">` 
                : `<i class="${iconData}" style="font-size: 20px; color: var(--primary-color);"></i>`;

            let safeTooltip = fav.tenThuTuc.replace(/[\r\n]+/g, ' ').replace(/"/g, '&quot;');
            let safeTenThuTuc = fav.tenThuTuc.replace(/[\r\n]+/g, ' ').replace(/'/g, "\\'").replace(/"/g, '&quot;');

            if (fav.type === 'procedure' || !fav.url) {
                row.innerHTML = `
                    <div style="display: flex; align-items: center; cursor: pointer; flex: 1;" onclick="UIRenderer.renderTinhByThuTuc({TenDVC: '${safeTenThuTuc}', MaDVC: '${maDvcHienThi}'})">
                        <div style="margin-right: 15px; display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; background: rgba(201, 81, 23, 0.1); border-radius: 8px; flex-shrink: 0;">
                            ${iconHtml}
                        </div>
                        <div class="row-content" style="flex: 1;">
                            <div class="row-title" title="${safeTooltip}" style="color: var(--primary-color); display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;">${fav.tenThuTuc}</div>
                            <div class="row-badge"><i class="fa-solid fa-map-location-dot"></i> ${tinhCuaThuTuc ? tinhCuaThuTuc + " | " : ""}Mã DVC: ${maDvcHienThi}</div>
                        </div>
                    </div>
                    <div class="list-row-actions">
                        <button class="btn-delete-fav" onclick="app.removeFavorite('${fav.id}')" title="Xóa khỏi yêu thích"><i class="fa-solid fa-trash-can"></i></button>
                    </div>`;
            } else {
                row.innerHTML = `
                    <div style="display: flex; align-items: center; cursor: pointer; flex: 1;" onclick="app.openProcedureLink(event, '${fav.url}')">
                        <div style="margin-right: 15px; display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; background: rgba(201, 81, 23, 0.1); border-radius: 8px; flex-shrink: 0;">
                            ${iconHtml}
                        </div>
                        <div class="row-content" style="flex: 1;">
                            <div class="row-title" title="${safeTooltip}" style="color: var(--primary-color); display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;">${fav.tenThuTuc}</div>
                            <div class="row-badge"><i class="fa-regular fa-building"></i> ${fav.tenCoQuan} (${tinhCuaThuTuc}) | Mã DVC: ${maDvcHienThi}</div>
                        </div>
                    </div>
                    <div class="list-row-actions">
                        <button class="btn-copy-info" onclick="app.copyProcInfo(event, '${safeTenThuTuc}', '${maDvcHienThi}', '${fav.url}')" title="Copy thông tin"><i class="fa-regular fa-copy"></i></button>
                        <button class="btn-report-error" onclick="event.stopPropagation(); app.reportBrokenLink('${safeTenThuTuc}', '${maDvcHienThi}', '${fav.url}')" title="Báo cáo link lỗi"><i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i></button>
                        <button class="btn-delete-fav" onclick="app.removeFavorite('${fav.id}')" title="Xóa khỏi yêu thích"><i class="fa-solid fa-trash-can"></i></button>
                    </div>`;
            }
            favGrid.appendChild(row);
        });

        favSection.style.display = displayedCount > 0 ? 'block' : 'none';
    },

    // ==========================================
    // XỬ LÝ TÌM KIẾM & SỰ KIỆN
    // ==========================================
    handleSearch() {
        let rawInput = document.getElementById('search-box').value.trim();
        let input = this.removeAccents(rawInput).toLowerCase();

        if (UIRenderer.currentLevel === 'tacnghiep') {
            document.querySelectorAll('.tn-card').forEach(card => {
                let txt = this.removeAccents(card.querySelector('.tn-text').innerText).toLowerCase();
                card.style.display = txt.includes(input) ? "flex" : "none";
            });
            document.querySelectorAll('.tn-group').forEach(group => {
                let hasVisible = Array.from(group.querySelectorAll('.tn-card')).some(c => c.style.display !== "none");
                group.style.display = hasVisible ? "block" : "none";
            });
            return;
        }

        if (UIRenderer.currentLevel !== 'linhvuc' && UIRenderer.currentLevel !== 'search_results') {
            document.querySelectorAll('.search-item').forEach(item => {
                let txt = this.removeAccents(item.textContent).toLowerCase();
                item.style.display = txt.includes(input) ? "" : "none";
            });
            if (UIRenderer.currentLevel === 'coquan') {
                document.querySelectorAll('.cq-group').forEach(group => {
                    let hasVisible = Array.from(group.querySelectorAll('.search-item')).some(item => item.style.display !== "none");
                    group.style.display = hasVisible ? "block" : "none";
                });
            }
            return;
        }

        if (input === '') { this.resetSearchAndGoHome(); return; }

        UIRenderer.isSearchFlow = true;
        UIRenderer.currentLevel = 'search_results';
        UIRenderer.updateBreadcrumb();
        this.showDVCLayout();

        let favSection = document.getElementById('favorites-section');
        let favRows = document.querySelectorAll('#favorites-grid .list-row');
        let hasFavMatch = false;

        favRows.forEach(row => {
            let txt = this.removeAccents(row.innerText).toLowerCase();
            if (txt.includes(input)) {
                row.style.display = "flex"; hasFavMatch = true;
            } else {
                row.style.display = "none";
            }
        });
        favSection.style.display = hasFavMatch ? "block" : "none";

        let container = document.getElementById('content-grid');
        container.className = 'list-container'; container.innerHTML = '';

        let matchedProcedures = new Map();
        window.appData.fullDatabase.forEach(item => {
            if (window.appData.favoriteProvince && item['TenTinh'] !== window.appData.favoriteProvince) return;
            let ten = this.removeAccents(item['TenDVC'] || '').toLowerCase();
            let ma = this.removeAccents(item['MaDVC'] || '').toLowerCase();
            if (ten.includes(input) || ma.includes(input)) {
                // ĐÃ BỔ SUNG TenTinh vào Map
                if (!matchedProcedures.has(item['MaDVC'])) matchedProcedures.set(item['MaDVC'], { TenDVC: item['TenDVC'], MaDVC: item['MaDVC'], TenTinh: item['TenTinh'] });
            }
        });

        let results = Array.from(matchedProcedures.values()).sort((a, b) => a.TenDVC.localeCompare(b.TenDVC, 'vi'));

        if (results.length === 0 && !hasFavMatch) {
            container.innerHTML = `<div style="text-align:center; padding: 20px; color: #64748b;">Không tìm thấy thủ tục nào.</div>`;
        } else {
            let fragment = document.createDocumentFragment();
            results.forEach(proc => {
                // ĐÃ TRUYỀN THÊM TenTinh
                fragment.appendChild(UIRenderer.createProcedureRow(proc.TenDVC, proc.MaDVC, proc.TenTinh));
            });
            container.appendChild(fragment); 
        }
    },

    renderProvinceStats() {
        // ĐỌC ĐỘC LẬP TỪ GOOGLE SHEETS CỦA TỈNH
        let dbProv = window.appData.fullDatabase || [];
        let dashboard = document.getElementById('province-stats-dashboard');

        if (dbProv.length === 0 || !window.appData.favoriteProvince) {
            if (dashboard) dashboard.style.display = 'none';
            return;
        }
        if (dashboard) dashboard.style.display = 'block';

        // ========================================================
        // NÂNG CẤP BỘ QUÉT THỜI GIAN (QUÉT CẢ TÊN CỘT LẪN GIÁ TRỊ)
        // ========================================================
        let updateTimeStr = "";
        for (let i = 0; i < Math.min(dbProv.length, 3); i++) { 
            let item = dbProv[i] || {};
            
            // 1. Quét tìm trong Tên Cột (Keys) - Khớp với file data của anh
            let timeKey = Object.keys(item).find(k => {
                let normK = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                return normK.includes('cap nhat luc') || normK.includes('cap nhat');
            });
            
            if (timeKey) {
                updateTimeStr = timeKey.trim();
                break;
            }
            
            // 2. Quét dự phòng trong Giá trị (Values)
            let vals = Object.values(item);
            for (let v of vals) {
                if (typeof v === 'string') {
                    let normV = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    if (normV.includes('cap nhat luc') || normV.includes('cap nhat')) {
                        updateTimeStr = v.trim(); break;
                    }
                }
            }
            if (updateTimeStr) break;
        }
        
        let elUpdateTime = document.getElementById('last-update-time');
        if (elUpdateTime) elUpdateTime.innerText = updateTimeStr ? `(${updateTimeStr})` : `(Đang cập nhật...)`;

        let capTinh = 0, capXa = 0, ttAll = 0, mpAll = 0, ttTinh = 0, mpTinh = 0, ttXa = 0, mpXa = 0, total = 0;
        let seenMaDVC = new Set();
        
        // Hàm lột sạch dấu và khoảng trắng để soi tên cột
        let cleanKey = (k) => k.toLowerCase().replace(/[_-\s]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

        dbProv.forEach(item => {
            if (!this.isPublicTTHC(item)) return;

            let maKey = Object.keys(item).find(k => cleanKey(k).includes('madvc') || cleanKey(k).includes('matthc'));
            let ma = maKey ? (item[maKey] || '').toString().trim() : '';
            
            if (!ma || seenMaDVC.has(ma)) return;
            seenMaDVC.add(ma);

            let capKey = Object.keys(item).find(k => cleanKey(k).includes('capthuchien'));
            let capThucHienStr = capKey ? (item[capKey] || '').toString().toLowerCase() : '';

            let hasTinh = capThucHienStr.includes('cấp tỉnh') || capThucHienStr.includes('cap tinh');
            let hasXa = capThucHienStr.includes('cấp xã') || capThucHienStr.includes('cap xa');

            if (hasTinh || hasXa) {
                total++;
                if (hasTinh) capTinh++;
                if (hasXa) capXa++;

                let finalMucDo = '';
                let mucDoKey = Object.keys(item).find(k => cleanKey(k).match(/(mucdo|cungcap|toantrinh|hinhthuc)/));

                if (mucDoKey) {
                    let mdVal = (item[mucDoKey] || '').toString().toLowerCase();
                    if (mdVal.includes('toàn trình') || mdVal.includes('toantrinh') || mdVal === '4') finalMucDo = 'TT';
                    else if (mdVal.includes('một phần') || mdVal.includes('motphan') || mdVal.includes('1 phần') || mdVal === '3') finalMucDo = 'MP';
                }

                if (finalMucDo === 'TT') {
                    ttAll++;
                    if (hasTinh) ttTinh++;
                    if (hasXa) ttXa++;
                } else if (finalMucDo === 'MP') {
                    mpAll++;
                    if (hasTinh) mpTinh++;
                    if (hasXa) mpXa++;
                }
            }
        });

        this.statsCache = { ttAll, mpAll, ttTinh, mpTinh, ttXa, mpXa };

        let elTotal = document.getElementById('stat-total-proc');
        if(elTotal) elTotal.innerText = total.toLocaleString('vi-VN');
        let elTinh = document.getElementById('stat-captinh');
        if(elTinh) elTinh.innerText = capTinh.toLocaleString('vi-VN');
        let elXa = document.getElementById('stat-capxa');
        if(elXa) elXa.innerText = capXa.toLocaleString('vi-VN');

        this.changeStatFilter('all');
    },

    // HÀM MỚI CHỊU TRÁCH NHIỆM ĐỔI SỐ LIỆU KHI CLICK
    changeStatFilter(type) {
        if (!this.statsCache) return;

        let elTT = document.getElementById('stat-toantrinh');
        let elMP = document.getElementById('stat-motphan');
        let labelTitle = document.getElementById('label-toantrinh-motphan');
        
        // Tạo hiệu ứng làm mờ con số đang không được chọn
        let btnTotal = document.getElementById('stat-total-proc');
        let btnTinh = document.getElementById('stat-captinh');
        let btnXa = document.getElementById('stat-capxa');

        [btnTotal, btnTinh, btnXa].forEach(btn => {
            if(btn) {
                btn.style.opacity = '0.3';
                btn.style.transition = 'all 0.3s ease';
            }
        });

        // Đổ dữ liệu và làm sáng số đang chọn
        if (type === 'all') {
            if (btnTotal) btnTotal.style.opacity = '1';
            if (labelTitle) labelTitle.innerText = "Toàn trình / Một phần (Tổng số)";
            if (elTT) elTT.innerText = this.statsCache.ttAll.toLocaleString('vi-VN');
            if (elMP) elMP.innerText = this.statsCache.mpAll.toLocaleString('vi-VN');
        } else if (type === 'tinh') {
            if (btnTinh) btnTinh.style.opacity = '1';
            if (labelTitle) labelTitle.innerText = "Toàn trình / Một phần (Cấp Tỉnh)";
            if (elTT) elTT.innerText = this.statsCache.ttTinh.toLocaleString('vi-VN');
            if (elMP) elMP.innerText = this.statsCache.mpTinh.toLocaleString('vi-VN');
        } else if (type === 'xa') {
            if (btnXa) btnXa.style.opacity = '1';
            if (labelTitle) labelTitle.innerText = "Toàn trình / Một phần (Cấp Xã)";
            if (elTT) elTT.innerText = this.statsCache.ttXa.toLocaleString('vi-VN');
            if (elMP) elMP.innerText = this.statsCache.mpXa.toLocaleString('vi-VN');
        }
    },

    
    exportExcelData(level) {
        // ĐỌC ĐỘC LẬP TỪ GOOGLE SHEETS
        let dbProv = window.appData.fullDatabase || [];
        if (dbProv.length === 0) {
            this.showToast("⚠️ Không có dữ liệu để xuất!");
            return;
        }

        let capName = (level === 'tinh') ? 'Cấp tỉnh' : 'Cấp xã';
        let searchKey = (level === 'tinh') ? 'cấp tỉnh' : 'cấp xã';
        let searchKeyNoAccent = (level === 'tinh') ? 'cap tinh' : 'cap xa';

        let excelData = [];
        let stt = 1;
        let seenMaDVC = new Set();
        let cleanKey = (k) => k.toLowerCase().replace(/[_-\s]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

        dbProv.forEach(item => {
            if (!this.isPublicTTHC(item)) return;

            let ma = item['MaDVC'] ? item['MaDVC'].trim() : '';
            if (!ma || seenMaDVC.has(ma)) return;

            let capKey = Object.keys(item).find(k => k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').includes('capthuchien'));
            let capThucHienStr = capKey ? (item[capKey] || '').toLowerCase() : '';

            if (capThucHienStr.includes(searchKey) || capThucHienStr.includes(searchKeyNoAccent)) {
                seenMaDVC.add(ma);

                let finalMucDo = 'Chưa cập nhật';
                let mucDoKey = Object.keys(item).find(k => k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').match(/(mucdo|cungcap|toantrinh|hinhthuc)/));
                if (mucDoKey) {
                    let mdVal = (item[mucDoKey] || '').toLowerCase();
                    if (mdVal.includes('toàn trình') || mdVal.includes('toantrinh') || mdVal === '4') finalMucDo = 'Toàn trình';
                    else if (mdVal.includes('một phần') || mdVal.includes('motphan') || mdVal.includes('1 phần') || mdVal === '3') finalMucDo = 'Một phần';
                }

                let linhVucKey = Object.keys(item).find(k => k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').includes('linhvuc'));
                let linhVucVal = linhVucKey ? (item[linhVucKey] || '') : '';
                if (linhVucVal === linhVucVal.toUpperCase()) {
                    linhVucVal = linhVucVal.charAt(0).toUpperCase() + linhVucVal.slice(1).toLowerCase();
                }

                let cqcbKey = Object.keys(item).find(k => cleanKey(k).match(/(coquancongbo|cqcb)/));
                let cqcbVal = cqcbKey ? (item[cqcbKey] || '').toString() : '';
                
                // 👉 ĐÃ BỔ SUNG: Bắt thêm trường hợp Tên TTHC (tentthc)
                let tenDVCKey = Object.keys(item).find(k => cleanKey(k).includes('tendvc') || cleanKey(k).includes('tenthutuc') || cleanKey(k).includes('tentthc'));
                let tenDVC = tenDVCKey ? (item[tenDVCKey] || '').toString() : '';

                // BỔ SUNG THÊM ĐOẠN TÌM ĐÍCH DANH CỘT MÃ TTHC Ở ĐÂY:
                let maTTHCKey = Object.keys(item).find(k => cleanKey(k) === 'matthc');
                let maTTHCVal = maTTHCKey ? (item[maTTHCKey] || '').toString().trim() : '';

                excelData.push({
                    "STT": stt++,
                    "Mã TTHC": maTTHCVal, // ĐÃ SỬA: Gán đúng biến Mã TTHC vừa tìm được
                    "Mã DVC": ma,         // Giữ nguyên biến ma (Mã DVC)
                    "Tên Thủ tục hành chính": tenDVC,
                    "Lĩnh vực": linhVucVal,
                    "Cơ quan công bố": cqcbVal,
                    "Cơ quan thực hiện": capName,
                    "Mức độ cung cấp": finalMucDo
                });
            }
        });

        if (excelData.length === 0) {
            this.showToast(`⚠️ Không có thủ tục nào thuộc ${capName}!`);
            return;
        }

        const ws = XLSX.utils.json_to_sheet(excelData);
        ws['!cols'] = [{wch: 5}, {wch: 15}, {wch: 15}, {wch: 60}, {wch: 25}, {wch: 35}, {wch: 20}, {wch: 20}];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "DanhSachDVC");

        let dateStr = new Date().toISOString().slice(0,10).replace(/-/g,"");
        XLSX.writeFile(wb, `Danh_Sach_DVC_${level.toUpperCase()}_${window.appData.favoriteProvince || 'ToanQuoc'}_${dateStr}.xlsx`);
        this.showToast(`✅ Đã xuất file Excel ${capName} thành công!`);
    },

    async initTableData() {
        // --- TẢI FILE "BÀN TAY SẮT" isVertical.json TỪ GITHUB ---
        if (!window.isVerticalConfig) {
            try {
                let res = await fetch('https://raw.githubusercontent.com/ChippedTopaz/am-sieu-toc-data/niemyet/isVertical.json?t=' + Date.now());
                window.isVerticalConfig = await res.json();
            } catch(e) {
                console.log("Không tải được file isVertical.json");
                window.isVerticalConfig = { by_linh_vuc: [], by_co_quan: [], by_ma_tthc: [] };
            }
        }
        let configVertical = window.isVerticalConfig;
        // ---------------------------------------------------------
        let masterData = window.appData.masterDatabase || [];
        let provData = window.appData.fullDatabase || []; // Lấy tạm Sheet để ánh xạ Mức độ (Chỉ phục vụ hiển thị cột Mức độ trên Bảng)

        // Map Mức độ từ Sheet lên Bảng (Chỉ để xem chữ "Toàn trình/Một phần" chứ không dùng để lọc)
        let mucDoMap = new Map();
        provData.forEach(item => {
            if (!item) return;
            let cleanKey = (k) => k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
            let maKey = Object.keys(item).find(k => cleanKey(k).includes('matthc') || cleanKey(k).includes('madvc'));
            let maVal = maKey ? (item[maKey] || '').toString().trim() : '';
            if(!maVal) return;

            let maClean = maVal.replace(/'/g, '');
            let maGoc = maClean;
            let parts = maClean.split('.');
            if (parts.length >= 3) maGoc = parts[0] + '.' + parts[1]; 

            let finalMucDo = 'Chưa cung cấp DVC';
            let mucDoKey = Object.keys(item).find(k => cleanKey(k).includes('mucdo'));
            if (mucDoKey) {
                let mdVal = (item[mucDoKey] || '').toString().toLowerCase();
                if (mdVal.includes('toàn trình') || mdVal.includes('toantrinh') || mdVal === '4') finalMucDo = 'Toàn trình';
                else if (mdVal.includes('một phần') || mdVal.includes('motphan') || mdVal === '3') finalMucDo = 'Một phần';
            }

            if (!mucDoMap.has(maGoc)) mucDoMap.set(maGoc, finalMucDo);
            else if (finalMucDo === 'Toàn trình' && mucDoMap.get(maGoc) !== 'Toàn trình') mucDoMap.set(maGoc, 'Toàn trình'); 
        });

        // ĐỔ NGUYÊN KHỐI 6000+ TTHC TỪ GITHUB LÊN TABLE STATE
        let mappedData = masterData.map(item => {
            try {
                if (!item || typeof item !== 'object') return null;

                let id = item.id || '';
                let maTTHC = (item.ma_tthc || item.code || '').toString().trim();
                let tenTTHC = (item.ten_tthc || item.name || '').toString().trim();
                let linhVuc = (item.linh_vuc || '').toString().trim();
                let loaiTTHC = (item.loai_tthc || item.type || '').toString().trim(); 
                let cqth = (item.co_quan_thuc_hien || item.executingAgencies || '').toString().trim();
                
                let cqcb = (item.co_quan_cong_bo || '').toString().trim(); 
                
                let capThucHienStr = (item.cap_thuc_hien || item.capThucHien || '').toString().toLowerCase();
                let capArr = []; 
                if (capThucHienStr.includes('cấp bộ') || capThucHienStr.includes('ngang bộ') || item.isMinistry === true) capArr.push('Bộ');
                if (capThucHienStr.includes('tỉnh') || capThucHienStr.includes('thành phố trực thuộc') || item.isProvince === true) capArr.push('Tỉnh'); 
                if (capThucHienStr.includes('xã') || capThucHienStr.includes('phường') || item.isWard === true) capArr.push('Xã');
                let cap = capArr.join(', ');
                
                if (linhVuc) linhVuc = linhVuc.charAt(0).toUpperCase() + linhVuc.slice(1);
                
                let mucDo = mucDoMap.get(maTTHC) || 'Chưa cung cấp DVC';

                let isVertical = false;
                if ('nganh_doc' in item) {
                    isVertical = item.nganh_doc === true || String(item.nganh_doc).toLowerCase() === 'true';
                }

                // --- ÉP KIỂU BẰNG CẤU HÌNH JSON (CÓ WHITELIST ƯU TIÊN 1) ---
            let configVertical = window.isVerticalConfig;
            if (configVertical) {
                let maTTHC = (item.ma_tthc || item.code || '').toString().trim();
                
                // Trích xuất Lĩnh vực 
                let lvHienTai = (item.linh_vuc || item.linhVuc || '').toString().toLowerCase();
                if (!lvHienTai && item.categoriesDetails && item.categoriesDetails.length > 0) {
                    lvHienTai = item.categoriesDetails[0].name.toLowerCase();
                }
                // Trích xuất Cơ quan công bố
                let cqcbHienTai = (item.co_quan_cong_bo || item.cqcb || item.departmentPromulgateName || '').toString().toLowerCase();

                // LUẬT 1: KIỂM TRA WHITELIST (MÃ TTHC)
                if (configVertical.whitelist_codes && configVertical.whitelist_codes.includes(maTTHC)) {
                    isVertical = false;
                }
                // LUẬT 2: KIỂM TRA WHITELIST (LĨNH VỰC + CQCB)
                else if (configVertical.whitelist_domains && configVertical.whitelist_domains.some(rule => {
                    let ruleLv = (rule.linh_vuc || '').toLowerCase();
                    let ruleCqcb = (rule.co_quan_cong_bo || '').toLowerCase();
                    return lvHienTai.includes(ruleLv) && cqcbHienTai.includes(ruleCqcb);
                })) {
                    isVertical = false;
                }
                // LUẬT 3 & 4: NẾU KHÔNG CÓ MIỄN TỬ -> KIỂM TRA BLACKLIST
                else {
                    if (configVertical.banned_codes && configVertical.banned_codes.includes(maTTHC)) {
                        isVertical = true;
                    } else if (configVertical.banned_domains && configVertical.banned_domains.some(rule => {
                        let ruleLv = (rule.linh_vuc || '').toLowerCase();
                        let ruleCqcb = (rule.co_quan_cong_bo || '').toLowerCase();
                        return lvHienTai.includes(ruleLv) && cqcbHienTai.includes(ruleCqcb);
                    })) {
                        isVertical = true;
                    }
                }
            }
            // -------------------------------------------------------------
                let coThuPhi = item.co_thu_phi === true || String(item.co_thu_phi).toLowerCase() === 'true';
                let chiTietThuPhi = item.chi_tiet_thu_phi || "Có thu phí";

                return {
                    id: id,
                    maTTHC: maTTHC,
                    tenTTHC: tenTTHC,
                    linhVuc: linhVuc,
                    loaiTTHC: loaiTTHC,
                    cqcb: cqcb, 
                    cqth: cqth, 
                    cap: cap,
                    mucDo: mucDo,
                    isVertical: isVertical,
                    coThuPhi: coThuPhi,
                    chiTietThuPhi: chiTietThuPhi,
                    searchString: app.removeAccents((maTTHC + " " + tenTTHC)).toLowerCase() 
                };
            } catch (e) {
                return null;
            }
        }).filter(x => x !== null);

        this.tableState.data = mappedData;
        
        let dsCqcb = [...new Set(mappedData.map(x => x.cqcb).filter(x => x))].sort((a, b) => a.localeCompare(b, 'vi'));
        let elCqcb = document.getElementById('tk-filter-cqcb'); 
        if (elCqcb) {
            // Hủy TomSelect cũ nếu có trước khi nạp dữ liệu mới
            if (this.tsCqcb) { this.tsCqcb.destroy(); this.tsCqcb = null; }
            
            elCqcb.innerHTML = '<option value="">-- Tất cả --</option>' + dsCqcb.map(cq => {
                let label = cq.length > 70 ? cq.substring(0, 70) + '...' : cq;
                return `<option value="${cq}">${label}</option>`;
            }).join('');
            
            // Kích hoạt Tom Select với giao diện CSS đã khóa
            this.tsCqcb = new TomSelect(elCqcb, { create: false, dropdownParent: 'body', wrapperClass: 'ts-wrapper tk-custom-select' });
        }

        this.updateLinhVucDropdown();
        
        // --- 1. GÁN MẶC ĐỊNH BỘ LỌC CẤP TỈNH ---
        let elCapCqth = document.getElementById('tk-filter-cap-cqth');
        if (elCapCqth) elCapCqth.value = 'Tỉnh';
        
        this.handleCapCqthChange(); // Sinh danh sách Tỉnh & gọi bộ lọc lần 1
        
        // --- 2. GÁN MẶC ĐỊNH CƠ QUAN THỰC HIỆN = TỈNH ĐANG CẤU HÌNH ---
        if (this.tsCqth && window.appData.favoriteProvince) {
            this.tsCqth.setValue(window.appData.favoriteProvince);
            this.filterTableData(); // Gọi bộ lọc lần 2 để áp dụng dữ liệu Tỉnh
        }
        
        this.fetchNationalUpdateTime();
        // --- 3. KÍCH HOẠT MODULE THỐNG KÊ BIẾN ĐỘNG TTHC ---
        if (typeof TTHC_App !== 'undefined') {
            setTimeout(() => { TTHC_App.init(); }, 1000);
        }
        
    },

    // XỬ LÝ KHI NGƯỜI DÙNG ĐỔI CƠ QUAN CÔNG BỐ (Giữ nguyên)
    handleCqcbChange() {
        this.updateLinhVucDropdown();
        this.filterTableData();
    },    

    handleCapCqthChange() {
        let capCqth = document.getElementById('tk-filter-cap-cqth').value;
        let elCqth = document.getElementById('tk-filter-cqth');
        let elCap = document.getElementById('tk-filter-cap');

        // Hủy TomSelect cũ để giải phóng Select gốc
        if (this.tsCqth) { this.tsCqth.destroy(); this.tsCqth = null; }

        if (capCqth === 'Bộ') {
            let validCqth = new Set();
            this.tableState.data.forEach(item => {
                if (item.cap.includes('Bộ') && item.cqth) {
                    let agencies = item.cqth.split(',');
                    agencies.forEach(a => {
                        let cleanA = a.trim();
                        let lowerA = cleanA.toLowerCase();
                        if (cleanA && !lowerA.includes('sở ') && !lowerA.match(/ubnd|ủy ban nhân dân/) && !lowerA.includes('huyện ') && !lowerA.includes('xã ') && !lowerA.includes('phòng ') && !lowerA.includes('thành phố ') && !lowerA.includes('tỉnh ')) {
                            validCqth.add(cleanA);
                        }
                    });
                }
            });
            
            let sortedCqth = [...validCqth].sort((a, b) => a.localeCompare(b, 'vi'));
            elCqth.innerHTML = '<option value="">-- Tất cả Bộ/Ngành --</option>' + sortedCqth.map(c => {
                let label = c.length > 70 ? c.substring(0, 70) + '...' : c;
                return `<option value="${c}">${label}</option>`;
            }).join('');
            
            elCap.value = 'Bộ';
            elCap.disabled = true; 
        } else if (capCqth === 'Tỉnh') {
            let sortedCqth = [];
            if (window.appData && window.appData.danhSachTinh) {
                sortedCqth = window.appData.danhSachTinh.map(p => p.TenTinh).sort((a, b) => a.localeCompare(b, 'vi'));
            } else {
                sortedCqth = [window.appData.favoriteProvince || 'Tỉnh đang cấu hình'];
            }
            elCqth.innerHTML = '<option value="">-- Chọn Tỉnh/Thành phố --</option>' + sortedCqth.map(c => `<option value="${c}">${c}</option>`).join('');
            
            elCap.disabled = false;
            if (elCap.value === 'Bộ') elCap.value = ''; 
        } else {
            elCqth.innerHTML = '<option value="">-- Tất cả --</option>';
            elCap.disabled = false;
        }

        // Tái khởi tạo TomSelect sau khi nạp HTML
        this.tsCqth = new TomSelect(elCqth, { create: false, dropdownParent: 'body', wrapperClass: 'ts-wrapper tk-custom-select' });

        this.filterTableData();
    },

    // THUẬT TOÁN ÉP LĨNH VỰC PHẢI CHẠY THEO CQCB
    updateLinhVucDropdown() {
        let selectedCqcb = document.getElementById('tk-filter-cqcb').value;
        let elLinhVuc = document.getElementById('tk-filter-linhvuc');
        if (!elLinhVuc) return;

        let currentLinhVuc = elLinhVuc.value; 
        let validLinhVuc = new Set();

        this.tableState.data.forEach(item => {
            if (!selectedCqcb || item.cqcb === selectedCqcb) {
                if (item.linhVuc) validLinhVuc.add(item.linhVuc);
            }
        });

        let sortedLinhVuc = [...validLinhVuc].sort((a, b) => a.localeCompare(b, 'vi'));
        let html = '<option value="">-- Tất cả --</option>';
        sortedLinhVuc.forEach(lv => {
            let label = lv.length > 75 ? lv.substring(0, 75) + '...' : lv;
            html += `<option value="${lv}">${label}</option>`;
        });
        
        // Cập nhật TomSelect Lĩnh vực
        if (this.tsLinhVuc) { this.tsLinhVuc.destroy(); this.tsLinhVuc = null; }
        elLinhVuc.innerHTML = html;
        this.tsLinhVuc = new TomSelect(elLinhVuc, { create: false, dropdownParent: 'body', wrapperClass: 'ts-wrapper tk-custom-select' });

        // Bảo lưu giá trị đang chọn bằng hàm setValue của TomSelect
        if (sortedLinhVuc.includes(currentLinhVuc)) {
            this.tsLinhVuc.setValue(currentLinhVuc);
        } else {
            this.tsLinhVuc.setValue("");
        }
    },

    // HÀM RESET LÀM MỚI (Đã vá lỗi để tương thích dropdown động)
    resetTableFilters() {
        document.getElementById('tk-search-input').value = '';
        
        // Reset TomSelect CQCB
        if (this.tsCqcb) this.tsCqcb.setValue("");
        else document.getElementById('tk-filter-cqcb').value = '';
        
        // Reset TomSelect Lĩnh vực (Gọi update để sinh lại HTML, sau đó xóa Value)
        this.updateLinhVucDropdown(); 
        if (this.tsLinhVuc) this.tsLinhVuc.setValue("");
        else document.getElementById('tk-filter-linhvuc').value = '';
        
        // Dọn dẹp Hàng 2 & Mở khóa Cấp (Set về mặc định Cấp Tỉnh)
        let elCapCqth = document.getElementById('tk-filter-cap-cqth');
        if (elCapCqth) elCapCqth.value = 'Tỉnh';

        // Đặt chung với nhóm reset filter (Khoảng dòng 1040)
        let elThuPhi = document.getElementById('tk-filter-thuphi');
        if (elThuPhi) elThuPhi.value = '';
        
        document.getElementById('tk-filter-cap').value = '';
        document.getElementById('tk-filter-cap').disabled = false;
        document.getElementById('tk-filter-mucdo').value = '';
        
        // Gọi hàm này để nó sinh lại danh sách Tỉnh
        this.handleCapCqthChange();
        
        // Set giá trị Cơ quan thực hiện về Tỉnh đang cấu hình
        if (this.tsCqth && window.appData.favoriteProvince) {
            this.tsCqth.setValue(window.appData.favoriteProvince);
            this.filterTableData(); // Lọc lại dữ liệu
        }
    },

   filterTableData() {
        // Đổi this thành app ở hàm removeAccents để đảm bảo chạy xuyên suốt
        let keyword = app.removeAccents(document.getElementById('tk-search-input').value.trim()).toLowerCase();
        let fLinhVuc = document.getElementById('tk-filter-linhvuc').value;
        let fCqcb = document.getElementById('tk-filter-cqcb').value;
        let fThuPhi = document.getElementById('tk-filter-thuphi').value;
        
        let fCapCqth = document.getElementById('tk-filter-cap-cqth').value; 
        let fCqth = document.getElementById('tk-filter-cqth').value;
        let fCap = document.getElementById('tk-filter-cap').value;
        let fMucDo = document.getElementById('tk-filter-mucdo').value;

        let currentProv = window.appData.favoriteProvince || "";
        let currentProvClean = app.removeAccents(currentProv).toLowerCase().replace(/tỉnh |thành phố /g, '').trim();

        if (fCapCqth === 'Tỉnh' && fCqth) {
            let selectedProvClean = app.removeAccents(fCqth).toLowerCase().replace(/tỉnh |thành phố /g, '').trim();
            if (selectedProvClean !== currentProvClean && currentProvClean !== "") {
                if (this.showToast) this.showToast(`⚠️ Để xem được số liệu của ${fCqth}, vui lòng Đổi Tỉnh ở nút "Cấu hình" góc trên cùng!`, 4000);
            }
        }

        let isShowingAll = (fCapCqth === '' && fCqth === '');
        // =========================================================

        this.tableState.filtered = this.tableState.data.filter(item => {
            
            // --- CHỐT CHẶN: ẨN TTHC NỘI BỘ KHI ĐANG LỌC TỈNH/BỘ ---
            let isNoiBo = item.loaiTTHC && item.loaiTTHC.toLowerCase().includes('nội bộ');
            if (isNoiBo && !isShowingAll) return false; // Chỉ chặn khi KHÔNG phải xem Tất cả
            if (keyword && !item.searchString.includes(keyword)) return false;
            if (fLinhVuc && item.linhVuc !== fLinhVuc) return false;
            if (fCqcb && item.cqcb !== fCqcb) return false;
            if (fMucDo && item.mucDo !== fMucDo) return false;
            // Lọc trạng thái thu phí
            if (fThuPhi !== '') {
                let isThuPhiStr = item.coThuPhi ? 'true' : 'false';
                if (isThuPhiStr !== fThuPhi) return false;
            }

            // ==========================================
            // LOGIC 1 & 2: LỌC THEO CƠ QUAN VÀ CẤP THỰC HIỆN
            // ==========================================
            if (fCapCqth === 'Bộ') {
                if (fCqth && !item.cqth.includes(fCqth)) return false; 
            } else if ((fCapCqth === 'Tỉnh' && fCqth) || fCap === 'Toàn tỉnh') {
                
                // Điều kiện tiên quyết: Phải có Cấp Tỉnh hoặc Xã
                if (!item.cap.includes('Tỉnh') && !item.cap.includes('Xã')) return false;
                
                if (fCapCqth === 'Tỉnh' && fCqth) {
                    let selectedProvClean = app.removeAccents(fCqth).toLowerCase().replace(/tỉnh |thành phố /g, '').trim();
                    if (selectedProvClean !== currentProvClean && currentProvClean !== "") return false; 
                }

                // ===================================================
                // THUẬT TOÁN ĐỊNH VỊ VÀ LOẠI TRỪ 62 TỈNH THÀNH KHÁC
                // ===================================================
                let cqcbClean = app.removeAccents(item.cqcb).toLowerCase();
                
                let isCurrentProv = currentProvClean !== "" && cqcbClean.includes(currentProvClean);
                let isOtherProv = !isCurrentProv && (
                    cqcbClean.includes('ubnd') || 
                    cqcbClean.includes('uy ban nhan dan') || 
                    cqcbClean.includes('tinh ') || 
                    cqcbClean.includes('thanh pho ')
                );
                
                if (isOtherProv) return false;

                let isMinistry = !isCurrentProv && !isOtherProv;

                // CHỐT CHẶN CỨNG 2: Áp dụng công thức Thống kê
                let isValidList = (isMinistry && !item.isVertical) || isCurrentProv;
                
                if (!isValidList) return false; 
            }

            if (fCap === 'Bộ' && !item.cap.includes('Bộ')) return false;
            if (fCap === 'Tỉnh' && !item.cap.includes('Tỉnh')) return false;
            if (fCap === 'Xã' && !item.cap.includes('Xã')) return false;

            return true;
        });

        this.tableState.currentPage = 1;
        this.renderTable();
    },    

    renderTable() {
        let tbody = document.getElementById('tk-table-body');
        let data = this.tableState.filtered;
        let page = this.tableState.currentPage;
        let limit = this.tableState.rowsPerPage;
        
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #64748b;">Không tìm thấy thủ tục nào khớp với bộ lọc!</td></tr>`;
            this.updatePaginationUI(0, 0, 0);
            return;
        }

        // Cắt dữ liệu theo trang
        let startIndex = (page - 1) * limit;
        let endIndex = Math.min(startIndex + limit, data.length);
        let pageData = data.slice(startIndex, endIndex);

        let html = '';
        pageData.forEach((item, index) => {
            let badgeMucDo = item.mucDo === 'Toàn trình' ? `<span class="badge badge-tt">Toàn trình</span>` : (item.mucDo === 'Một phần' ? `<span class="badge badge-mp">Một phần</span>` : `<span style="background: #e2e8f0; color: #475569;" class="badge">${item.mucDo}</span>`);
            
            // XỬ LÝ RENDER ĐA CẤP (In ra nhiều thẻ badge nếu thủ tục có nhiều cấp)
            let badgeCap = '';
            if (item.cap) {
                let caps = item.cap.split(', ');
                caps.forEach(c => {
                    if (c === 'Bộ') badgeCap += `<span class="badge badge-bo" style="margin-bottom: 4px; display: inline-block;">Cấp Bộ</span><br>`;
                    else if (c === 'Tỉnh') badgeCap += `<span class="badge badge-tinh" style="margin-bottom: 4px; display: inline-block;">Cấp Tỉnh</span><br>`;
                    else if (c === 'Xã') badgeCap += `<span class="badge badge-xa" style="margin-bottom: 4px; display: inline-block;">Cấp Xã</span><br>`;
                });
            }

            // Nằm dưới đoạn khai báo badgeCap
            let badgeThuPhi = item.coThuPhi ? `<span style="background: #fef2f2; color: #ef4444; border: 1px solid #fca5a5; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; margin-left: 8px; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;" title="Thủ tục này có yêu cầu nộp Phí / Lệ phí"><i class="fa-solid fa-coins"></i> Có thu phí</span>` : '';
            
            html += `
            <tr ondblclick="app.openProcedureDetail('${item.id}')" style="cursor: pointer;" title="Kích đúp để xem chi tiết toàn bộ thủ tục">
                <td style="text-align: center; font-weight: 600; color: #94a3b8;">${startIndex + index + 1}</td>
                <td style="font-family: monospace; font-size: 14px; font-weight: 600; color: var(--primary-color);">${item.maTTHC}</td>
                <td style="white-space: normal; line-height: 1.5; font-weight: 500;">${item.tenTTHC}${badgeThuPhi}</td>
                <td>${item.linhVuc}</td>                
                <td style="white-space: normal; line-height: 1.4;">${item.cqcb}</td>                
                <td style="text-align: center;">${badgeCap}</td>
                <td style="text-align: center;">${badgeMucDo}</td>
            </tr>
        `;
        });
        tbody.innerHTML = html;
        this.updatePaginationUI(startIndex + 1, endIndex, data.length);        
    },

    updatePaginationUI(start, end, total) {
        // 1. CẬP NHẬT TEXT THANH DƯỚI
        let infoBottom = document.getElementById('tk-table-info');
        infoBottom.innerText = `Đang hiển thị ${start} đến ${end} của ${total.toLocaleString('vi-VN')} thủ tục`;
        
        // 2. ĐỒNG BỘ TEXT LÊN THANH TRÊN
        let infoTop = document.getElementById('tk-table-info-top');
        if (infoTop) infoTop.innerHTML = infoBottom.innerHTML;
        
        let paginationEl = document.getElementById('tk-table-pagination');
        let pageTop = document.getElementById('tk-table-pagination-top');
        
        let totalPages = Math.ceil(total / this.tableState.rowsPerPage);
        let curr = this.tableState.currentPage;
        
        // 3. NẾU CÓ <= 1 TRANG -> XÓA NÚT BẤM CẢ 2 THANH VÀ THOÁT
        if (totalPages <= 1) { 
            paginationEl.innerHTML = ''; 
            if (pageTop) pageTop.innerHTML = '';
            return; 
        }

        let html = `<button class="page-btn" ${curr === 1 ? 'disabled' : ''} onclick="app.changeTablePage(${curr - 1})"><i class="fa-solid fa-chevron-left"></i></button>`;
        
        // Thuật toán hiển thị 5 nút trang thông minh (Smart Pagination)
        let maxVisible = 5;
        let startPage = Math.max(1, curr - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage + 1 < maxVisible) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        if (startPage > 1) {
            html += `<button class="page-btn" onclick="app.changeTablePage(1)">1</button>`;
            if (startPage > 2) html += `<span style="padding: 6px; color: #94a3b8;">...</span>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-btn ${i === curr ? 'active' : ''}" onclick="app.changeTablePage(${i})">${i}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span style="padding: 6px; color: #94a3b8;">...</span>`;
            html += `<button class="page-btn" onclick="app.changeTablePage(${totalPages})">${totalPages}</button>`;
        }

        html += `<button class="page-btn" ${curr === totalPages ? 'disabled' : ''} onclick="app.changeTablePage(${curr + 1})"><i class="fa-solid fa-chevron-right"></i></button>`;
        
        // 4. CẬP NHẬT NÚT BẤM THANH DƯỚI
        paginationEl.innerHTML = html;
        
        // 5. ĐỒNG BỘ NÚT BẤM LÊN THANH TRÊN
        if (pageTop) pageTop.innerHTML = paginationEl.innerHTML;
    },

    changeTablePage(page) {
        let totalPages = Math.ceil(this.tableState.filtered.length / this.tableState.rowsPerPage);
        if (page >= 1 && page <= totalPages) {
            this.tableState.currentPage = page;
            this.renderTable();
        }
    },

    // HÀM XUẤT EXCEL THEO ĐÚNG BỘ LỌC HIỆN TẠI
    exportFilteredTableToExcel() {
        let data = this.tableState.filtered;
        
        if (!data || data.length === 0) {
            this.showToast("⚠️ Không có dữ liệu nào khớp với bộ lọc để xuất!");
            return;
        }

        // Định hình lại các cột cho file Excel
        let excelData = data.map((item, index) => {
            let capExport = item.cap ? item.cap.split(', ').map(c => `Cấp ${c}`).join(', ') : '';
            return {
                "STT": index + 1,
                "Mã TTHC": item.maTTHC,
                "Tên Thủ tục hành chính": item.tenTTHC,
                "Lĩnh vực": item.linhVuc,
                "Cơ quan công bố": item.cqcb,      // Cột gốc quan trọng
                "Loại TTHC": item.loaiTTHC,        // Có thể lưu làm tham khảo thêm
                "Cơ quan thực hiện": item.cqth,
                "Cấp thực hiện": capExport,
                "Mức độ cung cấp": item.mucDo,
                "Phí - lệ phí": item.coThuPhi ? item.chiTietThuPhi : "Không quy định"
            };
        });

        const ws = XLSX.utils.json_to_sheet(excelData);
        
        // Chỉnh độ rộng các cột cho đẹp mắt
        const wscols = [
            {wch: 5},   // STT
            {wch: 10},  // Mã
            {wch: 40},  // Tên
            {wch: 25},  // Lĩnh vực
            {wch: 25},  // CQCB
            {wch: 10},  // Loại TTHC
            {wch: 25},  // Cơ quan thực hiện
            {wch: 15},  // Cấp
            {wch: 15},   // Mức độ
            {wch: 20}   // Số tiền phí lệ phí (Mở rộng từ 20 lên 60)
        ];
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "DanhSachTTHC");

        // Tạo tên file tự động theo Tỉnh và Ngày
        let dateStr = new Date().toISOString().slice(0,10).replace(/-/g,"");
        let provinceName = window.appData.favoriteProvince 
                            ? this.removeAccents(window.appData.favoriteProvince).replace(/\s/g, "") 
                            : 'ToanQuoc';
        let fileName = `DS_ThuTuc_${provinceName}_${dateStr}.xlsx`;

        XLSX.writeFile(wb, fileName);
        this.showToast("✅ Đã xuất file Excel thành công!");
    },

    // =======================================================
    // ĐIỀU KHIỂN HỘP THOẠI XUẤT QR
    // =======================================================
    openQRModal() {
        let data = this.tableState.filtered || []; 
        if (!data || data.length === 0) {
            this.showToast("⚠️ Không có thủ tục nào trong danh sách để xuất!");
            return;
        }
        document.getElementById('qrExportModal').classList.add('active');
    },

    closeQRModal() {
        document.getElementById('qrExportModal').classList.remove('active');
    },

    startExportQR(type) {
        this.closeQRModal();
        let data = this.tableState.filtered || []; 
        if (type === 'basic') {
            this.exportExcelWithQR(data);
        } else if (type === 'advanced') {
            // Mở Modal Cấu hình Word thay vì xuất luôn
            this.openWordConfigModal();
        }
    },

    openWordConfigModal() {
        let savedName = localStorage.getItem('nyAgencyName_V2') || '';
        // Gợi ý tên Cơ quan chủ quản theo tỉnh đang cấu hình, nhưng cho phép sửa
        let defaultParent = window.appData.favoriteProvince ? `ỦY BAN NHÂN DÂN TỈNH ${window.appData.favoriteProvince.toUpperCase()}` : '';
        document.getElementById('wordParentAgency').value = defaultParent;
        document.getElementById('wordAgencyName').value = savedName;
        document.getElementById('wordConfigModal').classList.add('active');
    },

    closeWordConfigModal() {
        document.getElementById('wordConfigModal').classList.remove('active');
    },

    selectWordTheme(theme) {
        document.getElementById('wordCoverTheme').value = theme;
        if (theme === 'white') {
            document.getElementById('theme-white').style.borderColor = '#D2232A';
            document.getElementById('theme-white').style.boxShadow = '0 4px 6px rgba(210,35,42,0.1)';
            document.getElementById('theme-red').style.borderColor = '#cbd5e1';
            document.getElementById('theme-red').style.boxShadow = 'none';
        } else {
            document.getElementById('theme-red').style.borderColor = '#fff';
            document.getElementById('theme-red').style.boxShadow = '0 4px 10px rgba(210,35,42,0.3)';
            document.getElementById('theme-white').style.borderColor = '#cbd5e1';
            document.getElementById('theme-white').style.boxShadow = 'none';
        }
    },

    executeWordExport() {
        this.closeWordConfigModal();
        let data = this.tableState.filtered || []; 
        let parentAgency = document.getElementById('wordParentAgency').value.trim(); // Lấy ô số 1
        let agencyName = document.getElementById('wordAgencyName').value.trim();     // Lấy ô số 2
        let theme = document.getElementById('wordCoverTheme').value;
        this.exportDanhBaWord(data, parentAgency, agencyName, theme);
    },

    // =======================================================
    // 2. HÀM CHẠY NỀN: TẠO QR BẤT ĐỒNG BỘ VÀ XUẤT EXCEL
    // =======================================================
    async exportExcelWithQR(data) {
        let overlay = document.getElementById('qrProgressOverlay');
        let bar = document.getElementById('qrProgressBar');
        let text = document.getElementById('qrProgressText');
        
        if (overlay) overlay.style.display = 'flex';

        try {
            // BƯỚC 1: TẢI THƯ VIỆN QRIOUS
            if (typeof QRious === 'undefined') {
                if (text) text.innerText = "Đang kết nối tải công cụ tạo mã QR (Bản ổn định)...";
                await new Promise((resolve, reject) => {
                    let script = document.createElement('script');
                    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js";
                    script.onload = resolve;
                    script.onerror = () => reject(new Error("Mạng bị chặn, không tải được thư viện QRious!"));
                    document.head.appendChild(script);
                });
            }

            // BƯỚC 2: TẢI THƯ VIỆN EXCELJS
            if (typeof ExcelJS === 'undefined') {
                if (text) text.innerText = "Đang kết nối tải công cụ Excel...";
                await new Promise((resolve, reject) => {
                    let script = document.createElement('script');
                    script.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js";
                    script.onload = resolve;
                    script.onerror = () => reject(new Error("Mạng bị chặn, không tải được thư viện ExcelJS!"));
                    document.head.appendChild(script);
                });
            }

            if (text) text.innerText = "Đang khởi tạo danh sách...";
            
            let workbook = new ExcelJS.Workbook();
            workbook.creator = 'Hệ thống Điều phối Siêu tốc';
            let worksheet = workbook.addWorksheet('Ma_QR_Thu_Tuc');

            worksheet.columns = [
                { header: 'STT', key: 'stt', width: 8 },
                { header: 'LĨNH VỰC', key: 'lv', width: 25 },
                { header: 'MÃ TTHC', key: 'ma', width: 20 },
                { header: 'TÊN THỦ TỤC HÀNH CHÍNH', key: 'ten', width: 60 },
                { header: 'CẤP THỰC HIỆN', key: 'cap', width: 20 },
                { header: 'MÃ QR LINK TRA CỨU', key: 'qr', width: 35 }
            ];

            worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
            worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD2232A' } };
            worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            worksheet.getRow(1).height = 40;

            for (let i = 0; i < data.length; i++) {
                let item = data[i];
                let procId = item.id || item.maTTHC; 
                let url = `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${procId}`;
                
                let qr = new QRious({
                    value: url,
                    size: 300,
                    level: 'M'
                });
                let qrBase64 = qr.toDataURL('image/png');

                let row = worksheet.addRow({
                    stt: i + 1,
                    lv: item.linhVuc,
                    ma: item.maTTHC,
                    ten: item.tenTTHC,
                    cap: item.cap
                });
                
                row.height = 140;
                row.alignment = { vertical: 'middle', wrapText: true };
                row.getCell('stt').alignment = { vertical: 'middle', horizontal: 'center' };
                row.getCell('ma').alignment = { vertical: 'middle', horizontal: 'center' };
                row.getCell('cap').alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

                let imageId = workbook.addImage({ base64: qrBase64, extension: 'png' });
                worksheet.addImage(imageId, { 
                    tl: { col: 5.15, row: i + 0.1 }, // Dịch sang phải 0.15 cột và dịch xuống 0.1 hàng
                    ext: { width: 120, height: 120 } 
                });

                if (bar && text) {
                    let percent = Math.round(((i + 1) / data.length) * 100);
                    bar.style.width = percent + '%';
                    bar.innerText = percent + '%';
                    text.innerText = `${i + 1} / ${data.length} thủ tục`;
                }
                
                if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 15));
            }

            if (text) text.innerText = "Đang đóng gói file Excel... Vui lòng đợi!";
            let buffer = await workbook.xlsx.writeBuffer();
            let blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            
            let link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            let dateStr = new Date().toISOString().slice(0,10).replace(/-/g,"");
            let pName = window.appData.favoriteProvince ? this.removeAccents(window.appData.favoriteProvince).replace(/\s/g, "") : 'ToanQuoc';
            link.download = `Danh_Muc_QR_TTHC_${pName}_${dateStr}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error(error);
            alert("Đã xảy ra lỗi: " + error.message);
        } finally {
            if (overlay) overlay.style.display = 'none';
        }
    },

    // =======================================================
    // BỘ CÔNG CỤ TẠO DANH BẠ QR (IN ẤN CHUYÊN NGHIỆP)
    // =======================================================
    
    // Hàm 1: Đổi số sang La Mã
    toRoman(num) {
        const roman = {M:1000, CM:900, D:500, CD:400, C:100, XC:90, L:50, XL:40, X:10, IX:9, V:5, IV:4, I:1};
        let str = '';
        for (let i of Object.keys(roman)) {
            let q = Math.floor(num / roman[i]);
            num -= q * roman[i];
            str += i.repeat(q);
        }
        return str;
    },

    // Hàm 2: Tải ảnh từ URL thành Base64
    async getBase64ImageFromUrl(imageUrl) {
        try {
            let res = await fetch(imageUrl);
            if (!res.ok) return null;
            let blob = await res.blob();
            return new Promise((resolve, reject) => {
                let reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            return null;
        }
    },

    // Hàm 3: Vẽ mã QR có Logo ở giữa bằng Canvas
    async generateQRWithLogo(url, logoBase64) {
        return new Promise((resolve) => {
            let canvas = document.createElement('canvas');
            let qr = new QRious({
                value: url,
                size: 300,
                level: 'H' // Ép xung mức sửa lỗi cao nhất để chèn logo
            });
            
            let ctx = canvas.getContext('2d');
            let qrImg = new Image();
            qrImg.onload = () => {
                canvas.width = qrImg.width;
                canvas.height = qrImg.height;
                ctx.drawImage(qrImg, 0, 0);

                if (logoBase64) {
                    let logo = new Image();
                    logo.onload = () => {
                        let logoSize = canvas.width * 0.22; // Logo chiếm 22% diện tích
                        let x = (canvas.width - logoSize) / 2;
                        let y = (canvas.height - logoSize) / 2;
                        
                        // Vẽ nền trắng lót cho logo
                        ctx.fillStyle = 'white';
                        ctx.fillRect(x - 4, y - 4, logoSize + 8, logoSize + 8);
                        
                        // Vẽ logo
                        ctx.drawImage(logo, x, y, logoSize, logoSize);
                        resolve(canvas.toDataURL('image/png'));
                    };
                    logo.src = logoBase64;
                } else {
                    resolve(canvas.toDataURL('image/png'));
                }
            };
            qrImg.src = qr.toDataURL('image/png');
        });
    },

    // =======================================================
    // BỘ CÔNG CỤ TẠO DANH BẠ BẰNG MICROSOFT WORD (.DOCX)
    // =======================================================
    
    base64ToArrayBuffer(base64) {
        let binary_string = window.atob(base64.split(',')[1]);
        let len = binary_string.length;
        let bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) { bytes[i] = binary_string.charCodeAt(i); }
        return bytes.buffer;
    },

    // ---------------------------------------------------------
    // TẠO 1 ẢNH DUY NHẤT (NỀN + KHUNG) BẰNG CANVAS ĐỘ PHÂN GIẢI CAO
    // ---------------------------------------------------------
    generateCoverImage(bgColorHex, bdColorHex) {
        let canvas = document.createElement('canvas');
        const CANVAS_W = 2480;
        const CANVAS_H = 3508;
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
        let ctx = canvas.getContext('2d');

        // Nền đỏ phủ kín
        ctx.fillStyle = '#' + bgColorHex;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Quy đổi Twips -> Pixels để lấy khung chuẩn Margin
        const PAGE_W_TWIPS = 11906;
        const PAGE_H_TWIPS = 16838;
        const BORDER_X_TWIPS = 1701;
        const BORDER_Y_TWIPS = 1417;
        const BORDER_W_TWIPS = 9071;
        const BORDER_H_TWIPS = 14287;

        const sx = CANVAS_W / PAGE_W_TWIPS;
        const sy = CANVAS_H / PAGE_H_TWIPS;

        const x = BORDER_X_TWIPS * sx;
        const y = BORDER_Y_TWIPS * sy;
        const w = BORDER_W_TWIPS * sx;
        const h = BORDER_H_TWIPS * sy;

        // Vẽ khung viền kép
        ctx.strokeStyle = '#' + bdColorHex;
        ctx.lineWidth = 15;
        ctx.strokeRect(x, y, w, h);

        const gap = 20;
        ctx.lineWidth = 5;
        ctx.strokeRect(x + gap, y + gap, w - gap * 2, h - gap * 2);

        return canvas.toDataURL('image/png');
    },

    async exportDanhBaWord(data, parentAgencyInput, agencyNameInput, theme) {
        let overlay = document.getElementById('qrProgressOverlay');
        let bar = document.getElementById('qrProgressBar');
        let text = document.getElementById('qrProgressText');
        
        if (overlay) overlay.style.display = 'flex';

        try {
            if (typeof docx === 'undefined' || typeof QRious === 'undefined') {
                if (text) text.innerText = "Đang kết nối tài nguyên tạo Word...";
                await Promise.all([
                    new Promise((resolve, reject) => { 
                        let s = document.createElement('script'); 
                        s.src = "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js"; 
                        s.onload = resolve; 
                        s.onerror = () => reject(new Error("Lỗi mạng: Không tải được Word."));
                        document.head.appendChild(s); 
                    }),
                    new Promise((resolve, reject) => { 
                        let s = document.createElement('script'); 
                        s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"; 
                        s.onload = resolve; 
                        s.onerror = () => reject(new Error("Lỗi mạng: Không tải được QRious."));
                        document.head.appendChild(s); 
                    })
                ]);
            }

            if (text) text.innerText = "Đang chuẩn bị dữ liệu & hình ảnh...";
            
            let provName = window.appData.favoriteProvince || 'Phú Thọ';
            let parentAgency = parentAgencyInput || '';
            let agencyName = agencyNameInput || '';
            
            let isRed = (theme === 'red');
            let coverBgColor = isRed ? "D2232A" : "FFFFFF";    
            let coverBdColor = isRed ? "FFFFFF" : "D2232A";    
            let textColor    = isRed ? "FFFFFF" : "D2232A"; 
            let logoLink     = isRed ? 'https://cdn.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@main/Logo-white.png' 
                                     : 'https://cdn.jsdelivr.net/gh/ChippedTopaz/dieu-phoi@main/Logo%20CCHC.png';

            let logoCchcBase64 = await this.getBase64ImageFromUrl(logoLink);
            let logoCchcBuffer = logoCchcBase64 ? this.base64ToArrayBuffer(logoCchcBase64) : null;
            let logoRedBase64 = await this.getBase64ImageFromUrl('https://cdn.jsdelivr.net/gh/ChippedTopaz/dieu-phoi@main/Logo%20CCHC.png');
            
            let coverImageBase64 = this.generateCoverImage(coverBgColor, coverBdColor);
            let coverImageBuffer = this.base64ToArrayBuffer(coverImageBase64);

            let today = new Date();
            let dateStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth()+1).toString().padStart(2, '0')}/${today.getFullYear()}`;

            const marginConfig = { top: 1417, right: 1134, bottom: 1134, left: 1701 }; 

            if (text) text.innerText = "Đang phân loại & Sắp xếp A-Z...";
            let cqMap = new Map();
            data.forEach(item => {
                let cq = item.cqcb || 'Chưa xác định';
                if(!cqMap.has(cq)) cqMap.set(cq, []);
                cqMap.get(cq).push(item);
            });

            let sortedCqKeys = Array.from(cqMap.keys()).sort((a, b) => a.localeCompare(b, 'vi'));

            let tocRows = [];
            tocRows.push(new docx.TableRow({
                tableHeader: true,
                children: [
                    new docx.TableCell({ width: { size: 10, type: docx.WidthType.PERCENTAGE }, children: [new docx.Paragraph({ children: [new docx.TextRun({text:"STT", bold:true, font:"Times New Roman", size:24})], alignment: docx.AlignmentType.CENTER })], shading: { fill: "F1F5F9" }, verticalAlign: docx.VerticalAlign.CENTER }),
                    new docx.TableCell({ width: { size: 75, type: docx.WidthType.PERCENTAGE }, children: [new docx.Paragraph({ children: [new docx.TextRun({text:"TÊN LĨNH VỰC / CƠ QUAN CÔNG BỐ", bold:true, font:"Times New Roman", size:24})], alignment: docx.AlignmentType.CENTER })], shading: { fill: "F1F5F9" }, verticalAlign: docx.VerticalAlign.CENTER }),
                    new docx.TableCell({ width: { size: 15, type: docx.WidthType.PERCENTAGE }, children: [new docx.Paragraph({ children: [new docx.TextRun({text:"SỐ TRANG", bold:true, font:"Times New Roman", size:24})], alignment: docx.AlignmentType.CENTER })], shading: { fill: "F1F5F9" }, verticalAlign: docx.VerticalAlign.CENTER })
                ]
            }));

            let currentItemCount = 0;
            let dataSections = [];
            let cqIndex = 0;
            let globalDomainIndex = 1; 
            let isFirstDataSection = true;

            for (let cqName of sortedCqKeys) {
                let items = cqMap.get(cqName);
                cqIndex++;
                let agencyBookmarkId = `BM_AGENCY_${cqIndex}`;

                let countTTHC = items.length;
                let countStr = countTTHC < 10 ? '0' + countTTHC : countTTHC;
                let agencyLabel = `${cqName.toUpperCase()} (${countStr} TTHC)`;

                // MỤC LỤC: Cơ quan công bố
                tocRows.push(new docx.TableRow({
                    children: [
                        new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({text: this.toRoman(cqIndex), bold:true, font:"Times New Roman", size:24})], alignment: docx.AlignmentType.CENTER })], shading: { fill: "FFFBEB" }, verticalAlign: docx.VerticalAlign.CENTER }),
                        new docx.TableCell({ 
                            children: [
                                new docx.Paragraph({ 
                                    children: [
                                        new docx.InternalHyperlink({
                                            anchor: agencyBookmarkId, // Link neo đến Cơ quan
                                            children: [
                                                new docx.TextRun({text: agencyLabel, bold:true, font:"Times New Roman", size:24, color:"D97706"})
                                            ]
                                        })
                                    ], 
                                    alignment: docx.AlignmentType.LEFT 
                                })
                            ], 
                            shading: { fill: "FFFBEB" }, 
                            verticalAlign: docx.VerticalAlign.CENTER 
                        }),
                        // TRẢ VỀ NGUYÊN BẢN (Đã bỏ \h) ĐỂ F9 HOẠT ĐỘNG CHUẨN XÁC
                        new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.SimpleField(`PAGEREF ${agencyBookmarkId}`)], alignment: docx.AlignmentType.CENTER })], shading: { fill: "FFFBEB" }, verticalAlign: docx.VerticalAlign.CENTER })
                    ]
                }));

                let tableRows = [];
                tableRows.push(new docx.TableRow({
                    tableHeader: true, 
                    children: [
                        // Cột STT đã được trả về trạng thái nguyên bản, không dùng Bookmark để tránh lặp trang
                        new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({text:"STT", bold:true, font:"Times New Roman", size:26})], alignment: docx.AlignmentType.CENTER })], shading: { fill: "F1F5F9" }, verticalAlign: docx.VerticalAlign.CENTER }),
                        new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({text:"Mã TTHC", bold:true, font:"Times New Roman", size:26})], alignment: docx.AlignmentType.CENTER })], shading: { fill: "F1F5F9" }, verticalAlign: docx.VerticalAlign.CENTER }),
                        new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({text:"Tên Thủ tục hành chính", bold:true, font:"Times New Roman", size:26})], alignment: docx.AlignmentType.CENTER })], shading: { fill: "F1F5F9" }, verticalAlign: docx.VerticalAlign.CENTER }),
                        new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({text:"Lĩnh vực", bold:true, font:"Times New Roman", size:26})], alignment: docx.AlignmentType.CENTER })], shading: { fill: "F1F5F9" }, verticalAlign: docx.VerticalAlign.CENTER }),
                        new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({text:"Mã QR", bold:true, font:"Times New Roman", size:26})], alignment: docx.AlignmentType.CENTER })], shading: { fill: "F1F5F9" }, verticalAlign: docx.VerticalAlign.CENTER })
                    ]
                }));

                let lvMap = new Map();
                items.forEach(it => { let lv = it.linhVuc || 'Khác'; if(!lvMap.has(lv)) lvMap.set(lv, []); lvMap.get(lv).push(it); });

                let sortedLvKeys = Array.from(lvMap.keys()).sort((a, b) => a.localeCompare(b, 'vi'));
                let isFirstLvOfAgency = true; // Biến kiểm tra lĩnh vực đầu tiên của cơ quan

                for (let lvName of sortedLvKeys) {
                    let lvItems = lvMap.get(lvName);
                    let domainBookmarkId = `BM_DOMAIN_${globalDomainIndex}`;

                    // MỤC LỤC: Dòng Lĩnh vực
                    tocRows.push(new docx.TableRow({
                        children: [
                            new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({text: globalDomainIndex.toString(), font:"Times New Roman", size:24})], alignment: docx.AlignmentType.CENTER })], verticalAlign: docx.VerticalAlign.CENTER }),
                            new docx.TableCell({ 
                                children: [
                                    new docx.Paragraph({ 
                                        children: [
                                            new docx.InternalHyperlink({
                                                anchor: domainBookmarkId, // Link neo đến Lĩnh vực
                                                children: [
                                                    new docx.TextRun({text: lvName, font:"Times New Roman", size:24})
                                                ]
                                            })
                                        ], 
                                        alignment: docx.AlignmentType.LEFT 
                                    })
                                ], 
                                verticalAlign: docx.VerticalAlign.CENTER 
                            }),
                            // TRẢ VỀ NGUYÊN BẢN (Đã bỏ \h) ĐỂ F9 HOẠT ĐỘNG CHUẨN XÁC
                            new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.SimpleField(`PAGEREF ${domainBookmarkId}`)], alignment: docx.AlignmentType.CENTER })], verticalAlign: docx.VerticalAlign.CENTER })
                        ]
                    }));

                    // THUẬT TOÁN MỚI: Cấy Bookmark của Cơ quan vào Lĩnh vực đầu tiên để không sinh dòng trắng
                    let bookmarkChildren = [];
                    if (isFirstLvOfAgency) {
                        bookmarkChildren.push(new docx.Bookmark({ id: agencyBookmarkId, children: [new docx.TextRun({ text: "" })] }));
                        isFirstLvOfAgency = false;
                    }
                    bookmarkChildren.push(new docx.Bookmark({
                        id: domainBookmarkId,
                        children: [new docx.TextRun({ text: `${globalDomainIndex}. LĨNH VỰC ${lvName.toUpperCase()}`, bold: true, font: "Times New Roman", size: 24 })]
                    }));

                    tableRows.push(new docx.TableRow({
                        children: [
                            new docx.TableCell({
                                columnSpan: 5,
                                shading: { fill: "F8FAFC" },
                                children: [
                                    new docx.Paragraph({
                                        children: bookmarkChildren,
                                        spacing: { before: 100, after: 100 }
                                    })
                                ]
                            })
                        ]
                    }));
                    globalDomainIndex++;

                    for (let it of lvItems) {
                        let procId = it.id || it.maTTHC; 
                        let url = `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${procId}`;
                        
                        let qrBase64 = await this.generateQRWithLogo(url, logoRedBase64); 
                        let qrBuffer = this.base64ToArrayBuffer(qrBase64);

                        tableRows.push(new docx.TableRow({
                            cantSplit: true, 
                            children: [
                                // Cột 1: STT
                                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({text: (currentItemCount + 1).toString(), font:"Times New Roman", size:26})], alignment: docx.AlignmentType.CENTER })], verticalAlign: docx.VerticalAlign.CENTER }),
                                
                                // Cột 2: MÃ TTHC (LINK MÀU XANH, KHÔNG GẠCH CHÂN)
                                new docx.TableCell({ 
                                    children: [
                                        new docx.Paragraph({ 
                                            children: [
                                                new docx.ExternalHyperlink({
                                                    children: [
                                                        new docx.TextRun({
                                                            text: it.maTTHC, 
                                                            font: "Times New Roman", 
                                                            size: 26, 
                                                            bold: true,
                                                            color: "0563C1" // Giữ màu xanh dương, đã bỏ gạch chân
                                                        })
                                                    ],
                                                    link: url
                                                })
                                            ], 
                                            alignment: docx.AlignmentType.CENTER 
                                        })
                                    ], 
                                    verticalAlign: docx.VerticalAlign.CENTER 
                                }),

                                // Cột 3: Tên TTHC
                                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({text: it.tenTTHC, font:"Times New Roman", size:26})], alignment: docx.AlignmentType.JUSTIFIED })], verticalAlign: docx.VerticalAlign.CENTER, margins: {top:100, bottom:100, left:100, right:100} }),
                                
                                // Cột 4: Lĩnh vực
                                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.TextRun({text: it.linhVuc, font:"Times New Roman", size:26})], alignment: docx.AlignmentType.CENTER })], verticalAlign: docx.VerticalAlign.CENTER }),
                                
                                // Cột 5: Mã QR
                                new docx.TableCell({ children: [new docx.Paragraph({ children: [new docx.ImageRun({ data: qrBuffer, transformation: {width: 100, height: 100} })], alignment: docx.AlignmentType.CENTER })], verticalAlign: docx.VerticalAlign.CENTER, margins: {top: 100, bottom: 100} })
                            ]
                        }));
                        
                        currentItemCount++;
                        if (currentItemCount % 10 === 0 && bar && text) {
                            let percent = Math.round((currentItemCount / data.length) * 100);
                            bar.style.width = percent + '%'; bar.innerText = percent + '%';
                            text.innerText = `${currentItemCount} / ${data.length} thủ tục`;
                            await new Promise(resolve => setTimeout(resolve, 10));
                        }
                    }
                }

                let secProps = { page: { size: { width: 11906, height: 16838 }, margin: marginConfig } };
                if (isFirstDataSection) {
                    secProps.page.pageNumbers = { start: 1, formatType: docx.NumberFormat.DECIMAL };
                    isFirstDataSection = false;
                }

                dataSections.push({
                    properties: secProps,
                    headers: {
                        default: new docx.Header({
                            children: [
                                new docx.Paragraph({
                                    tabStops: [{ type: docx.TabStopType.RIGHT, position: 9071 }], 
                                    children: [
                                        new docx.TextRun({ text: agencyLabel, bold: true, font: "Times New Roman", size: 24, color: "D2232A" }), 
                                        new docx.TextRun({ text: "\tTrang ", font: "Times New Roman", size: 24, italics: true, color: "1e293b" }),
                                        // Tách phần trang hiện tại
                                        new docx.TextRun({ children: [docx.PageNumber.CURRENT, " / "], font: "Times New Roman", size: 24, italics: true, color: "1e293b" }),
                                        // Sử dụng tham chiếu đến chốt cuối cùng thay vì đếm tổng trang vật lý
                                        new docx.SimpleField('PAGEREF END_OF_DOC')
                                    ]
                                })
                            ]
                        })
                    },
                    children: [
                        // Đã xóa paragraph rỗng gây lỗi dòng trắng ở đây
                        new docx.Table({
                            width: { size: 100, type: docx.WidthType.PERCENTAGE },
                            columnWidths: [1000, 1800, 4500, 1500, 1500],
                            rows: tableRows
                        })
                    ]
                });
            }

            // ==========================================
            // DÀN TRANG (SECTION 1: BÌA)
            // ==========================================
            let coverChildren = [];

            coverChildren.push(new docx.Paragraph({
                children: [
                    new docx.ImageRun({
                        data: coverImageBuffer,
                        transformation: { width: 794, height: 1123 },
                        floating: {
                            horizontalPosition: { relative: docx.HorizontalPositionRelativeFrom.PAGE, offset: 0 },
                            verticalPosition: { relative: docx.VerticalPositionRelativeFrom.PAGE, offset: 0 },
                            wrap: { type: docx.TextWrappingType.NONE },
                            behindDocument: true
                        }
                    }),
                    new docx.TextRun({ text: parentAgency.toUpperCase(), font: "Times New Roman", size: 28, color: textColor })
                ],
                alignment: docx.AlignmentType.CENTER,
                spacing: { before: 200, after: 100 }
            }));

            coverChildren.push(new docx.Paragraph({
                children: [new docx.TextRun({ text: agencyName.toUpperCase(), font: "Times New Roman", size: 28, bold: true, color: textColor })],
                alignment: docx.AlignmentType.CENTER,
                spacing: { after: 1200 }
            }));

            if (logoCchcBuffer) {
                coverChildren.push(new docx.Paragraph({
                    children: [new docx.ImageRun({ data: logoCchcBuffer, transformation: { width: 160, height: 160 } })],
                    alignment: docx.AlignmentType.CENTER,
                    spacing: { after: 1200 }
                }));
            }

            coverChildren.push(
                new docx.Paragraph({
                    children: [new docx.TextRun({ text: "DANH BẠ MÃ QRCODE", font: "Times New Roman", size: 52, bold: true, color: textColor })],
                    alignment: docx.AlignmentType.CENTER,
                    spacing: { before: 200, after: 100 }
                }),
                new docx.Paragraph({
                    children: [new docx.TextRun({ text: "THỦ TỤC HÀNH CHÍNH", font: "Times New Roman", size: 52, bold: true, color: textColor })],
                    alignment: docx.AlignmentType.CENTER,
                    spacing: { after: 400 }
                }),
                new docx.Paragraph({
                    children: [new docx.TextRun({ text: `(Cập nhật ngày ${dateStr})`, font: "Times New Roman", size: 32, italics: true, color: textColor })],
                    alignment: docx.AlignmentType.CENTER,
                    spacing: { after: 0 } 
                })
            );

            let sections = [];

            // GÓI SECTION 1: TRANG BÌA
            sections.push({
                properties: { 
                    page: { size: { width: 11906, height: 16838 }, margin: { top: 1417, bottom: 1134, left: 1701, right: 1134 } } 
                },
                footers: {
                    default: new docx.Footer({
                        children: [
                            new docx.Paragraph({
                                children: [new docx.TextRun({ text: `${provName}, năm ${today.getFullYear()}`, font: "Times New Roman", size: 28, italics: true, color: textColor })],
                                alignment: docx.AlignmentType.CENTER
                            })
                        ]
                    })
                },
                children: coverChildren
            });

            // GÓI SECTION 2: BẢNG MỤC LỤC
            sections.push({
                properties: { 
                    page: { size: { width: 11906, height: 16838 }, margin: marginConfig } 
                },
                footers: {
                    default: new docx.Footer({ children: [] }) 
                },
                children: [
                    new docx.Paragraph({
                        children: [new docx.TextRun({ text: "MỤC LỤC", font: "Times New Roman", size: 32, bold: true })],
                        alignment: docx.AlignmentType.CENTER,
                        spacing: { after: 400 }
                    }),
                    new docx.Table({
                        width: { size: 100, type: docx.WidthType.PERCENTAGE },
                        rows: tocRows
                    }),
                    new docx.Paragraph({
                        children: [new docx.TextRun({ text: "\n* Hướng dẫn: Để số trang hiển thị chính xác -> Vui lòng chờ file tải hết các trang rồi bấm (Ctrl + A) để bôi đen toàn bộ -> Sau đó ấn phím F9 (hoặc Chuột phải chọn Update Field). Sau khi kiểm tra số trang chính xác, có thể xoá dòng chữ này đi", font: "Times New Roman", size: 24, italics: true, color: "D2232A" })],
                        alignment: docx.AlignmentType.LEFT,
                        spacing: { before: 400 }
                    })
                ]
            });

            // CẮM CHỐT ĐÁNH DẤU TRANG CUỐI CÙNG CỦA TOÀN BỘ DỮ LIỆU
            if (dataSections.length > 0) {
                let lastSection = dataSections[dataSections.length - 1];
                lastSection.children.push(
                    new docx.Paragraph({
                        children: [
                            new docx.Bookmark({ id: "END_OF_DOC", children: [new docx.TextRun({ text: "", size: 2 })] })
                        ],
                        spacing: { before: 0, after: 0 }
                    })
                );
            }            

            sections = sections.concat(dataSections);

            if (text) text.innerText = "Đang đóng gói file Word... Vui lòng đợi!";
            
            // XÓA BỎ lệnh updateFields: true để tránh lỗi đếm trang ảo
            const doc = new docx.Document({ sections: sections });
            const blob = await docx.Packer.toBlob(doc);
            
            let provCleanStr = this.removeAccents(provName).replace(/\s/g, '-').toLowerCase();
            let link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Danh_Ba_QR_TTHC_${provCleanStr}_${dateStr.replace(/\//g,'')}.docx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error(error);
            alert("Đã xảy ra lỗi khi tạo Danh bạ Word: " + error.message);
        } finally {
            if (overlay) overlay.style.display = 'none';
        }
    },

    setupEventListeners() {
        window.addEventListener('hashchange', () => this.handleRouting());
        
        // Ô Search
        let searchBox = document.getElementById('search-box');
        // Thay bằng Kỹ thuật Debounce (Đợi 300ms sau khi ngừng gõ mới xử lý):
        if(searchBox) {
            searchBox.addEventListener('keyup', () => {
                // Xóa lệnh tìm kiếm cũ nếu người dùng đang gõ liên tục
                clearTimeout(this.searchTimeout); 
                
                // Thiết lập lệnh mới, chỉ chạy khi đã ngừng gõ 0.3 giây
                this.searchTimeout = setTimeout(() => {
                    this.handleSearch();
                }, 300); 
            });
        }

        // Phím tắt ESC
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' || event.keyCode === 27) {
                this.resetSearchAndGoHome();
                if (searchBox) searchBox.blur();
            }
        });

        // Thanh tìm kiếm bám dính
        window.addEventListener('scroll', () => {
            let searchWrapper = document.querySelector('.search-wrapper');
            if(searchWrapper) {
                if (window.scrollY > 200) {
                    if (!searchWrapper.classList.contains('sticky-mode')) searchWrapper.classList.add('sticky-mode');
                } else {
                    if (searchWrapper.classList.contains('sticky-mode')) searchWrapper.classList.remove('sticky-mode');
                }
            }
        });

        // Tắt Modal khi click ngoài
        window.onclick = (e) => {
            // 1. Đóng dropdown tỉnh
            let provDropdown = document.getElementById('wizard-province-dropdown');
            let provInputWrapper = document.getElementById('wizard-province-search').parentElement;
            if (provDropdown && provDropdown.style.display === 'block') {
                if (!provDropdown.contains(e.target) && !provInputWrapper.contains(e.target)) {
                    provDropdown.style.display = 'none';
                }
            }

            // 2. NGĂN CHẶN CLICK NHẦM VÀO SELECT TRONG MODAL KHI NÓ ĐANG ẨN
            let modal = document.getElementById('setupWizardModalOverlay');
            if (modal && !modal.classList.contains('active')) {
                if (modal.contains(e.target)) {
                    e.stopPropagation();
                    return; 
                }
            }

            let legalModal = document.getElementById('legalModalOverlay');
        if (legalModal && e.target === legalModal) {
            legalModal.classList.remove('active');
        }

            // 3. ĐÓNG MODAL CẤU HÌNH KHI BẤM VÀO NỀN XÁM
            let wizardModal = document.getElementById('setupWizardModalOverlay');
            // Chỉ đóng khi target chính là cái nền xám (overlay)
            if (wizardModal && e.target === wizardModal) {
                let closeBtn = document.getElementById('wizard-close-btn');
                // Bọc lót: Không cho tắt nếu đang bị ép cấu hình lần đầu (nút X bị ẩn)
                if (closeBtn && closeBtn.style.display !== 'none') {
                    app.closeWizard();
                }
            }

            // 4. ĐÓNG MODAL TÁC NGHIỆP KHI BẤM VÀO NỀN XÁM
            let tnModal = document.getElementById('tnConfigModalOverlay');
            if (tnModal && e.target === tnModal) {
                app.closeTnConfig();
            }
            // 5. ĐÓNG MODAL BÁO CÁO LỖI KHI BẤM VÀO NỀN XÁM
            let reportModal = document.getElementById('reportErrorModalOverlay');
            if (reportModal && e.target === reportModal) {
                app.closeReportModal();
            }
            // ĐÓNG MODAL CƠ QUAN MẶC ĐỊNH KHI BẤM VÀO NỀN XÁM
            let agencyModal = document.getElementById('agencyConfigModalOverlay');
            if (agencyModal && e.target === agencyModal) {
                app.closeAgencyModal();
            }
            // ĐÓNG MODAL CHI TIẾT TTHC KHI BẤM VÀO NỀN XÁM
            let detailModal = document.getElementById('procedureDetailModal');
            if (detailModal && e.target === detailModal) {
                detailModal.style.display = 'none';
            }
        };
    },
  // =========================================================
    // MODULE CHI TIẾT THỦ TỤC HÀNH CHÍNH (ENTERPRISE MODAL)
    // =========================================================
    detailDataCache: {}, 

    async openProcedureDetail(id) {
        try {
            if (!id) return;
            
            // 1. Hiển thị Modal & Vòng xoay Loading
            let elModal = document.getElementById('procedureDetailModal');
            if (elModal) elModal.style.display = 'flex';
            
            let contentEl = document.getElementById('detail-tab-content');
            if (contentEl) contentEl.innerHTML = '<div style="text-align:center; padding: 50px; color: var(--primary-color);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><div style="margin-top: 15px; font-weight: 600;">Đang tải chi tiết cấu trúc từ CSDL Quốc gia...</div></div>';

            // 2. Fetch API JSON chuẩn từ CDN
            let res = await fetch(`https://cdn.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/details/${id}.json`);
            if (!res.ok) throw new Error("Dữ liệu chi tiết không tồn tại trên CDN");
            let detailData = await res.json();

            // Hàm tiện ích lấy dữ liệu mảng an toàn
            let safeGet = (val, defaultVal = 'Không có dữ liệu') => {
                if (val === null || val === undefined || val === '') return defaultVal;
                if (Array.isArray(val) && val.length === 0) return defaultVal;
                return val;
            };

            // ========================================================
            // 3. ĐỔ DỮ LIỆU KHU VỰC 1 (MAP CHUẨN CẤU TRÚC JSON MỚI)
            // ========================================================
            let safeSet = (elId, val, defaultText = 'Không có dữ liệu') => {
                let el = document.getElementById(elId);
                if (el) el.innerHTML = (val && val !== 'null') ? val : defaultText;
            };

            let maTTHC = safeGet(detailData.code);
            safeSet('detail-ma-txt', maTTHC);
            safeSet('detail-title', safeGet(detailData.name, 'CHƯA CẬP NHẬT TÊN THỦ TỤC'));
            
            // Lĩnh vực
            let linhVuc = 'Không có dữ liệu';
            if (detailData.categoriesDetails && detailData.categoriesDetails.length > 0) {
                linhVuc = detailData.categoriesDetails.map(c => c.name).join(', ');
            }
            safeSet('detail-linhvuc', linhVuc);

            // Số Quyết định
            let soQD = detailData.procedureProposal?.proposalNumber || detailData.decisionNo || 'Không có dữ liệu';
            safeSet('detail-soqd', soQD);

            // Kết quả thực hiện
            let ketQua = 'Không có dữ liệu';
            if (detailData.resultsDetails && detailData.resultsDetails.length > 0) {
                ketQua = detailData.resultsDetails.map(r => r.name).join('; ');
            }
            safeSet('detail-ketqua', ketQua);
            
            // Các cơ quan
            safeSet('detail-cqcb', safeGet(detailData.departmentPromulgateName));
            
            let cqth = safeGet(detailData.executingAgencies);
            if (cqth === 'Không có dữ liệu' && detailData.departmentsExecuting) {
                cqth = detailData.departmentsExecuting.map(d => d.name).join(', ');
            }
            safeSet('detail-cqth', cqth);
            
            // Cấp thực hiện (Map từ Boolean cờ)
            let capArr = [];
            if (detailData.isMinistry) capArr.push('Bộ');
            if (detailData.isProvince) capArr.push('Tỉnh');
            if (detailData.isWard) capArr.push('Xã');
            safeSet('detail-cap', capArr.length > 0 ? capArr.join(', ') : 'Không có dữ liệu');

            // ==========================================
            // Hiển thị Enum Tiếng Việt bằng Constants
            // ==========================================
            safeSet('detail-loai', TTHC_TYPE_LABELS[detailData.type] || 'Không xác định');
            safeSet('detail-formality', TTHC_FORMALITY_TYPE_LABELS[detailData.formalityType] || 'Không xác định');
            safeSet('detail-state', TTHC_STATE_LABELS[detailData.state] || 'Không xác định');
            safeSet('detail-isInternal', TTHC_INTERNAL_LABELS[String(detailData.isInternal)] || 'Không xác định');
            
            // Đối tượng thực hiện
            let doiTuong = 'Không có dữ liệu';
            if (detailData.subjectTypesDetails && detailData.subjectTypesDetails.length > 0) {
                doiTuong = detailData.subjectTypesDetails.map(s => s.name).join(', ');
            }
            safeSet('detail-doituong', doiTuong);
            
            safeSet('detail-diachi', safeGet(detailData.dossierReceivingAddresses));

            // ========================================================
            // 4. XỬ LÝ KHU VỰC 2 (CÁC TAB DỮ LIỆU BẢNG)
            // ========================================================
            
            // 4.1. Trình tự thực hiện (Đọc từ mảng executionSteps)
            let trinhTuHtml = '';
            if (detailData.executionSteps && detailData.executionSteps.length > 0) {
                trinhTuHtml = detailData.executionSteps.map(step => step.description).join('\n\n').replace(/\n/g, '<br>');
            }

            // 4.2. Cách thức thực hiện (Đọc từ mảng executionMethods)
            let cachThucHtml = '';
            if (detailData.executionMethods && detailData.executionMethods.length > 0) {
                let methodMap = { "ONLINE": "Trực tuyến", "DIRECT": "Trực tiếp", "POSTAL": "Bưu chính" };
                let unitMap = { "DAY": "Ngày", "WORKING_DAY": "Ngày làm việc", "MONTH": "Tháng", "YEAR": "Năm", "HOUR": "Giờ", "OTHER": "Theo quy định" };
                
                cachThucHtml = `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14.5px; border: 1px solid #cbd5e1; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <thead><tr style="background: #f1f5f9; color: #1e293b; text-transform: uppercase; font-size: 12px;">
                        <th style="padding: 12px; border: 1px solid #cbd5e1; width: 15%; text-align: center;">Hình thức</th>
                        <th style="padding: 12px; border: 1px solid #cbd5e1; width: 20%; text-align: center;">Thời gian giải quyết</th>
                        <th style="padding: 12px; border: 1px solid #cbd5e1; width: 35%;">Phí / Lệ phí</th>
                        <th style="padding: 12px; border: 1px solid #cbd5e1; width: 30%;">Mô tả thêm</th>
                    </tr></thead><tbody>`;

                detailData.executionMethods.forEach(method => {
                    let ht = methodMap[method.submissionMethod] || method.submissionMethod;
                    let tg = method.processingTime > 0 ? `${method.processingTime} ${unitMap[method.processingTimeUnit] || method.processingTimeUnit}` : 'Theo quy định';
                    
                    let phiArr = method.fees?.map(f => {
                        let p = f.value > 0 ? f.value.toLocaleString('vi-VN') + ' VNĐ' : 'Theo quy định';
                        return f.description ? `${p} (${f.description})` : p;
                    }) || [];
                    let phi = phiArr.length > 0 ? phiArr.join('<br>') : 'Không có quy định';
                    let mota = method.description || 'Không có';

                    cachThucHtml += `<tr style="transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700; color: var(--primary-color);">${ht}</td>
                        <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: center; color: #dc2626; font-weight: 500;">${tg}</td>
                        <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: justify;">${phi}</td>
                        <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: justify; color: #64748b;">${mota}</td>
                    </tr>`;
                });
                cachThucHtml += `</tbody></table>`;
            }

            // 4.3. Thành phần hồ sơ (Đọc từ mảng executionCases > profileComponents)
            let hoSoHtml = '';

            if (detailData.executionCases && detailData.executionCases.length > 0) {
                hoSoHtml += `
                    <div class="procedure-documents-wrapper">
                        <div class="procedure-documents-scroll">
                            <table class="procedure-documents-table">
                                <colgroup>
                                    <col class="col-stt">
                                    <col class="col-document">
                                    <col class="col-quantity">
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th class="center-cell">STT</th>
                                        <th>TÊN GIẤY TỜ, TÀI LIỆU CẦN NỘP</th>
                                        <th class="center-cell">SỐ LƯỢNG</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;

                let stt = 1;
                detailData.executionCases.forEach(c => {
                    if (c.name) {
                        hoSoHtml += `
                            <tr class="execution-case-row">
                                <td colspan="3">
                                    <div class="execution-case-title">
                                        <i class="fa-solid fa-layer-group"></i> ${app.escapeHtml(c.name)}
                                    </div>
                                </td>
                            </tr>
                        `;
                    }
                    
                    if (c.profileComponents && c.profileComponents.length > 0) {
                        c.profileComponents.forEach(comp => {
                            let rawName = comp.name || '';
                            let cleanName = rawName.replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
                            if (!cleanName) cleanName = 'Giấy tờ, tài liệu';

                            let quantityHtml = '';
                            if (comp.originalQty > 0) quantityHtml += `<div>Bản chính: ${comp.originalQty}</div>`;
                            if (comp.copyQty > 0) quantityHtml += `<div style="color: #64748b; font-size: 12px; margin-top: 4px;">Bản sao: ${comp.copyQty}</div>`;
                            if (!quantityHtml) quantityHtml = `<div>Theo quy định</div>`;

                            let attachmentHtml = '';
                            if (comp.attachments && comp.attachments.length > 0) {
                                const items = comp.attachments.map(att => {
                                    const fileId = att.id || att.fileId;
                                    if (!fileId) return '';
                                    
                                    const fileName = att.fileName || att.name || 'Biểu mẫu đính kèm';
                                    const fileIcon = app.getFileIcon(fileName);

                                    return `
                                        <div class="attachment-item">
                                            <div class="attachment-file">
                                                ${fileIcon}
                                                <span class="attachment-file-name">${app.escapeHtml(fileName)}</span>
                                            </div>
                                            <button type="button" class="attachment-download" onclick="app.downloadAttachment('${fileId}', this)">
                                                <i class="fa-solid fa-download"></i>
                                                <span>Tải biểu mẫu</span>
                                            </button>
                                        </div>
                                    `;
                                }).join('');

                                if (items) {
                                    attachmentHtml = `<div class="attachment-list">${items}</div>`;
                                }
                            }

                            hoSoHtml += `
                                <tr class="document-row">
                                    <td class="stt-cell">${stt++}</td>
                                    <td class="document-cell">
                                        <div class="document-content">
                                            <div class="document-name">${cleanName}</div>
                                            ${attachmentHtml}
                                        </div>
                                    </td>
                                    <td class="quantity-cell">${quantityHtml}</td>
                                </tr>
                            `;
                        });
                    }
                });
                
                hoSoHtml += `</tbody></table></div></div>`;
            } else {
                hoSoHtml = `<div class="no-profile-data">Chưa có dữ liệu thành phần hồ sơ</div>`;
            }

            // 4.4. Yêu cầu điều kiện & Căn cứ pháp lý
            let dieuKienHtml = safeGet(detailData.requirementsAndConditions);
            let canCuHtml = '';
            if (detailData.legalBasisesDetails && detailData.legalBasisesDetails.length > 0) {
                canCuHtml = '<ul style="margin: 0; padding-left: 20px; line-height: 1.8;">' + 
                    detailData.legalBasisesDetails.map(l => `<li style="margin-bottom: 8px;"><strong>${l.code}</strong>: ${l.name}</li>`).join('') + 
                    '</ul>';
            }

            // ========================================================
            // 5. RÁP VÀO TAB MENU
            // ========================================================
            this.detailDataCache = {
                'tab-trinhtu': (cachThucHtml ? `<h4 style="color: var(--primary-color); margin-top: 0; font-size: 15.5px; text-transform: uppercase;">1. Cách thức thực hiện</h4>${cachThucHtml}` : '') + 
                               (trinhTuHtml ? `<h4 style="color: var(--primary-color); margin-top: 25px; font-size: 15.5px; text-transform: uppercase;">2. Trình tự thực hiện</h4><div style="white-space: pre-wrap;">${trinhTuHtml}</div>` : ''),
                'tab-hoso': hoSoHtml,
                'tab-dieukien': dieuKienHtml !== 'Không có dữ liệu' ? `<div style="white-space: pre-wrap;">${dieuKienHtml}</div>` : '<div style="color: #64748b; font-style: italic; text-align: center;">Chưa có dữ liệu</div>',
                'tab-cancu': canCuHtml ? canCuHtml : '<div style="color: #64748b; font-style: italic; text-align: center;">Chưa có dữ liệu</div>'
            };

            let tabMenuHtml = '';
            let firstAvailableTab = '';
            let addTab = (id, label, icon) => {
                if (!firstAvailableTab) firstAvailableTab = id;
                tabMenuHtml += `<button onclick="app.switchDetailTab('${id}')" id="btn-${id}" style="background: none; border: none; border-bottom: 3px solid transparent; padding: 12px 20px; font-size: 14.5px; font-weight: 700; color: #64748b; cursor: pointer; white-space: nowrap; transition: 0.2s; display: flex; gap: 8px; align-items: center;"><i class="${icon}"></i> ${label}</button>`;
            };

            addTab('tab-trinhtu', 'Cách thức & Trình tự', 'fa-solid fa-list-ol');
            addTab('tab-hoso', 'Thành phần hồ sơ', 'fa-solid fa-folder-open');
            addTab('tab-dieukien', 'Yêu cầu & Điều kiện', 'fa-solid fa-circle-exclamation');
            addTab('tab-cancu', 'Căn cứ pháp lý', 'fa-solid fa-scale-balanced');

            let elMenu = document.getElementById('detail-tabs-menu');
            if (elMenu) elMenu.innerHTML = tabMenuHtml;

            if (firstAvailableTab) this.switchDetailTab(firstAvailableTab);

            // 6. GẮN SỰ KIỆN NÚT COPY / NỘP HỒ SƠ
            let btnCopy = document.getElementById('btn-copy-ma');
            if (btnCopy) {
                btnCopy.onclick = () => {
                    navigator.clipboard.writeText(maTTHC);
                    let oldHtml = btnCopy.innerHTML;
                    btnCopy.innerHTML = `<i class="fa-solid fa-check" style="color: #10b981;"></i> Đã chép`;
                    setTimeout(() => { btnCopy.innerHTML = oldHtml; }, 2000);
                };
            }

            let btnSubmit = document.getElementById('btn-submit-dvc');
            if (btnSubmit) {
                btnSubmit.onclick = (e) => {
                    e.preventDefault();
                    if(elModal) elModal.style.display = 'none'; 
                    
                    // BƯỚC 1: Truy xuất Cơ sở dữ liệu
                    let linkNop = '';
                    let procData = null;
                    if (window.appData && window.appData.fullDatabase) {
                        procData = window.appData.fullDatabase.find(item => item['MaDVC'] === maTTHC || item['MaTTHC'] === maTTHC);
                        if (procData) {
                            let linkKey = Object.keys(procData).find(k => {
                                let cleanK = k.toLowerCase().replace(/[_-\s]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                                return cleanK.includes('linknop') || cleanK.includes('url') || cleanK === 'link';
                            });
                            if (linkKey) linkNop = procData[linkKey];
                        }
                    }

                    // --- FALLBACK: QUAY LẠI TÌM THEO LĨNH VỰC NHƯ CÁCH CŨ NẾU SHEET THIẾU LINK ---
                    if (!linkNop || linkNop.trim() === '' || linkNop === 'null') {
                        let elLinhVuc = document.getElementById('detail-linhvuc');
                        let linhVucText = elLinhVuc ? elLinhVuc.innerText : '';
                        if (linhVucText && window.appData.cauHinhLink) {
                            let listLV = linhVucText.split(',');
                            for (let lv of listLV) {
                                let lvClean = lv.trim();
                                if (window.appData.cauHinhLink[lvClean]) {
                                    linkNop = window.appData.cauHinhLink[lvClean];
                                    break;
                                }
                            }
                        }
                    }

                    // --- XỬ LÝ LỖI ĐẶC THÙ CHO PHẦN MỀM NGÀNH DỌC (FPT: TƯ PHÁP, DÂN TỘC TÔN GIÁO) ---
                    if (linkNop && (linkNop.includes('moj.gov.vn') || linkNop.includes('bdttg.gov.vn') || linkNop.includes('cema.gov.vn'))) {
                        
                        // BẮT LỖI TỐI THƯỢNG: Cứ không có dấu "?" là chắc chắn thiếu tham số -> Kích hoạt ghép link
                        if (!linkNop.includes('?')) {
                            
                            // Gọt sạch đuôi /danh-sach-thu-tuc hoặc dấu / thừa (nếu có trong Sheet) để lấy tên miền thuần túy
                            let tenMien = linkNop.replace(/\/danh-sach-thu-tuc\/?$/, '').replace(/\/$/, '');
                            if (!tenMien.startsWith('http')) tenMien = 'https://' + tenMien;
                            
                            let baseMaTTHC = maTTHC;
                            let maCQTH = '';
                            let capSo = '2'; // Mặc định Cấp Tỉnh
                            
                            if (procData) {
                                let keyMaTTHC = Object.keys(procData).find(k => k.toLowerCase().replace(/[_-\s]/g, '') === 'matthc');
                                if (keyMaTTHC && procData[keyMaTTHC]) baseMaTTHC = procData[keyMaTTHC];
                                else {
                                    let parts = maTTHC.split('.');
                                    if (parts.length >= 2) baseMaTTHC = parts[0] + '.' + parts[1];
                                }
                                
                                let keyCQ = Object.keys(procData).find(k => {
                                    let clean = k.toLowerCase().replace(/[_-\s]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                                    return clean.includes('macoquanthuchien') || clean.includes('macqth');
                                });
                                if (keyCQ) maCQTH = procData[keyCQ] || '';
                                
                                let keyCap = Object.keys(procData).find(k => {
                                    let clean = k.toLowerCase().replace(/[_-\s]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                                    return clean.includes('capthuchien');
                                });
                                if (keyCap) {
                                    let capStr = (procData[keyCap] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                                    if (capStr.includes('xa') || capStr.includes('phuong')) capSo = '4';
                                    else if (capStr.includes('huyen') || capStr.includes('quan')) capSo = '3';
                                    else if (capStr.includes('bo')) capSo = '1';
                                }
                            } 
                            else if (detailData) {
                                let parts = maTTHC.split('.');
                                if (parts.length >= 2) baseMaTTHC = parts[0] + '.' + parts[1];
                                
                                if (detailData.departmentsExecuting && detailData.departmentsExecuting.length > 0) {
                                    maCQTH = detailData.departmentsExecuting[0].code || '';
                                }
                                if (detailData.isWard) capSo = '4';
                                else if (detailData.isProvince) capSo = '2';
                                else if (detailData.isMinistry) capSo = '1';
                            }
                            
                            // Gắn cứng lại đuôi /danh-sach-thu-tuc và ghép tham số vào Tên miền đã gọt sạch
                            linkNop = `${tenMien}/danh-sach-thu-tuc?vneid=1&MaTTHCDP=${baseMaTTHC}&MaTTHC=${baseMaTTHC}&MaDVC=${maTTHC}&MaCoQuanThucHien=${maCQTH}&keyword=&CapThucHien=${capSo}`;
                        }
                    }

                    // BƯỚC 2: Điều hướng thông minh
                    if (linkNop && linkNop.trim() !== '' && linkNop !== 'null') {
                        app.openProcedureLink(e, linkNop);
                    } else {
                        app.showToast("Đang tìm kiếm thủ tục này trên hệ thống...");
                        app.resetSearchAndGoHome(); 
                        setTimeout(() => {
                            let searchBox = document.getElementById('search-box');
                            if (searchBox) {
                                searchBox.value = maTTHC; 
                                clearTimeout(app.searchTimeout);
                                app.handleSearch(); 
                            }
                        }, 100);
                    }
                };
            }

        } catch (error) {
            console.error("Lỗi Fetch API Chi tiết:", error);
            let contentEl = document.getElementById('detail-tab-content');
            if (contentEl) contentEl.innerHTML = `<div style="text-align:center; padding: 40px; color: #dc2626;"><i class="fa-solid fa-triangle-exclamation fa-2x"></i><div style="margin-top: 10px;">Lỗi tải dữ liệu: ${error.message}</div></div>`;
        }
    },

    switchDetailTab(tabId) {
        ['tab-trinhtu', 'tab-hoso', 'tab-dieukien', 'tab-cancu'].forEach(id => {
            let btn = document.getElementById('btn-' + id);
            if (btn) {
                btn.style.color = '#64748b';
                btn.style.borderBottomColor = 'transparent';
                btn.style.background = 'transparent';
            }
        });

        let activeBtn = document.getElementById('btn-' + tabId);
        if (activeBtn) {
            activeBtn.style.color = 'var(--primary-color)';
            activeBtn.style.borderBottomColor = 'var(--primary-color)';
            activeBtn.style.background = 'rgba(201,81,23,0.05)';
        }

        let contentEl = document.getElementById('detail-tab-content');
        if (contentEl) contentEl.innerHTML = this.detailDataCache[tabId] || 'Không có dữ liệu.';
    },

// =========================================================
    // HÀM LẤY GIỜ CẬP NHẬT FILE INDEX.JSON TRỰC TIẾP TỪ GITHUB
    // =========================================================
    async fetchNationalUpdateTime() {
        let timeEl = document.getElementById('national-update-time');
        
        // KIỂM TRA 1: Báo lỗi nếu chưa gắn HTML hoặc sai ID
        if (!timeEl) {
            console.warn("⚠️ CHƯA TÌM THẤY THẺ HTML CÓ ID 'national-update-time' TRONG GIAO DIỆN!");
            return;
        }
        
        try {
            timeEl.innerText = "(Đang đồng bộ thời gian từ Github...)"; // Trạng thái chờ
            
            let res = await fetch('https://api.github.com/repos/ChippedTopaz/am-sieu-toc-data/commits?path=index.json&sha=data&per_page=1');
            
            if (!res.ok) throw new Error("Hết lượt gọi API hoặc lỗi mạng");
            
            let commits = await res.json();
            
            if (commits && commits.length > 0) {
                let dateStr = commits[0].commit.committer.date; 
                let dateObj = new Date(dateStr); 
                
                let timeString = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                let dateString = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                
                timeEl.innerText = `(Cập nhật lúc ${timeString} ngày ${dateString})`;
                timeEl.style.color = '#10b981'; // Bật màu xanh nếu tải thành công
            } else {
                timeEl.innerText = `(Lịch sử cập nhật trống)`;
            }
        } catch (e) {
            console.log("Chi tiết lỗi Github:", e);
            timeEl.innerText = `(Vừa cập nhật từ GitHub)`; 
            timeEl.style.color = '#64748b'; // Trả về màu xám nếu API bị giới hạn
        }
    }   

}; // KẾT THÚC APP

// Thay thế window.onload bằng DOMContentLoaded để không bị lỗi 404 chặn khởi động
document.addEventListener("DOMContentLoaded", () => {
    app.init();
});