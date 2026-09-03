// =========================================
// FILE: js/main.js
// Khởi chạy ứng dụng và Quản lý Trạng thái
// =========================================



const app = {
    favoriteProcs: JSON.parse(localStorage.getItem('favDvcProcedures_V2')) || [],
    wizardSelectedFields: JSON.parse(localStorage.getItem('favFields_V2')) || [], 
    hiddenTnItems: JSON.parse(localStorage.getItem('hiddenTnItems_V2')) || [],
    tnGroupOrder: JSON.parse(localStorage.getItem('tnGroupOrder_V2')) || [],
    tempTnGroups: [],
    tableState: { data: [], filtered: [], currentPage: 1, rowsPerPage: 20 },
    searchTimeout: null, // BỔ SUNG BIẾN NÀY ĐỂ LÀM DEBOUNCE
    incognitoMode: localStorage.getItem('incognitoMode_V2') === 'true',
    isStatsCalculated: false, // CỜ HIỆU ĐIỀU KHIỂN LAZY LOADING
    currentReportData: null, // LƯU TẠM THÔNG TIN BÁO LỖI ĐỂ TRUYỀN SANG HÀM GỬI

    // BỔ SUNG HÀM TIỆN ÍCH LOẠI BỎ DẤU TIẾNG VIỆT
    removeAccents(str) {
        if (!str) return '';
        return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    },

    // 1. KHỞI TẠO HỆ THỐNG
    async init() {
        window.appData.defaultAgency = localStorage.getItem('dvc_v2_default_agency') || "";
        // --- KIỂM TRA ĐIỀU KHOẢN SỬ DỤNG (BẮT BUỘC LẦN ĐẦU) ---
        if (localStorage.getItem('dvc_v2_agreed_terms') !== 'true') {
            document.getElementById('mandatoryTermsModal').style.display = 'flex';
            return; // Dừng lại, không cho load app nếu chưa đồng ý
        }
        // -----------------------------------------------------
        if(localStorage.getItem('theme_V2') === 'dark') document.body.classList.add('dark-mode');

        if (CONFIG.APP_LOGO) {
            let logoImg = document.getElementById('logo-img');
            if (logoImg) logoImg.src = CONFIG.APP_LOGO;
        }
        if (CONFIG.APP_BANNER) {
            let bannerEl = document.querySelector('.hero-banner');
            if (bannerEl) bannerEl.style.backgroundImage = `url('${CONFIG.APP_BANNER}')`;
        }

        // --- TỰ ĐỘNG GẮN FAVICON ĐỘNG ---
        if (CONFIG.APP_FAVICON) {
            let favicon = document.querySelector("link[rel*='icon']") || document.createElement('link');
            favicon.type = 'image/png';
            favicon.rel = 'icon';
            favicon.href = CONFIG.APP_FAVICON;
            document.head.appendChild(favicon);
        }
        
        this.initFooterStats();
        this.updateIncognitoUI(); 
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
        this.updateFavProvinceUI();
        this.setupEventListeners();

        // BẮT ĐẦU KIỂM TRA BỘ NHỚ ĐỆM (CACHE)
        document.getElementById('loading').style.display = 'block';
        document.getElementById('loading-text').innerText = "Đang kiểm tra bộ nhớ đệm...";
        
        // BƯỚC NGOẶT TỐC ĐỘ: Lấy dữ liệu từ Cache ra cực nhanh (chỉ mất 0.1s)
        await DataLoader.initData(false);
        document.getElementById('loading').style.display = 'none';

        // ĐIỀU HƯỚNG GIAO DIỆN
        if (!window.appData.favoriteProvince) {
            this.openSetupWizard(true); 
        } else {
            // THAY VÌ LUÔN MỞ TRANG CHỦ, HÃY ĐỂ HỆ THỐNG TỰ ĐỌC URL VÀ MỞ ĐÚNG TRANG
            this.handleRouting(); 
            
            // KỸ THUẬT ĐỒNG BỘ NGẦM (BACKGROUND SYNC)
            setTimeout(() => {
                DataLoader.initData(true).catch(e => console.log("Lỗi đồng bộ ngầm"));
            }, 2000); 
        }
    },

    // HÀM QUÉT VÀ HIỂN THỊ DANH SÁCH CƠ QUAN TỪ DỮ LIỆU TỈNH
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

    renderThongKe() {
        UIRenderer.isSearchFlow = false;
        UIRenderer.currentLevel = 'thongke';

        // 1. Dọn dẹp và lật sang trang Thống kê ngay lập tức (0 độ trễ)
        document.getElementById('content-grid').style.display = 'none';
        document.getElementById('tacnghiep-section').style.display = 'none';
        document.getElementById('donate-section').style.display = 'none';
        document.getElementById('huongdan-section').style.display = 'none';
        
        let favSec = document.getElementById('favorites-section');
        if(favSec) favSec.style.display = 'none';
        
        let searchWrapper = document.querySelector('.search-wrapper');
        if (searchWrapper) searchWrapper.style.display = 'none';

        let sub = document.getElementById('breadcrumb-sub');
        if (sub) sub.style.display = 'none';

        document.getElementById('thongke-section').style.display = 'block';
        this.setActiveTab('thongke');

        // 2. THỰC THI Ý TƯỞNG CỦA ANH: Chỉ tính toán duy nhất 1 lần khi bấm vào Tab
        if (!this.isStatsCalculated) {
            // Đặt độ trễ 100ms để trình duyệt ưu tiên vẽ giao diện chuyển Tab mượt mà xong xuôi,
            // rồi mới bắt đầu lôi chip ra tính toán số liệu và vẽ Bảng
            setTimeout(() => {
                this.renderProvinceStats();
                this.isStatsCalculated = true; // Đánh dấu là đã tính xong để lần sau bấm lại không bị lag
            }, 100);
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

        if (!matchedProv) {
            alert("⚠️ Lỗi: Vui lòng nhập đúng và click chọn một Tỉnh/TP có trong danh sách gợi ý!");
            return;
        }
        
        provInput = matchedProv.TenTinh.trim();
        let oldProv = window.appData.favoriteProvince;
        
        if (provInput !== oldProv) {
            window.appData.defaultAgency = "";
            localStorage.removeItem('dvc_v2_default_agency');
            if (this.agencySelectInstance) {
                this.agencySelectInstance.destroy();
                this.agencySelectInstance = null;
            }
        }

        window.appData.favoriteProvince = provInput;
        localStorage.setItem('favProvince', provInput);
        localStorage.setItem('favFields_V2', JSON.stringify(this.wizardSelectedFields));

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

        if (dvcTab) dvcTab.style.color = 'var(--text-color)';
        if (tnTab) tnTab.style.color = 'var(--text-color)';
        if (tkTab) tkTab.style.color = 'var(--text-color)'; // Đổi màu mặc định
        if (hdTab) hdTab.style.color = 'var(--text-color)';

        if (tab === 'dvc') dvcTab.style.color = 'var(--primary-color)';
        else if (tab === 'tacnghiep') tnTab.style.color = 'var(--primary-color)';
        else if (tab === 'thongke') tkTab.style.color = 'var(--primary-color)'; // Bôi đậm màu cam
        else if (tab === 'huongdan') hdTab.style.color = 'var(--primary-color)';
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
        let db = window.appData.fullDatabase || [];
        let dashboard = document.getElementById('province-stats-dashboard');
        
        if (db.length === 0 || !window.appData.favoriteProvince) {
            if (dashboard) dashboard.style.display = 'none';
            return;
        }

        if (dashboard) dashboard.style.display = 'block';

        // =========================================================
        // ĐỌC THỜI GIAN CẬP NHẬT TỪ DỮ LIỆU ĐÃ GIẢI CỨU BÊN DATA-LOADER
        // =========================================================
        let updateTimeStr = "";
        if (db.length > 0) {
            updateTimeStr = db[0]['ThoiGianCapNhat'] || "";

            if (!updateTimeStr) {
                for (let i = 0; i < Math.min(db.length, 3); i++) { 
                    let vals = Object.values(db[i] || {});
                    for (let v of vals) {
                        if (typeof v === 'string') {
                            let normV = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                            if (normV.includes('cap nhat luc') || normV.includes('cap nhat')) {
                                updateTimeStr = v.trim();
                                break;
                            }
                        }
                    }
                    if (updateTimeStr) break;
                }
            }
        }

        let elUpdateTime = document.getElementById('last-update-time');
        if (elUpdateTime) {
            elUpdateTime.innerText = updateTimeStr ? `(${updateTimeStr})` : `(Đang cập nhật...)`;
        }
        // =========================================================


        // LỌC VÀ ĐẾM SỐ LIỆU (Thêm màng lọc Cấp thực hiện Tỉnh/Xã)
        let uniqueProcs = [];
        let seenMaDVC = new Set();
        db.forEach(item => {
            // Điều kiện 1: Trạng thái Công khai / Chính thức
            let isCongKhai = true; 
            let trangThaiKey = Object.keys(item).find(k => {
                let cleanK = k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
                return cleanK.includes('trangthai');
            });
            
            if (trangThaiKey) {
                let val = (item[trangThaiKey] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
                if (!val.includes('congkhai') && !val.includes('cong khai') && !val.includes('chinhthuc') && !val.includes('chinh thuc')) {
                    isCongKhai = false; 
                }
            }

            // Điều kiện 2: CẤP THỰC HIỆN PHẢI CÓ CHỮ TỈNH HOẶC XÃ
            let hasValidCap = false;
            let capKey = Object.keys(item).find(k => {
                let cleanK = k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
                return cleanK.includes('capthuchien');
            });
            let capThucHienStr = capKey ? (item[capKey] || '').toLowerCase() : '';
            if (capThucHienStr.includes('cấp xã') || capThucHienStr.includes('cap xa') || 
                capThucHienStr.includes('cấp tỉnh') || capThucHienStr.includes('cap tinh')) {
                hasValidCap = true;
            }

            // Chỉ đưa vào danh sách hệ thống nếu thỏa mãn CẢ 2 ĐIỀU KIỆN
            if (isCongKhai && hasValidCap) {
                let ma = item['MaDVC'] ? item['MaDVC'].trim() : '';
                if (ma && !seenMaDVC.has(ma)) {
                    seenMaDVC.add(ma);
                    uniqueProcs.push(item);
                }
            }
        });

        // TẠO 3 RỔ ĐỂ PHÂN BỔ DỮ LIỆU ĐỘC LẬP
        let capTinh = 0, capXa = 0;
        let ttAll = 0, mpAll = 0;
        let ttTinh = 0, mpTinh = 0;
        let ttXa = 0, mpXa = 0;

        uniqueProcs.forEach(item => {
            let hasTinh = false;
            let hasXa = false;

            let capKey = Object.keys(item).find(k => {
                let cleanK = k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
                return cleanK.includes('capthuchien');
            });
            let capThucHienStr = capKey ? (item[capKey] || '').toLowerCase() : '';

            if (capThucHienStr.includes('cấp xã') || capThucHienStr.includes('cap xa')) {
                hasXa = true; capXa++;
            }
            if (capThucHienStr.includes('cấp tỉnh') || capThucHienStr.includes('cap tinh')) {
                hasTinh = true; capTinh++;
            }

            let finalMucDo = '';
            let isCountedMucDo = false;
            let mucDoKey = Object.keys(item).find(k => {
                let cleanK = k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
                return cleanK.includes('mucdo') || cleanK.includes('cungcap') || cleanK.includes('toantrinh') || cleanK.includes('hinhthuc');
            });
            
            if (mucDoKey) {
                let mucDo = (item[mucDoKey] || '').toLowerCase();
                if (mucDo.includes('toàn trình') || mucDo.includes('toantrinh') || mucDo === '4') {
                    finalMucDo = 'TT'; isCountedMucDo = true;
                } else if (mucDo.includes('một phần') || mucDo.includes('motphan') || mucDo.includes('1 phần') || mucDo === '3') {
                    finalMucDo = 'MP'; isCountedMucDo = true;
                }
            }
            
            if (!isCountedMucDo) {
                let rowDataStr = JSON.stringify(item).toLowerCase();
                if (rowDataStr.includes('toàn trình')) finalMucDo = 'TT';
                else if (rowDataStr.includes('một phần') || rowDataStr.includes('1 phần')) finalMucDo = 'MP';
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
        });

        this.statsCache = {
            ttAll: ttAll, mpAll: mpAll,
            ttTinh: ttTinh, mpTinh: mpTinh,
            ttXa: ttXa, mpXa: mpXa
        };

        let elTotal = document.getElementById('stat-total-proc');
        if(elTotal) elTotal.innerText = uniqueProcs.length.toLocaleString('vi-VN');
        
        let elTinh = document.getElementById('stat-captinh');
        if(elTinh) elTinh.innerText = capTinh.toLocaleString('vi-VN');
        
        let elXa = document.getElementById('stat-capxa');
        if(elXa) elXa.innerText = capXa.toLocaleString('vi-VN');
        
        this.changeStatFilter('all');
        // Bật hiển thị và nạp dữ liệu cho Bảng chi tiết
        document.getElementById('advanced-search-dashboard').style.display = 'block';
        this.initTableData(uniqueProcs);
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
        if (!window.appData.fullDatabase || window.appData.fullDatabase.length === 0) {
            this.showToast("⚠️ Không có dữ liệu để xuất!");
            return;
        }

        let uniqueProcs = [];
        let seenMaDVC = new Set();
        window.appData.fullDatabase.forEach(item => {
            let isCongKhai = true;
            let trangThaiKey = Object.keys(item).find(k => {
                let cleanK = k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
                return cleanK.includes('trangthai');
            });
            
            if (trangThaiKey) {
                let val = (item[trangThaiKey] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
                if (!val.includes('congkhai') && !val.includes('cong khai') && !val.includes('chinhthuc') && !val.includes('chinh thuc')) {
                    isCongKhai = false;
                }
            }

            if (isCongKhai) {
                let ma = item['MaDVC'] ? item['MaDVC'].trim() : '';
                if (ma && !seenMaDVC.has(ma)) {
                    seenMaDVC.add(ma);
                    uniqueProcs.push(item);
                }
            }
        });

        let excelData = [];
        let stt = 1;
        let capName = (level === 'tinh') ? 'Cấp tỉnh' : 'Cấp xã';
        let searchKey = (level === 'tinh') ? 'cấp tỉnh' : 'cấp xã';
        let searchKeyNoAccent = (level === 'tinh') ? 'cap tinh' : 'cap xa';

        uniqueProcs.forEach(item => {
            let capKey = Object.keys(item).find(k => {
                let cleanK = k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
                return cleanK.includes('capthuchien');
            });
            let capThucHienStr = capKey ? (item[capKey] || '').toLowerCase() : '';
            
            if (capThucHienStr.includes(searchKey) || capThucHienStr.includes(searchKeyNoAccent)) {
                
                let finalMucDo = 'Chưa cập nhật';
                let isCountedMucDo = false;
                let mucDoKey = Object.keys(item).find(k => {
                    let cleanK = k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
                    return cleanK.includes('mucdo') || cleanK.includes('cungcap') || cleanK.includes('toantrinh') || cleanK.includes('hinhthuc');
                });
                
                if (mucDoKey) {
                    let mucDo = (item[mucDoKey] || '').toLowerCase();
                    if (mucDo.includes('toàn trình') || mucDo.includes('toantrinh') || mucDo === '4') {
                        finalMucDo = 'Toàn trình'; isCountedMucDo = true;
                    } else if (mucDo.includes('một phần') || mucDo.includes('motphan') || mucDo.includes('1 phần') || mucDo === '3') {
                        finalMucDo = 'Một phần'; isCountedMucDo = true;
                    }
                }
                
                if (!isCountedMucDo) {
                    let rowDataStr = JSON.stringify(item).toLowerCase();
                    if (rowDataStr.includes('toàn trình')) finalMucDo = 'Toàn trình';
                    else if (rowDataStr.includes('một phần') || rowDataStr.includes('1 phần')) finalMucDo = 'Một phần';
                }

                // Lấy Lĩnh vực nguyên gốc từ data
                let linhVucKey = Object.keys(item).find(k => {
                    let cleanK = k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
                    return cleanK.includes('linhvuc');
                });
                let linhVucVal = linhVucKey ? (item[linhVucKey] || '') : '';

                // ---------- BỘ LỌC ÉP CHUẨN IN HOA/THƯỜNG ----------
                // Nếu giá trị đang bị in hoa toàn bộ (VD: "LAO ĐỘNG"), chuyển thành "Lao động"
                if (linhVucVal && linhVucVal === linhVucVal.toUpperCase()) {
                    linhVucVal = linhVucVal.charAt(0).toUpperCase() + linhVucVal.slice(1).toLowerCase();
                }
                // ---------------------------------------------------

                let cqcbKey = Object.keys(item).find(k => {
                    let cleanK = k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
                    return cleanK.includes('coquancongbo') || cleanK.includes('cqcb');
                });
                let cqcbVal = cqcbKey ? (item[cqcbKey] || '') : '';

                excelData.push({
                    "STT": stt++,
                    "Mã TTHC": item['MaTTHC'] || '',
                    "Mã DVC": item['MaDVC'] || '',
                    "Tên Thủ tục hành chính": item['TenDVC'] || '',
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
        
        const wscols = [
            {wch: 5},  {wch: 15}, {wch: 15}, {wch: 60}, {wch: 25}, {wch: 35}, {wch: 20}, {wch: 20}
        ];
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "DanhSachDVC");

        let dateStr = new Date().toISOString().slice(0,10).replace(/-/g,"");
        let fileName = `Danh_Sach_DVC_${level.toUpperCase()}_${window.appData.favoriteProvince || 'ToanQuoc'}_${dateStr}.xlsx`;

        XLSX.writeFile(wb, fileName);
        this.showToast(`✅ Đã xuất file Excel ${capName} thành công!`);
    },

    // ==========================================
    // MODULE BẢNG DỮ LIỆU CHI TIẾT TTHC
    // ==========================================
    initTableData(uniqueProcs) {
        // Chuẩn hóa và làm sạch dữ liệu đầu vào
        let mappedData = uniqueProcs.map(item => {
            let lvKey = Object.keys(item).find(k => k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('linhvuc'));
            let linhVuc = lvKey ? (item[lvKey] || '') : '';
            if (linhVuc && linhVuc === linhVuc.toUpperCase()) linhVuc = linhVuc.charAt(0).toUpperCase() + linhVuc.slice(1).toLowerCase();

            let cqcbKey = Object.keys(item).find(k => {
                let clean = k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
                return clean.includes('coquancongbo') || clean.includes('cqcb');
            });
            let cqcb = cqcbKey ? (item[cqcbKey] || '') : '';

            let capKey = Object.keys(item).find(k => k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('capthuchien'));
            let capThucHienStr = capKey ? (item[capKey] || '').toLowerCase() : '';
            let cap = '';
            if (capThucHienStr.includes('cấp xã') || capThucHienStr.includes('cap xa')) cap = 'Xã';
            if (capThucHienStr.includes('cấp tỉnh') || capThucHienStr.includes('cap tinh')) cap = 'Tỉnh'; 

            let finalMucDo = 'Khác';
            let mucDoKey = Object.keys(item).find(k => {
                let clean = k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                return clean.includes('mucdo') || clean.includes('cungcap') || clean.includes('toantrinh');
            });
            if (mucDoKey) {
                let md = (item[mucDoKey] || '').toLowerCase();
                if (md.includes('toàn trình') || md.includes('toantrinh') || md === '4') finalMucDo = 'Toàn trình';
                else if (md.includes('một phần') || md.includes('motphan') || md === '3') finalMucDo = 'Một phần';
            } else {
                let str = JSON.stringify(item).toLowerCase();
                if (str.includes('toàn trình')) finalMucDo = 'Toàn trình';
                else if (str.includes('một phần')) finalMucDo = 'Một phần';
            }

            return {
                maTTHC: item['MaTTHC'] || '',
                tenTTHC: item['TenDVC'] || '',
                linhVuc: linhVuc.trim(),
                cqcb: cqcb.trim(),
                cap: cap,
                mucDo: finalMucDo,
                searchString: this.removeAccents((item['MaTTHC'] || '') + " " + (item['TenDVC'] || '')).toLowerCase()
            };
        });

        this.tableState.data = mappedData;
        
        // SẮP XẾP CƠ QUAN CÔNG BỐ CHUẨN ALPHABET TIẾNG VIỆT
        let dsCqcb = [...new Set(mappedData.map(x => x.cqcb).filter(x => x))].sort((a, b) => a.localeCompare(b, 'vi'));
        let elCqcb = document.getElementById('tk-filter-cqcb');
        if (elCqcb) elCqcb.innerHTML = '<option value="">-- Tất cả --</option>' + dsCqcb.map(cq => `<option value="${cq}">${cq}</option>`).join('');

        // KÍCH HOẠT THUẬT TOÁN ĐỔ LĨNH VỰC ĐỘNG
        this.updateLinhVucDropdown();
        this.filterTableData();
    },

    // XỬ LÝ KHI NGƯỜI DÙNG ĐỔI CƠ QUAN CÔNG BỐ (Giữ nguyên)
    handleCqcbChange() {
        this.updateLinhVucDropdown();
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

        // SẮP XẾP LĨNH VỰC CHUẨN ALPHABET TIẾNG VIỆT
        let sortedLinhVuc = [...validLinhVuc].sort((a, b) => a.localeCompare(b, 'vi'));
        
        let html = '<option value="">-- Tất cả --</option>';
        sortedLinhVuc.forEach(lv => {
            html += `<option value="${lv}">${lv}</option>`;
        });
        
        elLinhVuc.innerHTML = html;

        if (sortedLinhVuc.includes(currentLinhVuc)) {
            elLinhVuc.value = currentLinhVuc;
        } else {
            elLinhVuc.value = "";
        }
    },

    // HÀM RESET LÀM MỚI (Đã vá lỗi để tương thích dropdown động)
    resetTableFilters() {
        document.getElementById('tk-search-input').value = '';
        document.getElementById('tk-filter-cqcb').value = '';
        
        // Phải gọi updateLinhVucDropdown trước để nó sinh lại toàn bộ Lĩnh vực
        this.updateLinhVucDropdown(); 
        
        document.getElementById('tk-filter-linhvuc').value = '';
        document.getElementById('tk-filter-cap').value = '';
        document.getElementById('tk-filter-mucdo').value = '';
        this.filterTableData();
    },

    filterTableData() {
        let keyword = this.removeAccents(document.getElementById('tk-search-input').value.trim()).toLowerCase();
        let fLinhVuc = document.getElementById('tk-filter-linhvuc').value;
        let fCqcb = document.getElementById('tk-filter-cqcb').value;
        let fCap = document.getElementById('tk-filter-cap').value;
        let fMucDo = document.getElementById('tk-filter-mucdo').value;

        // Chạy qua màng lọc đa tầng
        this.tableState.filtered = this.tableState.data.filter(item => {
            if (keyword && !item.searchString.includes(keyword)) return false;
            if (fLinhVuc && item.linhVuc !== fLinhVuc) return false;
            if (fCqcb && item.cqcb !== fCqcb) return false;
            if (fCap && item.cap !== fCap) return false;
            if (fMucDo && item.mucDo !== fMucDo) return false;
            return true;
        });

        this.tableState.currentPage = 1;
        this.renderTable();
    },

    resetTableFilters() {
        document.getElementById('tk-search-input').value = '';
        document.getElementById('tk-filter-linhvuc').value = '';
        document.getElementById('tk-filter-cqcb').value = '';
        document.getElementById('tk-filter-cap').value = '';
        document.getElementById('tk-filter-mucdo').value = '';
        this.filterTableData();
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
            // Render Label Mức độ & Cấp
            let badgeMucDo = item.mucDo === 'Toàn trình' ? `<span class="badge badge-tt">Toàn trình</span>` : (item.mucDo === 'Một phần' ? `<span class="badge badge-mp">Một phần</span>` : item.mucDo);
            let badgeCap = item.cap === 'Tỉnh' ? `<span class="badge badge-tinh">Cấp Tỉnh</span>` : `<span class="badge badge-xa">Cấp Xã</span>`;
            
            html += `
                <tr>
                    <td style="text-align: center; font-weight: 600; color: #94a3b8;">${startIndex + index + 1}</td>
                    <td style="font-family: monospace; font-size: 14px; font-weight: 600; color: var(--primary-color);">${item.maTTHC}</td>
                    <td style="white-space: normal; line-height: 1.5; font-weight: 500;">${item.tenTTHC}</td>
                    <td>${item.linhVuc}</td>
                    <td style="white-space: normal; line-height: 1.4;">${item.cqcb}</td>
                    <td style="text-align: center;">${item.cap ? badgeCap : ''}</td>
                    <td style="text-align: center;">${badgeMucDo}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        this.updatePaginationUI(startIndex + 1, endIndex, data.length);
    },

    updatePaginationUI(start, end, total) {
        document.getElementById('tk-table-info').innerText = `Đang hiển thị ${start} đến ${end} của ${total.toLocaleString('vi-VN')} thủ tục`;
        
        let paginationEl = document.getElementById('tk-table-pagination');
        let totalPages = Math.ceil(total / this.tableState.rowsPerPage);
        let curr = this.tableState.currentPage;
        
        if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }

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
        
        paginationEl.innerHTML = html;
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
        let excelData = data.map((item, index) => ({
            "STT": index + 1,
            "Mã TTHC": item.maTTHC,
            "Tên Thủ tục hành chính": item.tenTTHC,
            "Lĩnh vực": item.linhVuc,
            "Cơ quan công bố": item.cqcb,
            "Cấp thực hiện": item.cap ? `Cấp ${item.cap}` : '',
            "Mức độ cung cấp": item.mucDo
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        
        // Chỉnh độ rộng các cột cho đẹp mắt
        const wscols = [
            {wch: 5},   // STT
            {wch: 15},  // Mã
            {wch: 60},  // Tên
            {wch: 25},  // Lĩnh vực
            {wch: 35},  // CQCB
            {wch: 15},  // Cấp
            {wch: 20}   // Mức độ
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
        };
    }
};

window.onload = () => app.init();