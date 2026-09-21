// =========================================
// FILE: js/niemyet.js
// Logic xử lý Kiosk Niêm yết (Đã tích hợp Workflow Nộp hồ sơ Đa nhánh & Giao diện Lưới Lĩnh Vực)
// =========================================

const NyApp = {
    nyData: [],
    nyFilteredData: [],
    idleTimer: null,
    detailDataCache: {},
    tableState: { currentPage: 1, rowsPerPage: 50 },
    searchTimeout: null,
    currentAgencies: [],
    currentLinkNop: '',
    nySelectedFields: (() => { try { return JSON.parse(localStorage.getItem('nySelectedFields')) || null; } catch(e) { return null; } })(),
    nyDeliveryManifest: null,
    nyDeliveryCatalog: null,
    nyDeliveryProvince: null,
    nyUseDeliveryData: false,
    nyExecutionShardCache: new Map(),

    // 1. CÁC HÀM TIỆN ÍCH
    removeAccents(str) {
        if (!str) return '';
        return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    },
    escapeHtml(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    },
    getFileIcon(fileName) {
        let ext = (fileName || '').split('.').pop().toLowerCase();
        if (['doc', 'docx'].includes(ext)) return '<i class="fa-solid fa-file-word" style="color: #2563eb; margin-right: 8px;"></i>';
        if (['xls', 'xlsx'].includes(ext)) return '<i class="fa-solid fa-file-excel" style="color: #16a34a; margin-right: 8px;"></i>';
        if (ext === 'pdf') return '<i class="fa-solid fa-file-pdf" style="color: #dc2626; margin-right: 8px;"></i>';
        return '<i class="fa-solid fa-file-lines" style="color: #64748b; margin-right: 8px;"></i>';
    },

    getDeliveryProvinceMeta(provinceName) {
        let key = this.removeAccents(provinceName || '')
            .toLowerCase()
            .replace(/^\s*(tinh|thanh pho|tp\.?)[\s.:_-]*/i, '')
            .replace(/\s+/g, ' ')
            .trim();

        const provinces = {
            'ha noi': ['01', 'ha-noi'],
            'cao bang': ['04', 'cao-bang'],
            'tuyen quang': ['08', 'tuyen-quang'],
            'dien bien': ['11', 'dien-bien'],
            'lai chau': ['12', 'lai-chau'],
            'son la': ['14', 'son-la'],
            'lao cai': ['15', 'lao-cai'],
            'thai nguyen': ['19', 'thai-nguyen'],
            'lang son': ['20', 'lang-son'],
            'quang ninh': ['22', 'quang-ninh'],
            'bac ninh': ['24', 'bac-ninh'],
            'phu tho': ['25', 'phu-tho'],
            'hai phong': ['31', 'hai-phong'],
            'hung yen': ['33', 'hung-yen'],
            'ninh binh': ['37', 'ninh-binh'],
            'thanh hoa': ['38', 'thanh-hoa'],
            'nghe an': ['40', 'nghe-an'],
            'ha tinh': ['42', 'ha-tinh'],
            'quang tri': ['44', 'quang-tri'],
            'hue': ['46', 'hue'],
            'da nang': ['48', 'da-nang'],
            'quang ngai': ['51', 'quang-ngai'],
            'gia lai': ['52', 'gia-lai'],
            'khanh hoa': ['56', 'khanh-hoa'],
            'dak lak': ['66', 'dak-lak'],
            'lam dong': ['68', 'lam-dong'],
            'dong nai': ['75', 'dong-nai'],
            'ho chi minh': ['79', 'ho-chi-minh'],
            'tay ninh': ['80', 'tay-ninh'],
            'dong thap': ['82', 'dong-thap'],
            'vinh long': ['86', 'vinh-long'],
            'an giang': ['91', 'an-giang'],
            'can tho': ['92', 'can-tho'],
            'ca mau': ['96', 'ca-mau']
        };

        const meta = provinces[key];
        if (!meta) return null;
        return { code: meta[0], slug: meta[1], key };
    },

    getDeliveryBaseUrl(provinceName) {
        const meta = this.getDeliveryProvinceMeta(provinceName);
        if (!meta) return null;
        return `https://raw.githubusercontent.com/ChippedTopaz/am-sieu-toc-data/niemyet-data/province-configs/${meta.code}-${meta.slug}`;
    },

    async loadDeliveryCatalog(provinceName) {
        const meta = this.getDeliveryProvinceMeta(provinceName);
        const baseUrl = this.getDeliveryBaseUrl(provinceName);
        if (!meta || !baseUrl) throw new Error(`Chưa cấu hình dữ liệu tối ưu cho ${provinceName}`);

        // Manifest rất nhỏ: dùng làm version key để catalog/shard được cache đúng phiên bản.
        const manifestRes = await fetch(`${baseUrl}/manifest.json`, { cache: 'no-store' });
        if (!manifestRes.ok) throw new Error(`Không tải được manifest ${provinceName} (HTTP ${manifestRes.status})`);
        const manifest = await manifestRes.json();

        const version = encodeURIComponent(manifest.version || manifest.builtAt || 'latest');
        const catalogRes = await fetch(`${baseUrl}/catalog.json?v=${version}`);
        if (!catalogRes.ok) throw new Error(`Không tải được catalog ${provinceName} (HTTP ${catalogRes.status})`);
        const catalog = await catalogRes.json();

        if (!catalog || !Array.isArray(catalog.items)) {
            throw new Error(`Catalog ${provinceName} không đúng cấu trúc dữ liệu.`);
        }

        this.nyDeliveryProvince = { ...meta, name: provinceName, baseUrl };
        this.nyDeliveryManifest = manifest;
        this.nyDeliveryCatalog = catalog;
        this.nyExecutionShardCache.clear();
        this.nyUseDeliveryData = true;
    },

    async loadDeliveryExecutionRows(maTTHC) {
        const catalogItem = (this.nyDeliveryCatalog?.items || []).find(item => item.ma === maTTHC);
        if (!catalogItem || !catalogItem.hasExecution || !catalogItem.shard) return [];

        const shardKey = catalogItem.shard;
        let shardData = this.nyExecutionShardCache.get(shardKey);

        if (!shardData) {
            const baseUrl = this.nyDeliveryProvince?.baseUrl;
            if (!baseUrl) return [];
            const version = encodeURIComponent(this.nyDeliveryManifest?.version || 'latest');
            const shardRes = await fetch(`${baseUrl}/execution/${shardKey}.json?v=${version}`);
            if (!shardRes.ok) throw new Error(`Không tải được dữ liệu nộp hồ sơ (HTTP ${shardRes.status})`);
            shardData = await shardRes.json();
            this.nyExecutionShardCache.set(shardKey, shardData);
        }

        const proc = shardData?.procedures?.[maTTHC];
        if (!proc || !Array.isArray(proc.dvc)) return [];

        // Chuyển schema delivery về shape cũ để giữ nguyên toàn bộ logic nghiệp vụ phía dưới:
        // nhiều MaDVC -> chọn DVC -> chọn/tự nhận cơ quan -> generateASTFinalUrl.
        const rows = [];
        proc.dvc.forEach(dvc => {
            (dvc.r || []).forEach(row => {
                rows.push({
                    MaTTHC: maTTHC,
                    MaDVC: dvc.d || '',
                    TenDVC: dvc.n || 'Dịch vụ công trực tuyến',
                    TenCQTH: row.a || '',
                    MaCQTH: row.c || '',
                    MucDo: row.m || '',
                    'Trạng thái': row.s || '',
                    LoaiHeThong: row.t || '',
                    'Citizen URL': row.u || ''
                });
            });
        });

        return rows;
    },

    showLoading(msg) {
        let el = document.getElementById('ny-loading');
        if (el) {
            el.style.display = 'flex';
            el.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin fa-3x" style="color: #D2232A; margin-bottom: 20px;"></i>
                <h2 style="color: #D2232A; text-align: center;">${msg}</h2>
                <p style="color: #64748b; text-align: center;">Vui lòng đợi trong giây lát...</p>
                <button onclick="localStorage.removeItem('dvc_v2_cache'); window.location.reload();" style="margin-top: 40px; padding: 12px 25px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); transition: 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'">
                    <i class="fa-solid fa-rotate"></i> LÀM MỚI HỆ THỐNG
                </button>
            `;
        }
    },

    showError(msg) {
        let el = document.getElementById('ny-loading');
        if (el) {
            el.style.display = 'flex';
            el.innerHTML = `<i class="fa-solid fa-triangle-exclamation fa-3x" style="color: #dc2626; margin-bottom: 20px;"></i><h2 style="color: #dc2626;">LỖI TẢI DỮ LIỆU</h2><p style="color: #64748b; font-size: 16px;">${msg}</p><button onclick="window.location.reload()" style="margin-top: 15px; padding: 10px 25px; background: #D2232A; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">Tải lại trang</button>`;
        }
    },

    // =======================================================
    // HÀM MỚI: TẢI CẤU HÌNH TỪ GITHUB THEO ID TRÊN URL
    // =======================================================
    async fetchConfigFromCloud(configId) {
        try {
            // Trỏ vào nhánh 'data' và thư mục 'kiosk'
            let rawUrl = `https://raw.githubusercontent.com/ChippedTopaz/am-sieu-toc-data/niemyet/kiosk/${configId}.json?t=${new Date().getTime()}`;
            let res = await fetch(rawUrl);
            
            if (!res.ok) throw new Error("Không tìm thấy file cấu hình JSON của mã: " + configId);
            let data = await res.json();
            
            // Ghi đè cấu hình mới tải về vào thẳng bộ nhớ cục bộ (localStorage)
            localStorage.setItem('nyAgencyName_V2', data.kioskName || '');
            localStorage.setItem('nyAddress_V2', data.kioskAddress || '');
            localStorage.setItem('nyPhone_V2', data.kioskPhone || '');
            localStorage.setItem('nyTime_V2', data.kioskTime || '');
            
            // SỬA LỖI TẠI ĐÂY: Ép buộc lấy Tỉnh và Cấp thực hiện từ JSON để ghi đè, xóa sổ tàn dư cũ
            localStorage.setItem('nyProvinceName_V2', data.kioskProvince || 'Phú Thọ'); 
            localStorage.setItem('nyLevel_V2', data.kioskLevel || 'all');
            // --- THÊM DÒNG NÀY ĐỂ LƯU LẠI CƠ QUAN MẶC ĐỊNH TỪ JSON ---
            localStorage.setItem('nyDefaultAgency_V2', data.kioskDefaultAgency || '');
            
            // Xử lý danh sách Lĩnh vực
            if (data.fields && Array.isArray(data.fields)) {
                this.nySelectedFields = data.fields;
                localStorage.setItem('nySelectedFields', JSON.stringify(data.fields));
            } else {
                // Nếu JSON không có lĩnh vực nào, xóa sạch lĩnh vực cũ trong máy
                this.nySelectedFields = null;
                localStorage.removeItem('nySelectedFields');
            }
            console.log(`✅ Đã nạp cấu hình Cloud [${configId}] thành công từ thư mục kiosk! Tỉnh: ${data.kioskProvince}`);
        } catch (e) {
            console.error("Lỗi đồng bộ cấu hình từ Cloud:", e);
            alert(`Lỗi tải cấu hình tự động (${configId}):\n${e.message}\n\nHệ thống sẽ sử dụng cấu hình lưu cũ trên máy (nếu có).`);
        }
    },

    // 2. KHỞI TẠO KIOSK
    async init() {
        if (!window.appData) window.appData = {};
        
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                this.resetKioskUI();
            }
        });

        try {
            this.showLoading("ĐANG KIỂM TRA HỆ THỐNG...");
            
            // =======================================================
            // [THUẬT TOÁN MỚI] BẮT ID TỪ URL VÀ TẢI CẤU HÌNH CLOUD
            // =======================================================
            let urlParams = new URLSearchParams(window.location.search);
            let configId = urlParams.get('id');
            
            if (configId) {
                this.showLoading(`ĐANG ĐỒNG BỘ CẤU HÌNH CLOUD CHO KIOSK: ${configId.toUpperCase()}...`);
                await this.fetchConfigFromCloud(configId);
                
                // Làm sạch URL: Xóa biến "?id=..." trên thanh địa chỉ để nhìn chuyên nghiệp
                //window.history.replaceState({}, document.title, window.location.pathname);
            }
            // =======================================================

            if (typeof DataLoader !== 'undefined') {
                // Tỉnh đã có delivery data: chỉ nạp cấu hình dùng chung, không tải CSV tỉnh ở initData().
                // Nếu delivery chưa tồn tại hoặc lỗi, phần dưới sẽ tự fallback về luồng cũ.
                let configuredProvince = localStorage.getItem('nyProvinceName_V2') || '';
                let timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Kết nối máy chủ quá hạn.<br>Vui lòng bấm tổ hợp phím <b>Ctrl + F5</b> trên bàn phím để tải lại hệ thống!")), 15000));
                let initPromise = this.getDeliveryProvinceMeta(configuredProvince) && typeof DataLoader.loadMasterConfig === 'function'
                    ? DataLoader.loadMasterConfig()
                    : DataLoader.initData(false);
                await Promise.race([initPromise, timeoutPromise]);
            } else {
                throw new Error("Không tìm thấy file data-loader.js");
            }
            
            let agencyName = localStorage.getItem('nyAgencyName_V2');
            let provName = localStorage.getItem('nyProvinceName_V2');
            
            if (!agencyName || !provName) {
                document.getElementById('ny-loading').style.display = 'none';
                this.openNySetup();
                return;
            }

            document.getElementById('ny-display-agency').innerText = agencyName;
            
            // Bơm tên cơ quan xuống Footer
            let footerAgency = document.getElementById('ny-footer-agency');
            if (footerAgency) footerAgency.innerHTML = `<i class="fa-solid fa-building-flag" style="margin-right: 6px;"></i> ${agencyName}`;
            
            // Bơm 3 thông tin liên hệ xuống Footer
            let fAddr = document.getElementById('ny-footer-address');
            let sAddr = localStorage.getItem('nyAddress_V2');
            if (fAddr) fAddr.innerText = (sAddr && sAddr.trim() !== '') ? sAddr : 'Chưa cập nhật';
            
            let fPhone = document.getElementById('ny-footer-phone');
            let sPhone = localStorage.getItem('nyPhone_V2');
            if (fPhone) fPhone.innerText = (sPhone && sPhone.trim() !== '') ? sPhone : 'Chưa cập nhật';
            
            let fTime = document.getElementById('ny-footer-time');
            let sTime = localStorage.getItem('nyTime_V2');
            if (fTime) fTime.innerText = (sTime && sTime.trim() !== '') ? sTime : 'Sáng: 07h30 - 11h30 | Chiều: 13h00 - 17h00';

            window.appData.favoriteProvince = provName;

            this.showLoading(`ĐANG TẢI DỮ LIỆU NIÊM YẾT CỦA ${provName.toUpperCase()}...`);
            
            // Timeout 15 giây (15000)
            let timeoutData = new Promise((_, reject) => setTimeout(() => reject(new Error("Tải dữ liệu quá hạn.<br>Vui lòng bấm tổ hợp phím <b>Ctrl + F5</b> trên bàn phím để tải lại hệ thống!")), 15000));

            const deliveryMeta = this.getDeliveryProvinceMeta(provName);
            if (deliveryMeta) {
                // Ưu tiên dữ liệu delivery tối ưu. Nếu tỉnh chưa build/không tải được thì tự rơi về luồng cũ.
                try {
                    await Promise.race([this.loadDeliveryCatalog(provName), timeoutData]);
                } catch (deliveryError) {
                    console.warn(`Không dùng được dữ liệu delivery của ${provName}, chuyển sang luồng cũ:`, deliveryError);
                    this.nyUseDeliveryData = false;
                    this.nyDeliveryManifest = null;
                    this.nyDeliveryCatalog = null;
                    this.nyDeliveryProvince = null;
                    await Promise.race([
                        Promise.all([DataLoader.loadProvinceData(), DataLoader.loadMasterData()]),
                        timeoutData
                    ]);
                }
            } else {
                await Promise.race([
                    Promise.all([DataLoader.loadProvinceData(), DataLoader.loadMasterData()]),
                    timeoutData
                ]);
            }

            this.processAndRenderData();

        } catch (e) {
            console.error(e);
            this.showError(e.message);
        }

        document.body.addEventListener('click', () => this.resetNyIdleTimer());
        document.body.addEventListener('input', () => this.resetNyIdleTimer());
        this.resetNyIdleTimer();
    },

    updateClock() {
        let now = new Date();
        let clockEl = document.getElementById('ny-clock');
        if (clockEl) clockEl.innerText = now.toLocaleTimeString('vi-VN', { hour12: false });
    },

    resetNyIdleTimer() {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => { this.resetKioskUI(); }, 60000); 
    },

    // 3. CẤU HÌNH KIOSK
    openNySetup() {
        let ag = localStorage.getItem('nyAgencyName_V2');
        let pr = localStorage.getItem('nyProvinceName_V2');
        let lv = localStorage.getItem('nyLevel_V2') || 'all';
        
        let addr = localStorage.getItem('nyAddress_V2') || '';
        let phone = localStorage.getItem('nyPhone_V2') || '';
        let time = localStorage.getItem('nyTime_V2') || '';
        
        let agInput = document.getElementById('ny-agency-input');
        if (agInput && ag) agInput.value = ag;
        
        let addrInput = document.getElementById('ny-address-input');
        if (addrInput) addrInput.value = addr;
        
        let phoneInput = document.getElementById('ny-phone-input');
        if (phoneInput) phoneInput.value = phone;
        
        let timeInput = document.getElementById('ny-time-input');
        if (timeInput) timeInput.value = time;
        
        let lvSelect = document.getElementById('ny-level-select');
        if (lvSelect) lvSelect.value = lv;
        
        let selectEl = document.getElementById('ny-province-select');
        if (selectEl && window.appData.danhSachTinh) {
            let sortedProv = window.appData.danhSachTinh.map(p => p.TenTinh).sort((a,b) => a.localeCompare(b, 'vi'));
            let html = '<option value="">-- Click để chọn Tỉnh/Thành phố --</option>';
            sortedProv.forEach(p => { html += `<option value="${p}" ${p === pr ? 'selected' : ''}>${p}</option>`; });
            selectEl.innerHTML = html;
        }
        document.getElementById('nySetupModal').classList.add('active');
    },

    async saveNySetup() {
        let agInput = document.getElementById('ny-agency-input');
        let provSelect = document.getElementById('ny-province-select');
        let lvSelect = document.getElementById('ny-level-select');
        
        let addrInput = document.getElementById('ny-address-input');
        let phoneInput = document.getElementById('ny-phone-input');
        let timeInput = document.getElementById('ny-time-input');

        let ag = agInput ? agInput.value.trim() : '';
        let pr = provSelect ? provSelect.value : ''; 
        let lv = lvSelect ? lvSelect.value : 'all'; 
        
        let addr = addrInput ? addrInput.value.trim() : '';
        let phone = phoneInput ? phoneInput.value.trim() : '';
        let time = timeInput ? timeInput.value.trim() : '';
        
        if (!ag || !pr) { alert("Vui lòng nhập tên Trung tâm và chọn Nguồn dữ liệu Tỉnh/TP!"); return; }
        
        localStorage.setItem('nyAgencyName_V2', ag);
        localStorage.setItem('nyProvinceName_V2', pr);
        localStorage.setItem('nyLevel_V2', lv);
        
        localStorage.setItem('nyAddress_V2', addr);
        localStorage.setItem('nyPhone_V2', phone);
        localStorage.setItem('nyTime_V2', time);
        
        document.getElementById('nySetupModal').classList.remove('active');
        this.showLoading("ĐANG LƯU CẤU HÌNH...");
        window.location.reload(); 
    },

    // HÀM TẢI SHEET CẤU HÌNH URL TỪ GOOGLE SHEETS
    async loadCauHinhURL() {
        if (!this.linkCauHinhURL || !this.linkCauHinhURL.startsWith('http')) return;
        return new Promise((resolve) => {
            Papa.parse(this.linkCauHinhURL, {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    window.appData.CauHinhURL = results.data;
                    resolve();
                },
                error: (err) => {
                    console.error("Lỗi tải CauHinhURL:", err);
                    resolve();
                }
            });
        });
    },

    // 4. XỬ LÝ DỮ LIỆU TỪ JSON GITHUB
    processAndRenderData() {
        let masterData = window.appData.masterDatabase || [];
        let provData = window.appData.fullDatabase || [];
        
        let currentProvName = localStorage.getItem('nyProvinceName_V2') || "";
        let currentProvClean = this.removeAccents(currentProvName).toLowerCase().replace(/tỉnh |thành phố /g, '').trim();
        let targetLevel = localStorage.getItem('nyLevel_V2') || 'all';

        // Dữ liệu delivery đã được builder lọc theo tỉnh; frontend chỉ còn lọc cấp thực hiện theo cấu hình kiosk.
        if (this.nyUseDeliveryData && this.nyDeliveryCatalog?.items) {
            let rawNyData = [];

            this.nyDeliveryCatalog.items.forEach(item => {
                if (!item || !item.ma) return;

                let capThucHienStr = (item.cap || '').toString().toLowerCase();
                let capArr = [];
                if (capThucHienStr.includes('cấp bộ') || capThucHienStr.includes('ngang bộ')) capArr.push('Bộ');
                if (capThucHienStr.includes('tỉnh') || capThucHienStr.includes('thành phố trực thuộc')) capArr.push('Tỉnh');
                if (capThucHienStr.includes('xã') || capThucHienStr.includes('phường')) capArr.push('Xã');

                if (targetLevel === 'tinh' && !capArr.includes('Tỉnh')) return;
                if (targetLevel === 'xa' && !capArr.includes('Xã')) return;
                if (targetLevel === 'tinh_xa' && !capArr.includes('Tỉnh') && !capArr.includes('Xã')) return;

                let linhVuc = (item.lv || 'KHÁC').toString().trim();
                if (linhVuc) linhVuc = linhVuc.charAt(0).toUpperCase() + linhVuc.slice(1).toLowerCase();

                rawNyData.push({
                    id: item.id || '',
                    ma: item.ma,
                    ten: item.ten || '',
                    lv: linhVuc || 'KHÁC',
                    cqcb: item.cqcb || 'Chưa xác định',
                    searchStr: this.removeAccents((item.ma + " " + (item.ten || ''))).toLowerCase(),
                    linkNop: null,
                    hasExecution: item.hasExecution === true,
                    shard: item.shard || null
                });
            });

            this.nyData = rawNyData;

            let loadingEl = document.getElementById('ny-loading');
            if (loadingEl) loadingEl.style.display = 'none';

            this.renderLinhVucGrid();
            this.filterNyData();
            return;
        }

        let linkMap = new Map();
        let cleanKey = (k) => k.toLowerCase().replace(/[_-\s]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
        provData.forEach(item => {
            if (!item) return;
            let maKey = Object.keys(item).find(k => cleanKey(k).includes('matthc') || cleanKey(k).includes('madvc'));
            let maVal = maKey ? (item[maKey] || '').toString().trim() : '';
            if(!maVal) return;
            let linkKey = Object.keys(item).find(k => cleanKey(k).includes('linknop') || cleanKey(k).includes('url') || cleanKey(k) === 'link');
            if (linkKey && item[linkKey]) linkMap.set(maVal, item[linkKey]);
        });

        let rawNyData = [];
        let uniqueMap = new Map(); 

        masterData.forEach(item => {
            if (!item || typeof item !== 'object') return;

            let maTTHC = (item.ma_tthc || item.code || '').toString().trim();
            if (uniqueMap.has(maTTHC)) return; 
            
            let id = (item.id || '').toString().trim();
            let tenTTHC = (item.ten_tthc || item.name || '').toString().trim();
            
            // ĐỌC LĨNH VỰC THÔNG MINH HƠN (Hỗ trợ cấu trúc mới của Bộ Tài chính)
            let linhVuc = item.linh_vuc || item.linhVuc || '';
            if (!linhVuc && item.categoriesDetails && item.categoriesDetails.length > 0) {
                linhVuc = item.categoriesDetails[0].name;
            } else if (!linhVuc && item.category && item.category.name) {
                linhVuc = item.category.name;
            }
            linhVuc = linhVuc.toString().trim();

            // ĐỌC CƠ QUAN CÔNG BỐ
            let cqcb = (item.co_quan_cong_bo || item.departmentPromulgateName || '').toString().trim();
            
            let capThucHienStr = (item.cap_thuc_hien || item.capThucHien || '').toString().toLowerCase();
            let capArr = []; 
            if (capThucHienStr.includes('cấp bộ') || capThucHienStr.includes('ngang bộ') || item.isMinistry) capArr.push('Bộ');
            if (capThucHienStr.includes('tỉnh') || capThucHienStr.includes('thành phố trực thuộc') || item.isProvince) capArr.push('Tỉnh'); 
            if (capThucHienStr.includes('xã') || capThucHienStr.includes('phường') || item.isWard) capArr.push('Xã');
            
            // --- GỠ BỎ HOÀN TOÀN CHỐT CHẶN NGÀNH DỌC (isVertical) TẠI KIOSK ---
            let cqcbClean = this.removeAccents(cqcb).toLowerCase();
            let isCurrentProv = currentProvClean !== "" && cqcbClean.includes(currentProvClean);
            let isOtherProv = !isCurrentProv && (cqcbClean.includes('ubnd') || cqcbClean.includes('uy ban nhan dan') || cqcbClean.includes('tinh ') || cqcbClean.includes('thanh pho '));
            
            // Chỉ chặn thủ tục của các Tỉnh/Thành phố khác. Các thủ tục của Bộ (dù bị gán cờ Ngành dọc) vẫn được cho qua!
            if (isOtherProv) return; 

            // --- LỌC THEO CẤU HÌNH ADMIN ---
            if (targetLevel === 'tinh' && !capArr.includes('Tỉnh')) return;
            if (targetLevel === 'xa' && !capArr.includes('Xã')) return;
            if (targetLevel === 'tinh_xa' && !capArr.includes('Tỉnh') && !capArr.includes('Xã')) return;

            if (linhVuc) linhVuc = linhVuc.charAt(0).toUpperCase() + linhVuc.slice(1).toLowerCase();

            rawNyData.push({
                id: id, 
                ma: maTTHC, ten: tenTTHC, lv: linhVuc || 'KHÁC', cqcb: cqcb || 'Chưa xác định',
                searchStr: this.removeAccents((maTTHC + " " + tenTTHC)).toLowerCase(),
                linkNop: linkMap.get(maTTHC) || null 
            });
            uniqueMap.set(maTTHC, true);
        });

        this.nyData = rawNyData;

        let loadingEl = document.getElementById('ny-loading');
        if (loadingEl) loadingEl.style.display = 'none';

        this.renderLinhVucGrid();
        
        this.filterNyData();
    },

    // =======================================================
    // 1. CHỈ HUY TRUNG TÂM: LỌC & TÌM KIẾM TOÀN CỤC KIOSK
    // =======================================================
    // BIẾN LƯU TRỮ LĨNH VỰC ĐANG CHỌN (Nằm ngầm trong bộ nhớ thay vì dựa vào thẻ HTML)
    activeNyLinhVuc: '',

    filterNyData() {
        this.handleSearch();
    },

    handleSearch() {
        let searchBox = document.getElementById('ny-search-box');
        let keyword = (searchBox && searchBox.value) ? searchBox.value.trim() : '';
        let lv = this.activeNyLinhVuc || '';

        let tableView = document.getElementById('ny-table-view');
        let contentArea = document.getElementById('ny-content-area');
        let gridView = document.getElementById('ny-grid-view');
        let btnBack = document.getElementById('ny-btn-back');

        // NẾU RỖNG: Trở về màn hình chính (Trang chủ thẻ đỏ)
        if (keyword === '' && lv === '') {
            if (tableView) tableView.style.display = 'none';
            if (contentArea) contentArea.innerHTML = ''; // Xóa rác bảng cũ
            
            if (gridView) gridView.style.display = 'block';
            if (btnBack) btnBack.style.display = 'none';
            return;
        }

        // NẾU CÓ TÌM KIẾM HOẶC CLICK LĨNH VỰC: Ẩn thẻ đỏ, Hiện vỏ bọc bảng
        if (gridView) gridView.style.display = 'none';
        if (btnBack) btnBack.style.display = 'inline-flex';
        if (tableView) tableView.style.display = 'block';

        let removeAccents = (str) => {
            if (!str) return '';
            return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
        };
        let keywordNoAccent = removeAccents(keyword).toLowerCase();

        this.nyFilteredData = this.nyData.filter(item => {
            if (keywordNoAccent) {
                let searchString = removeAccents((item.ma || '') + " " + (item.ten || '')).toLowerCase();
                if (!searchString.includes(keywordNoAccent)) return false;
            } else if (lv && item.lv !== lv) {
                return false;
            }
            return true;
        });

        this.tableState.currentPage = 1;
        if (typeof this.renderNyTable === 'function') {
            this.renderNyTable();
        }
    },

    renderNyTable() {
        let container = document.getElementById('ny-content-area');
        if (!container) return;

        let data = this.nyFilteredData;
        if (data.length === 0) {
            container.innerHTML = '<div style="padding: 40px; text-align: center; color: #64748b; font-size: 16px;">Không tìm thấy thủ tục hành chính nào!</div>';
            return;
        }

        let limit = this.tableState.rowsPerPage;
        let start = (this.tableState.currentPage - 1) * limit;
        let end = Math.min(start + limit, data.length);
        let pageData = data.slice(start, end);

        let grouped = {};
        pageData.forEach(item => {
            if (!grouped[item.lv]) grouped[item.lv] = [];
            grouped[item.lv].push(item);
        });

        let html = '';
        Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'vi')).forEach(linhVuc => {
            html += `<div class="ny-group-header"><i class="fa-solid fa-folder-open"></i> LĨNH VỰC: ${linhVuc}</div>`;
            
            // Thu hẹp cột cuối từ 220px xuống 140px vì giờ chỉ còn 1 nút Nộp hồ sơ
            html += `<table class="ny-table"><colgroup><col width="60px"><col width="auto"><col width="140px"></colgroup><tbody>`;
            
            grouped[linhVuc].forEach((proc) => {
                
                // ĐÃ XÓA btnXem
                
                // Thêm event.stopPropagation() để bấm Nộp hồ sơ không bị mở lẫn Popup chi tiết
                let btnNop = `<button class="ny-action-btn ny-action-nop" onclick="event.stopPropagation(); NyApp.handleSubmission('${proc.ma}')"><i class="fa-solid fa-paper-plane"></i> Nộp hồ sơ</button>`;

                let sttThuTuc = start + data.indexOf(proc) + 1; 

                // BIẾN TOÀN BỘ DÒNG TR THÀNH NÚT BẤM
                html += `<tr onclick="NyApp.openProcedureDetail('${proc.id}')" style="cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                            <td style="text-align:center; font-weight:bold; color: #94a3b8; font-size: 16px;">${sttThuTuc}</td>
                            <td>
                                <div class="ny-proc-title" style="font-size: 16px; margin-bottom: 8px;">${proc.ten}</div>
                                <div class="ny-proc-meta" style="font-size: 14px;"><i class="fa-solid fa-barcode"></i> Mã TTHC: <span style="color: #D2232A;">${proc.ma}</span> | <i class="fa-solid fa-building"></i> ${proc.cqcb}</div>
                            </td>
                            <td style="text-align: right;">${btnNop}</td>
                        </tr>`;
            });
            html += `</tbody></table>`;
        });

        let totalPages = Math.ceil(data.length / limit);
        if (totalPages > 1) {
            html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 25px; padding: 15px; background: #fff; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 14px; color: #64748b; font-weight: 600;">Hiển thị ${start + 1} - ${end} / ${data.length} thủ tục</div>
                        <div style="display: flex; gap: 8px;">`;
            
            let curr = this.tableState.currentPage;
            html += `<button class="page-btn" ${curr === 1 ? 'disabled' : ''} onclick="NyApp.changeTablePage(${curr - 1})" style="padding: 8px 15px; border-radius: 6px; cursor: pointer; border: 1px solid #cbd5e1; background: #fff; font-weight: bold; font-size: 14px;"><i class="fa-solid fa-chevron-left"></i> Trước</button>`;
            
            let startPage = Math.max(1, curr - 2);
            let endPage = Math.min(totalPages, startPage + 4);
            if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
            
            for (let i = startPage; i <= endPage; i++) {
                let activeStyle = i === curr ? 'background: #D2232A; color: white; border-color: #D2232A;' : 'background: #fff; color: #475569; border: 1px solid #cbd5e1;';
                html += `<button class="page-btn" onclick="NyApp.changeTablePage(${i})" style="padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px; ${activeStyle}">${i}</button>`;
            }
            
            html += `<button class="page-btn" ${curr === totalPages ? 'disabled' : ''} onclick="NyApp.changeTablePage(${curr + 1})" style="padding: 8px 15px; border-radius: 6px; cursor: pointer; border: 1px solid #cbd5e1; background: #fff; font-weight: bold; font-size: 14px;">Sau <i class="fa-solid fa-chevron-right"></i></button>`;
            html += `</div></div>`;
        }
        container.innerHTML = html;
    },

    changeTablePage(page) {
        let totalPages = Math.ceil(this.nyFilteredData.length / this.tableState.rowsPerPage);
        if (page >= 1 && page <= totalPages) {
            this.tableState.currentPage = page;
            this.renderNyTable();
            window.scrollTo({ top: 150, behavior: 'smooth' }); 
        }
    },

    // 5. CHI TIẾT TTHC
    async openProcedureDetail(id) {
        if (!id) return;
        let elModal = document.getElementById('procedureDetailModal');
        if (elModal) elModal.style.display = 'flex';
        
        let contentEl = document.getElementById('detail-tab-content');
        if (contentEl) contentEl.innerHTML = '<div style="text-align:center; padding: 50px; color: #D2232A;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><div style="margin-top: 15px; font-weight: 600;">Đang tải chi tiết cấu trúc từ CSDL Quốc gia...</div></div>';

        try {
            let res = await fetch(`https://cdn.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/details/${id}.json`);
            if (!res.ok) throw new Error("Dữ liệu không tồn tại");
            let detailData = await res.json();

            let safeGet = (val, defaultVal = 'Không có dữ liệu') => {
                if (val === null || val === undefined || val === '') return defaultVal;
                if (Array.isArray(val) && val.length === 0) return defaultVal;
                return val;
            };

            let safeSet = (elId, val, defaultText = 'Không có dữ liệu') => {
                let el = document.getElementById(elId);
                if (el) el.innerHTML = (val && val !== 'null') ? val : defaultText;
            };

            let maTTHC = safeGet(detailData.code);
            safeSet('detail-ma-txt', maTTHC);
            safeSet('detail-title', safeGet(detailData.name, 'CHƯA CẬP NHẬT TÊN THỦ TỤC'));
            
            let linhVuc = 'Không có dữ liệu';
            if (detailData.categoriesDetails && detailData.categoriesDetails.length > 0) {
                linhVuc = detailData.categoriesDetails.map(c => c.name).join(', ');
            }
            safeSet('detail-linhvuc', linhVuc);

            safeSet('detail-soqd', detailData.procedureProposal?.proposalNumber || detailData.decisionNo || 'Không có dữ liệu');
            safeSet('detail-ketqua', (detailData.resultsDetails && detailData.resultsDetails.length > 0) ? detailData.resultsDetails.map(r => r.name).join('; ') : 'Không có dữ liệu');
            safeSet('detail-cqcb', safeGet(detailData.departmentPromulgateName));
            
            let cqth = safeGet(detailData.executingAgencies);
            if (cqth === 'Không có dữ liệu' && detailData.departmentsExecuting) cqth = detailData.departmentsExecuting.map(d => d.name).join(', ');
            safeSet('detail-cqth', cqth);
            
            let capArr = [];
            if (detailData.isMinistry) capArr.push('Bộ');
            if (detailData.isProvince) capArr.push('Tỉnh');
            if (detailData.isWard) capArr.push('Xã');
            safeSet('detail-cap', capArr.length > 0 ? capArr.join(', ') : 'Không có dữ liệu');

            safeSet('detail-loai', (typeof TTHC_TYPE_LABELS !== 'undefined' ? TTHC_TYPE_LABELS[detailData.type] : null) || 'Không xác định');
            safeSet('detail-formality', (typeof TTHC_FORMALITY_TYPE_LABELS !== 'undefined' ? TTHC_FORMALITY_TYPE_LABELS[detailData.formalityType] : null) || 'Không xác định');
            safeSet('detail-state', (typeof TTHC_STATE_LABELS !== 'undefined' ? TTHC_STATE_LABELS[detailData.state] : null) || 'Không xác định');
            safeSet('detail-isInternal', (typeof TTHC_INTERNAL_LABELS !== 'undefined' ? TTHC_INTERNAL_LABELS[String(detailData.isInternal)] : null) || 'Không xác định');
            
            safeSet('detail-doituong', (detailData.subjectTypesDetails && detailData.subjectTypesDetails.length > 0) ? detailData.subjectTypesDetails.map(s => s.name).join(', ') : 'Không có dữ liệu');
            safeSet('detail-diachi', safeGet(detailData.dossierReceivingAddresses));

            let trinhTuHtml = (detailData.executionSteps && detailData.executionSteps.length > 0) ? detailData.executionSteps.map(step => step.description).join('\n\n').replace(/\n/g, '<br>') : '';
            
            let cachThucHtml = '';
            if (detailData.executionMethods && detailData.executionMethods.length > 0) {
                let methodMap = { "ONLINE": "Trực tuyến", "DIRECT": "Trực tiếp", "POSTAL": "Bưu chính" };
                let unitMap = { "DAY": "Ngày", "WORKING_DAY": "Ngày làm việc", "MONTH": "Tháng", "YEAR": "Năm", "HOUR": "Giờ", "OTHER": "Theo quy định" };
                
                cachThucHtml = `<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 15px; border: 1px solid #cbd5e1; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <thead><tr style="background: #f1f5f9; color: #1e293b; text-transform: uppercase; font-size: 13px;">
                        <th style="padding: 15px; border: 1px solid #cbd5e1; width: 15%; text-align: center;">Hình thức</th>
                        <th style="padding: 15px; border: 1px solid #cbd5e1; width: 20%; text-align: center;">Thời gian giải quyết</th>
                        <th style="padding: 15px; border: 1px solid #cbd5e1; width: 35%;">Phí / Lệ phí</th>
                        <th style="padding: 15px; border: 1px solid #cbd5e1; width: 30%;">Mô tả thêm</th>
                    </tr></thead><tbody>`;

                detailData.executionMethods.forEach(m => {
                    let ht = methodMap[m.submissionMethod] || m.submissionMethod;
                    let tg = m.processingTime > 0 ? `${m.processingTime} ${unitMap[m.processingTimeUnit] || m.processingTimeUnit}` : 'Theo quy định';
                    let phiArr = m.fees?.map(f => {
                        let p = f.value > 0 ? f.value.toLocaleString('vi-VN') + ' VNĐ' : 'Theo quy định';
                        return f.description ? `${p} (${f.description})` : p;
                    }) || [];
                    let phi = phiArr.length > 0 ? phiArr.join('<br>') : 'Không có quy định';
                    
                    cachThucHtml += `<tr>
                        <td style="padding: 15px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700; color: #D2232A;">${ht}</td>
                        <td style="padding: 15px; border: 1px solid #cbd5e1; text-align: center; color: #dc2626; font-weight: 500;">${tg}</td>
                        <td style="padding: 15px; border: 1px solid #cbd5e1; text-align: justify;">${phi}</td>
                        <td style="padding: 15px; border: 1px solid #cbd5e1; text-align: justify; color: #64748b;">${m.description || 'Không có'}</td>
                    </tr>`;
                });
                cachThucHtml += `</tbody></table>`;
            }

            let hoSoHtml = '';
            if (detailData.executionCases && detailData.executionCases.length > 0) {
                hoSoHtml += `<div class="procedure-documents-wrapper"><div class="procedure-documents-scroll"><table class="procedure-documents-table"><colgroup><col class="col-stt"><col class="col-document"><col class="col-quantity"></colgroup><thead><tr><th class="center-cell">STT</th><th>TÊN GIẤY TỜ, TÀI LIỆU CẦN NỘP</th><th class="center-cell">SỐ LƯỢNG</th></tr></thead><tbody>`;
                let stt = 1;
                detailData.executionCases.forEach(c => {
                    if (c.name) hoSoHtml += `<tr class="execution-case-row"><td colspan="3"><div class="execution-case-title"><i class="fa-solid fa-layer-group"></i> ${this.escapeHtml(c.name)}</div></td></tr>`;
                    if (c.profileComponents && c.profileComponents.length > 0) {
                        c.profileComponents.forEach(comp => {
                            let cleanName = (comp.name || '').replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim() || 'Giấy tờ, tài liệu';
                            let quantityHtml = '';
                            if (comp.originalQty > 0) quantityHtml += `<div>Bản chính: ${comp.originalQty}</div>`;
                            if (comp.copyQty > 0) quantityHtml += `<div style="color: #64748b; font-size: 13px; margin-top: 4px;">Bản sao: ${comp.copyQty}</div>`;
                            if (!quantityHtml) quantityHtml = `<div>Theo quy định</div>`;
                            
                            let attachmentHtml = '';
                            if (comp.attachments && comp.attachments.length > 0) {
                                const items = comp.attachments.map(att => {
                                    const fileId = att.id || att.fileId;
                                    if (!fileId) return '';
                                    const fileName = att.fileName || att.name || 'Biểu mẫu đính kèm';
                                    const fileIcon = this.getFileIcon(fileName);
                                    return `<div class="attachment-item"><div class="attachment-file">${fileIcon}<span class="attachment-file-name">${this.escapeHtml(fileName)}</span></div><button type="button" class="attachment-download" onclick="NyApp.downloadAttachment('${fileId}', this)"><i class="fa-solid fa-download"></i><span>Tải biểu mẫu</span></button></div>`;
                                }).join('');
                                if (items) attachmentHtml = `<div class="attachment-list">${items}</div>`;
                            }
                            hoSoHtml += `<tr class="document-row"><td class="stt-cell" style="font-size:16px;">${stt++}</td><td class="document-cell"><div class="document-content"><div class="document-name" style="font-size:15px;">${cleanName}</div>${attachmentHtml}</div></td><td class="quantity-cell" style="font-size:15px;">${quantityHtml}</td></tr>`;
                        });
                    }
                });
                hoSoHtml += `</tbody></table></div></div>`;
            } else {
                hoSoHtml = `<div class="no-profile-data">Chưa có dữ liệu thành phần hồ sơ</div>`;
            }

            let dieuKienHtml = safeGet(detailData.requirementsAndConditions);
            let canCuHtml = '';
            if (detailData.legalBasisesDetails && detailData.legalBasisesDetails.length > 0) {
                canCuHtml = '<ul style="margin: 0; padding-left: 20px; line-height: 1.8;">' + detailData.legalBasisesDetails.map(l => `<li style="margin-bottom: 8px;"><strong>${l.code}</strong>: ${l.name}</li>`).join('') + '</ul>';
            }

            this.detailDataCache = {
                'tab-trinhtu': (cachThucHtml ? `<h4 style="color: #D2232A; margin-top: 0; font-size: 16px; text-transform: uppercase;">1. CÁCH THỨC THỰC HIỆN</h4>${cachThucHtml}` : '') + (trinhTuHtml ? `<h4 style="color: #D2232A; margin-top: 25px; font-size: 16px; text-transform: uppercase;">2. TRÌNH TỰ THỰC HIỆN</h4><div style="white-space: pre-wrap;">${trinhTuHtml}</div>` : ''),
                'tab-hoso': hoSoHtml,
                'tab-dieukien': dieuKienHtml !== 'Không có dữ liệu' ? `<div style="white-space: pre-wrap;">${dieuKienHtml}</div>` : '<div style="color: #64748b; font-style: italic; text-align: center;">Chưa có dữ liệu</div>',
                'tab-cancu': canCuHtml ? canCuHtml : '<div style="color: #64748b; font-style: italic; text-align: center;">Chưa có dữ liệu</div>'
            };

            let detailMenu = document.getElementById('detail-tabs-menu');
            if (detailMenu) {
                detailMenu.innerHTML = `
                    <button onclick="NyApp.switchDetailTab('tab-trinhtu')" id="btn-tab-trinhtu" style="background: none; border: none; padding: 15px 20px; font-weight: bold; font-size: 15px; cursor: pointer; color:#64748b; border-bottom: 3px solid transparent; transition: 0.2s;"><i class="fa-solid fa-list-ol"></i> Cách thức & Trình tự</button>
                    <button onclick="NyApp.switchDetailTab('tab-hoso')" id="btn-tab-hoso" style="background: none; border: none; padding: 15px 20px; font-weight: bold; font-size: 15px; cursor: pointer; color:#64748b; border-bottom: 3px solid transparent; transition: 0.2s;"><i class="fa-solid fa-folder-open"></i> Thành phần hồ sơ</button>
                    <button onclick="NyApp.switchDetailTab('tab-dieukien')" id="btn-tab-dieukien" style="background: none; border: none; padding: 15px 20px; font-weight: bold; font-size: 15px; cursor: pointer; color:#64748b; border-bottom: 3px solid transparent; transition: 0.2s;"><i class="fa-solid fa-circle-exclamation"></i> Yêu cầu & Điều kiện</button>
                    <button onclick="NyApp.switchDetailTab('tab-cancu')" id="btn-tab-cancu" style="background: none; border: none; padding: 15px 20px; font-weight: bold; font-size: 15px; cursor: pointer; color:#64748b; border-bottom: 3px solid transparent; transition: 0.2s;"><i class="fa-solid fa-scale-balanced"></i> Căn cứ pháp lý</button>
                `;
                this.switchDetailTab('tab-trinhtu');
            }

            let btnCopy = document.getElementById('btn-copy-ma');
            if (btnCopy) {
                btnCopy.onclick = () => {
                    navigator.clipboard.writeText(maTTHC);
                    let oldHtml = btnCopy.innerHTML;
                    btnCopy.innerHTML = `<i class="fa-solid fa-check" style="color: #10b981;"></i> Đã chép mã`;
                    setTimeout(() => { btnCopy.innerHTML = oldHtml; }, 2000);
                };
            }

            let btnSubmit = document.getElementById('btn-submit-dvc');
            if (btnSubmit) {
                btnSubmit.onclick = (e) => {
                    e.preventDefault();
                    NyApp.handleSubmission(detailData.code);
                };
            }

        } catch (e) {
            let contentEl = document.getElementById('detail-tab-content');
            if (contentEl) contentEl.innerHTML = `<div style="text-align:center; padding: 40px; color: #dc2626;"><i class="fa-solid fa-triangle-exclamation fa-2x"></i><br><br>Lỗi tải dữ liệu chi tiết</div>`;
        }
    },

    switchDetailTab(tabId) {
        ['tab-trinhtu', 'tab-hoso', 'tab-dieukien', 'tab-cancu'].forEach(id => {
            let btn = document.getElementById('btn-' + id);
            if (btn) { btn.style.color = '#64748b'; btn.style.borderBottomColor = 'transparent'; btn.style.background = 'transparent'; }
        });
        let actBtn = document.getElementById('btn-' + tabId);
        if (actBtn) { actBtn.style.color = '#D2232A'; actBtn.style.borderBottomColor = '#D2232A'; actBtn.style.background = 'rgba(210,35,42,0.05)'; }
        let tabContent = document.getElementById('detail-tab-content');
        if (tabContent) tabContent.innerHTML = this.detailDataCache[tabId];
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

    async handleSubmission(maTTHC) {
        let detailModal = document.getElementById('procedureDetailModal');
        if (detailModal) detailModal.style.display = 'none';

        // =======================================================
        // --- ÉP BUỘC TẢI DỮ LIỆU OUTLAW TỪ GITHUB NẾU CHƯA CÓ ---
        // =======================================================
        if (!window.isVerticalConfig || !window.isVerticalConfig.outlaw_links) {
            try {
                let res = await fetch('https://raw.githubusercontent.com/ChippedTopaz/am-sieu-toc-data/niemyet/isVertical.json?t=' + Date.now());
                window.isVerticalConfig = await res.json();
            } catch (e) {
                console.log("Không tải được file luật isVertical.json");
                window.isVerticalConfig = { outlaw_links: {} }; // Fallback an toàn
            }
        }

        // =======================================================
        // --- TRẠM KIỂM SOÁT VIP: KIỂM TRA OUTLAW NGAY TỪ CỬA ---
        // =======================================================
        let configVertical = window.isVerticalConfig;
        let rawMaTTHC = (maTTHC || '').toString().trim(); 

        if (configVertical && configVertical.outlaw_links && configVertical.outlaw_links[rawMaTTHC]) {
            let outlawData = configVertical.outlaw_links[rawMaTTHC];
            
            // KỊCH BẢN 1: OUTLAW ĐƠN GIẢN (Link trực tiếp, không chia nhánh)
            if (typeof outlawData === 'string') {
                let evt = new CustomEvent("YeuCauMoAnDanh", { detail: { url: outlawData } });
                document.dispatchEvent(evt);
                
                setTimeout(() => {
                    if (!document.documentElement.hasAttribute('data-extension-installed')) {
                        if (confirm("Chưa phát hiện Extension nộp ẩn danh!\n\nMở bằng tab thường?")) {
                            window.open(outlawData, '_blank');
                        }
                    }
                }, 150);
            } 
            // KỊCH BẢN 2: OUTLAW CÓ NHIỀU TRƯỜNG HỢP CON
            else if (typeof outlawData === 'object' && outlawData.cases && outlawData.cases.length > 0) {
                if (typeof this.showOutlawCasesModal === 'function') {
                    this.showOutlawCasesModal(outlawData.cases);
                }
            }

            if (typeof this.resetKioskUI === 'function') this.resetKioskUI();
            return; // DỪNG LUÔN, KHÔNG QUÉT DATABASE TỈNH NỮA!
        }
        // =======================================================

        // KHI KHÔNG PHẢI OUTLAW THÌ MỚI ĐỌC DỮ LIỆU THỰC THI.
        // Delivery mode: tải đúng 1 shard theo MaTTHC. Outlaw đã được xử lý và return ở phía trên.
        let cleanInput = this.removeAccents(maTTHC).toLowerCase().replace(/['\s]/g, '');
        let cleanKey = (k) => k.toLowerCase().replace(/[_-\s]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
        let matchedRows = [];
        let currentProvince = localStorage.getItem('nyProvinceName_V2') || '';

        if (this.nyUseDeliveryData && this.nyDeliveryCatalog) {
            try {
                matchedRows = await this.loadDeliveryExecutionRows(rawMaTTHC);
            } catch (e) {
                console.error(`Lỗi tải execution shard ${currentProvince}:`, e);
                alert('Không tải được dữ liệu nộp hồ sơ trực tuyến. Vui lòng thử lại.');
                return;
            }
        } else {
            let db = window.appData.fullDatabase || [];
            matchedRows = db.filter(item => {
                if (!item) return false;
                let keyMaTTHC = Object.keys(item).find(k => cleanKey(k).includes('matthc'));
                let valMaTTHC = keyMaTTHC ? this.removeAccents(item[keyMaTTHC]).toLowerCase().replace(/['\s]/g, '') : '';

                let keyMaDVC = Object.keys(item).find(k => cleanKey(k).includes('madvc'));
                let valMaDVC = keyMaDVC ? this.removeAccents(item[keyMaDVC]).toLowerCase().replace(/['\s]/g, '') : '';

                return (valMaTTHC === cleanInput || valMaDVC === cleanInput);
            });
        }

        if (matchedRows.length === 0) {
            alert("Thủ tục hành chính chưa được cung cấp dịch vụ công trực tuyến, xin vui lòng liên hệ cán bộ bộ phận Một cửa để được hỗ trợ nộp hồ sơ trực tiếp.");
            return;
        }

        // Nhóm DVC con
        let dvcGroups = {};
        matchedRows.forEach(row => {
            let keyMaDVC = Object.keys(row).find(k => cleanKey(k).includes('madvc'));
            let maDVC = (keyMaDVC && row[keyMaDVC]) ? row[keyMaDVC].toString().trim() : 'CHUA_CO_MA';
            
            let keyTenDVC = Object.keys(row).find(k => cleanKey(k).includes('tendvc') || cleanKey(k).includes('tentthc'));
            let tenDVC = (keyTenDVC && row[keyTenDVC]) ? row[keyTenDVC].toString().trim() : 'Dịch vụ công trực tuyến';

            if (!dvcGroups[maDVC]) {
                dvcGroups[maDVC] = { maDVC: maDVC, tenDVC: tenDVC, rows: [] };
            }
            dvcGroups[maDVC].rows.push(row);
        });

        let dvcList = Object.values(dvcGroups);

        if (dvcList.length === 1) {
            this.showAgencySelection(dvcList[0].rows);
        } else {
            this.showDVCSelection(dvcList);
        }
    },

    // =======================================================
    // HÀM HIỂN THỊ HỘP THOẠI CHỌN TRƯỜNG HỢP CHO OUTLAW VIP
    // =======================================================
    showOutlawCasesModal(cases) {
        // Xóa modal cũ nếu đang bị kẹt
        let oldModal = document.getElementById('outlawCasesModal');
        if (oldModal) oldModal.remove();

        // Tạo Modal bọc ngoài (Nền mờ)
        let modal = document.createElement('div');
        modal.id = 'outlawCasesModal';
        modal.style.cssText = 'position: fixed; inset: 0; background: rgba(15,23,42,0.85); z-index: 99999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px);';
        
        // Vẽ danh sách các nút bấm (Các trường hợp)
        let buttonsHtml = cases.map((c) => `
            <button class="outlaw-case-btn" data-url="${c.url}" style="padding: 16px 20px; background: #fff; border: 1.5px solid #cbd5e1; border-radius: 12px; font-size: 16px; font-family: 'Be Vietnam Pro', sans-serif; font-weight: 600; color: #1e293b; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); transition: all 0.2s;">
                <span>${c.name}</span>
                <i class="fa-solid fa-arrow-right-to-bracket" style="color: #94a3b8; font-size: 18px;"></i>
            </button>
        `).join('');

        // Cấu trúc khung Hộp thoại
        modal.innerHTML = `
            <div style="background: #fff; width: 90%; max-width: 550px; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column; max-height: 85vh; animation: slideDown 0.3s ease-out;">
                <div style="padding: 20px 25px; background: #D2232A; color: white; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 18px; display: flex; align-items: center; gap: 10px;"><i class="fa-solid fa-code-branch"></i> VUI LÒNG CHỌN TRƯỜNG HỢP HỒ SƠ</h3>
                    <button id="closeOutlawModal" style="background: none; border: none; color: white; cursor: pointer; font-size: 22px; transition: 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div style="padding: 25px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; background: #f8fafc;">
                    <div style="font-size: 14px; color: #64748b; margin-bottom: 5px; text-align: center;">Vui lòng lựa chọn trường hợp theo nhu cầu của bạn:</div>
                    ${buttonsHtml}
                </div>
            </div>
            <style>
                @keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
            </style>
        `;
        
        document.body.appendChild(modal);

        // Bắt sự kiện Đóng Modal
        document.getElementById('closeOutlawModal').onclick = () => modal.remove();

        // Bắt sự kiện khi người dân chọn Trường hợp
        modal.querySelectorAll('.outlaw-case-btn').forEach(btn => {
            btn.onmouseover = function() { this.style.borderColor = '#D2232A'; this.style.color = '#D2232A'; this.querySelector('i').style.color = '#D2232A'; this.style.transform = 'translateY(-2px)'; };
            btn.onmouseout = function() { this.style.borderColor = '#cbd5e1'; this.style.color = '#1e293b'; this.querySelector('i').style.color = '#94a3b8'; this.style.transform = 'none'; };
            
            btn.onclick = function() {
                let url = this.getAttribute('data-url');
                modal.remove(); // Ẩn Modal ngay lập tức
                
                // Bắn tín hiệu sang Extension ẩn danh
                let evt = new CustomEvent("YeuCauMoAnDanh", { detail: { url: url } });
                document.dispatchEvent(evt);
                
                setTimeout(() => {
                    if (!document.documentElement.hasAttribute('data-extension-installed')) {
                        if (confirm("Chưa phát hiện Extension nộp ẩn danh!\n\nMở bằng tab thường?")) {
                            window.open(url, '_blank');
                        }
                    }
                }, 150);
            };
        });
    },

    showDVCSelection(dvcList) {
        let container = document.getElementById('dvc-list-container');
        if (!container) return;
        container.innerHTML = '';
        
        dvcList.forEach(dvc => {
            let btn = document.createElement('button');
            btn.className = 'ny-action-btn';
            btn.style.cssText = 'width: 100%; padding: 15px; font-size: 15px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; text-align: left; transition: 0.2s; cursor: pointer; display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; white-space: normal; word-break: break-word; line-height: 1.4;';
            btn.innerHTML = `<div style="color: #D2232A; font-weight: bold; width: 100%;"><i class="fa-solid fa-file-signature"></i> ${dvc.tenDVC}</div><div style="font-size: 13.5px; color: #64748b;">Mã DVC: ${dvc.maDVC}</div>`;
            
            btn.onmouseover = () => { btn.style.background = '#fef2f2'; btn.style.borderColor = '#fca5a5'; };
            btn.onmouseout = () => { btn.style.background = '#f8fafc'; btn.style.borderColor = '#cbd5e1'; };
            
            btn.onclick = () => {
                document.getElementById('dvcSelectionModal').classList.remove('active');
                this.showAgencySelection(dvc.rows); 
            };
            container.appendChild(btn);
        });

        document.getElementById('dvcSelectionModal').classList.add('active');
    },

    // =======================================================
    // 1. HÀM TẠO LINK NỘP HỒ SƠ SIÊU TỐC (THUẬT TOÁN MỚI NHẤT)
    // =======================================================
    generateASTFinalUrl(row, procMaDVC) {
        let cleanKey = (k) => k.toLowerCase().replace(/[_-\s]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
        
        let keyMaTTHC = Object.keys(row).find(k => cleanKey(k) === 'matthc');
        let maTTHC = keyMaTTHC ? (row[keyMaTTHC] || '').toString().trim() : '';

        let keyMaCQTH = Object.keys(row).find(k => cleanKey(k) === 'macqth' || cleanKey(k) === 'macoquanthuchien');
        let maCQTH = keyMaCQTH ? (row[keyMaCQTH] || '').toString().trim() : '';

        let keyMaTTHCDP = Object.keys(row).find(k => cleanKey(k) === 'matthcdp');
        let maTTHCDP = keyMaTTHCDP ? (row[keyMaTTHCDP] || '').toString().trim() : maTTHC;

        let maDVC = (procMaDVC || '').toString().trim();
        
        let citizenUrlKey = Object.keys(row).find(k => cleanKey(k) === 'citizenurl' || cleanKey(k) === 'linknop' || cleanKey(k) === 'url' || cleanKey(k) === 'link');
        let citizenUrl = citizenUrlKey ? (row[citizenUrlKey] || '').toString().trim() : '';

        if (!citizenUrl || !maTTHC || !maCQTH) return null;

        let baseLink = citizenUrl.replace(/\s/g, '');
        if (!baseLink.startsWith('http://') && !baseLink.startsWith('https://')) {
            baseLink = 'https://' + baseLink;
        }

        let separator = baseLink.includes('?') ? '&' : '?';
        return `${baseLink}${separator}MaTTHC=${maTTHC}&MaCoQuanThucHien=${maCQTH}&MaDVC=${maDVC}&MaTTHCDP=${maTTHCDP}&vneid=1`;
    },

    // =======================================================
    // 2. HÀM HỘP THOẠI CHỌN CƠ QUAN (CÓ ĐIỀU HƯỚNG MẶC ĐỊNH)
    // =======================================================
    showAgencySelection(rows) {
        if (!rows || rows.length === 0) return;

        // =======================================================
        // --- TRẠM KIỂM SOÁT 1: ĐÁNH CHẶN THỦ TỤC "OUTLAW" (FIXED LINK) ---
        // =======================================================
        let _cleanKey = (k) => k.toLowerCase().replace(/[_-\s]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
        // Tìm cột chứa mã TTHC trong dòng dữ liệu đầu tiên
        let codeKey = Object.keys(rows[0]).find(k => _cleanKey(k) === 'matthc' || _cleanKey(k) === 'code');
        let maTTHC_HienTai = codeKey ? (rows[0][codeKey] || '').toString().trim() : '';

        let configVertical = window.isVerticalConfig;
        if (configVertical && configVertical.outlaw_links && configVertical.outlaw_links[maTTHC_HienTai]) {
            // Phát hiện mã TTHC này có trong danh sách Outlaw -> Lấy link cứng
            let outlawUrl = configVertical.outlaw_links[maTTHC_HienTai];
            
            // Bắn tín hiệu sang Extension ẩn danh
            let evt = new CustomEvent("YeuCauMoAnDanh", { detail: { url: outlawUrl } });
            document.dispatchEvent(evt);
            
            setTimeout(() => {
                if (!document.documentElement.hasAttribute('data-extension-installed')) {
                    if (confirm("Chưa phát hiện Extension nộp ẩn danh trên Kiosk này!\n\nHệ thống sẽ mở bằng tab thường. Vẫn tiếp tục?")) {
                        window.open(outlawUrl, '_blank');
                    }
                }
            }, 150);

            this.resetKioskUI();
            return; // ĐÃ LÀ OUTLAW THÌ DỪNG HÀM TẠI ĐÂY, BỎ QUA MỌI BƯỚC BÊN DƯỚI
        }
        // =======================================================

        // KHI KHÔNG PHẢI OUTLAW THÌ MỚI CHẠY TIẾP XUỐNG ĐÂY
        let cleanKey = (k) => k.toLowerCase().replace(/[_-\s]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
        let agenciesMap = new Map(); 

        rows.forEach(row => {
            let keyMaDVC = Object.keys(row).find(k => cleanKey(k).includes('madvc'));
            let procMaDVC = keyMaDVC ? row[keyMaDVC].toString().trim() : '';

            let finalUrl = this.generateASTFinalUrl(row, procMaDVC);
            if (!finalUrl) return;

            let cqKey = Object.keys(row).find(k => cleanKey(k).includes('tencoquanthuchien') || cleanKey(k).includes('tencqth') || cleanKey(k) === 'cqth');
            
            if (cqKey && row[cqKey]) {
                let ags = row[cqKey].toString().split(/(?:;|,|\n)/).map(a => a.trim()).filter(a => a);
                ags.forEach(ag => {
                    if (!agenciesMap.has(ag)) {
                        agenciesMap.set(ag, finalUrl); 
                    }
                });
            } else {
                agenciesMap.set('Thực hiện tại Cơ quan có thẩm quyền', finalUrl);
            }
        });

        this.currentAgencies = Array.from(agenciesMap.entries()).map(([name, url]) => ({name, url}));
        
        if (this.currentAgencies.length === 0) {
            alert("Các cơ quan thực hiện dịch vụ công này chưa được cấu hình đường link nộp trực tuyến (Citizen URL) hợp lệ!");
            return;
        }

        // =======================================================
        // --- CHỐT CHẶN 2: ĐIỀU HƯỚNG TỚI CƠ QUAN MẶC ĐỊNH ---
        // =======================================================
        let defaultAgency = localStorage.getItem('nyDefaultAgency_V2');
        if (defaultAgency && defaultAgency.trim() !== '') {
            // Tìm xem cơ quan mặc định có nằm trong danh sách thực hiện của thủ tục này không
            let targetAgency = this.currentAgencies.find(ag => ag.name.trim() === defaultAgency.trim());
            
            if (targetAgency) {
                // Đã tìm thấy -> Bắn thẳng sang link DVC, BỎ QUA MODAL CHỌN CƠ QUAN
                let evt = new CustomEvent("YeuCauMoAnDanh", { detail: { url: targetAgency.url } });
                document.dispatchEvent(evt);
                
                setTimeout(() => {
                    if (!document.documentElement.hasAttribute('data-extension-installed')) {
                        if (confirm("Chưa phát hiện Extension nộp ẩn danh trên Kiosk này!\n\nHệ thống sẽ mở bằng tab thường. Vẫn tiếp tục?")) {
                            window.open(targetAgency.url, '_blank');
                        }
                    }
                }, 150);

                this.resetKioskUI();
                return; // Dừng hàm, tàng hình Modal
            }
        }
        // =======================================================

        // NẾU KHÔNG PHẢI OUTLAW VÀ CŨNG KHÔNG CÓ CƠ QUAN MẶC ĐỊNH -> HIỂN THỊ BẢNG CHỌN BÌNH THƯỜNG
        document.getElementById('ny-agency-search').value = '';
        this.renderAgencyList(this.currentAgencies);

        document.getElementById('agencySelectionModal').classList.add('active');
    },

    renderAgencyList(agenciesList) {
        let container = document.getElementById('agency-list-container');
        if (!container) return;
        container.innerHTML = '';
        
        if (agenciesList.length === 0) {
            container.innerHTML = '<div style="padding: 10px; color: #64748b; font-style: italic;">Không tìm thấy cơ quan nào khớp với từ khóa.</div>';
            return;
        }

        agenciesList.forEach(ag => {
            let btn = document.createElement('button');
            btn.className = 'ny-action-btn';
            btn.style.cssText = 'width: 100%; padding: 12px 15px; font-size: 15px; font-weight: bold; background: #f8fafc; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 8px; text-align: left; transition: 0.2s; cursor: pointer; display: flex; align-items: center; margin-bottom: 8px;';
            btn.innerHTML = `<i class="fa-solid fa-building-flag" style="margin-right: 12px; color: #D2232A; font-size: 18px;"></i> ${ag.name}`;
            
            btn.onmouseover = () => { btn.style.background = '#fef2f2'; btn.style.borderColor = '#fca5a5'; };
            btn.onmouseout = () => { btn.style.background = '#f8fafc'; btn.style.borderColor = '#cbd5e1'; };
            
            btn.onclick = () => {
                let evt = new CustomEvent("YeuCauMoAnDanh", { detail: { url: ag.url } });
                document.dispatchEvent(evt);
                
                setTimeout(() => {
                    if (!document.documentElement.hasAttribute('data-extension-installed')) {
                        if (confirm("Chưa phát hiện Extension nộp ẩn danh trên Kiosk này!\n\nHệ thống sẽ mở bằng tab thường. Vẫn tiếp tục?")) {
                            window.open(ag.url, '_blank');
                        }
                    }
                }, 150);

                document.getElementById('agencySelectionModal').classList.remove('active');
                this.resetKioskUI();
            };
            container.appendChild(btn);
        });
    },

    filterAgencyList() {
        let input = this.removeAccents(document.getElementById('ny-agency-search').value).toLowerCase().trim();
        let filtered = this.currentAgencies.filter(ag => this.removeAccents(ag.name).toLowerCase().includes(input));
        this.renderAgencyList(filtered);
    },

    
    // =======================================================
    // HÀM MỞ TRANG PHẢN ÁNH KIẾN NGHỊ (TÍCH HỢP ẨN DANH)
    // =======================================================
    openPAKN() {
        let url = 'https://dichvucong.gov.vn/nop-phan-anh-kien-nghi';
        
        // Phát tín hiệu cho Extension Kiosk mở tab ẩn danh
        let evt = new CustomEvent("YeuCauMoAnDanh", { detail: { url: url } });
        document.dispatchEvent(evt);
        
        // Cơ chế Fallback: Nếu không cài Extension thì hỏi mở bằng tab thường
        setTimeout(() => {
            if (!document.documentElement.hasAttribute('data-extension-installed')) {
                if (confirm("Chưa phát hiện Extension nộp ẩn danh trên Kiosk này!\n\nHệ thống sẽ mở bằng tab thường. Vẫn tiếp tục?")) {
                    window.open(url, '_blank');
                }
            }
        }, 150);

        // Tự động đóng Modal PAKN và dọn dẹp màn hình chính
        let paknModal = document.getElementById('paknModal');
        if (paknModal) paknModal.classList.remove('active');
        this.resetKioskUI();
    },

    // =======================================================
    // HÀM ĐỔI MÀU GIAO DIỆN LƯỚI (TRẮNG / ĐỎ)
    // =======================================================
    toggleGridColorMode() {
        // Đọc màu hiện tại (mặc định là đỏ), đổi sang màu kia và lưu lại
        let currentMode = localStorage.getItem('nyGridColorMode') || 'red';
        let newMode = currentMode === 'red' ? 'white' : 'red';
        localStorage.setItem('nyGridColorMode', newMode);
        
        // Cập nhật lại giao diện ngay lập tức
        this.renderLinhVucGrid();
    },

    renderLinhVucGrid() {
        let container = document.getElementById('ny-grid-view');
        if (!container) return;

        let linhVucMap = new Map();
        this.nyData.forEach(item => {
            if (item.lv) {
                if (!linhVucMap.has(item.lv)) {
                    linhVucMap.set(item.lv, { count: 0, cqcb: item.cqcb || 'Chưa cập nhật' });
                }
                linhVucMap.get(item.lv).count++;
            }
        });

        let allLinhVuc = Array.from(linhVucMap.keys());
        let dsLinhVuc;
        
        // ===============================================
        // BỘ LỌC + THỨ TỰ CẤU HÌNH KIOSK
        // - Có cấu hình fields: giữ nguyên đúng thứ tự trong JSON
        // - Chưa cấu hình: giữ hành vi cũ, sắp xếp alphabet
        // ===============================================
        if (Array.isArray(this.nySelectedFields)) {
            dsLinhVuc = this.nySelectedFields.filter(lv => linhVucMap.has(lv));
        } else {
            dsLinhVuc = allLinhVuc.sort((a, b) => a.localeCompare(b, 'vi'));
        }

        if (dsLinhVuc.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding: 50px; color: #64748b; font-size: 16px; background: #fff; border-radius: 12px; border: 1px dashed #cbd5e1; grid-column: 1/-1;">Chưa có lĩnh vực nào được cấu hình để hiển thị. Vui lòng bấm "Cấu hình" ở góc trên!</div>`;
            return;
        }

        let html = `<div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 20px; padding: 15px 5px 80px 5px;">`;
        let colorMode = localStorage.getItem('nyGridColorMode') || 'red'; 

        dsLinhVuc.forEach(lv => {
            let safeLv = lv.replace(/'/g, "\\'");
            let dataObj = linhVucMap.get(lv);
            let count = dataObj.count;
            let countStr = count < 10 ? `0${count}` : count;
            let boNganh = dataObj.cqcb;
            
            let boNganhHienThi = boNganh ? boNganh.trim().replace(/ ([^ ]+)$/, '&nbsp;$1') : '';
            let tenLinhVucHienThi = lv ? lv.trim().replace(/ ([^ ]+)$/, '&nbsp;$1') : '';
            
            if (colorMode === 'red') {
                html += `
                    <div onclick="NyApp.selectLinhVuc('${safeLv}')" style="position: relative; background: #D2232A; border: 1px solid #ffffff; border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 10px rgba(210, 35, 42, 0.3); display: flex; flex-direction: column; box-sizing: border-box; aspect-ratio: 1 / 1.414;" onmouseover="this.style.transform='translateY(-6px)'; this.style.boxShadow='0 8px 20px rgba(210, 35, 42, 0.6)'; this.style.background='#b91c1c';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 10px rgba(210, 35, 42, 0.3)'; this.style.background='#D2232A';">
                        <div style="position: absolute; top: 8px; left: 8px; right: 8px; bottom: 8px; border: 1.5px solid rgba(255, 255, 255, 0.9); border-radius: 8px; pointer-events: none;"></div>
                        <div style="position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                            <img src="https://cdn.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@main/Logo-white.png" alt="Logo CCHC" style="width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));">
                            <span style="font-size: 13px; font-weight: 700; color: #D2232A; background: #ffffff; padding: 4px 8px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${countStr} TTHC</span>
                        </div>
                        <div style="position: relative; z-index: 2; flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;">
                            <div title="${lv}" style="font-size: 15.5px; font-weight: 800; color: #ffffff; line-height: 1.5; text-transform: uppercase; text-align: center; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; text-shadow: 0 1px 2px rgba(0,0,0,0.2); text-wrap: balance;">
                                ${tenLinhVucHienThi}
                            </div>
                        </div>
                        <div style="position: relative; z-index: 2; margin-top: auto; padding-top: 12px; border-top: 1px dashed rgba(255,255,255,0.4); text-align: center; height: 34px; display: flex; align-items: center; justify-content: center;">
                            <div style="font-size: 10.5px; font-weight: 600; color: rgba(255,255,255,0.9); text-transform: uppercase; letter-spacing: 0.5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-wrap: balance;" title="${boNganh}">
                                <i class="fa-solid fa-landmark-flag" style="margin-right: 4px;"></i> ${boNganhHienThi}
                            </div>
                        </div>
                    </div>`;
            } else {
                html += `
                    <div onclick="NyApp.selectLinhVuc('${safeLv}')" style="position: relative; background: #ffffff; border: 1px solid #D2232A; border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 10px rgba(249, 115, 22, 0.4); display: flex; flex-direction: column; box-sizing: border-box; aspect-ratio: 1 / 1.414;" onmouseover="this.style.transform='translateY(-6px)'; this.style.borderColor='#b91c1c'; this.style.boxShadow='0 8px 20px rgba(249, 115, 22, 0.7)';" onmouseout="this.style.transform='none'; this.style.borderColor='#D2232A'; this.style.boxShadow='0 4px 10px rgba(249, 115, 22, 0.4)';">
                        <div style="position: absolute; top: 8px; left: 8px; right: 8px; bottom: 8px; border: 1.5px solid rgba(210, 35, 42, 0.8); border-radius: 8px; pointer-events: none;"></div>
                        <div style="position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                            <img src="https://cdn.jsdelivr.net/gh/ChippedTopaz/dieu-phoi@main/Logo%20CCHC.png" alt="Logo CCHC" style="width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));">
                            <span style="font-size: 13px; font-weight: 700; color: #ea580c; background: #ffedd5; padding: 4px 8px; border-radius: 6px;">${countStr} TTHC</span>
                        </div>
                        <div style="position: relative; z-index: 2; flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;">
                            <div title="${lv}" style="font-size: 15.5px; font-weight: 800; color: #1e293b; line-height: 1.5; text-transform: uppercase; text-align: center; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; text-wrap: balance;">
                                ${tenLinhVucHienThi}
                            </div>
                        </div>
                        <div style="position: relative; z-index: 2; margin-top: auto; padding-top: 12px; border-top: 1px dashed rgba(210, 35, 42, 0.3); text-align: center; height: 34px; display: flex; align-items: center; justify-content: center;">
                            <div style="font-size: 10.5px; font-weight: 600; color: #D2232A; text-transform: uppercase; letter-spacing: 0.5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-wrap: balance;" title="${boNganh}">
                                <i class="fa-solid fa-landmark-flag" style="margin-right: 4px;"></i> ${boNganhHienThi}
                            </div>
                        </div>
                    </div>`;
            }
        });
        
        html += `</div>`;
        container.innerHTML = html;
    },

    // =======================================================
    // LOGIC HỘP THOẠI CẤU HÌNH KIOSK
    // =======================================================
    openConfigModal() {
        let overlay = document.getElementById('nyConfigModalOverlay');
        if (overlay) overlay.style.display = 'flex';
        
        // Cập nhật Combobox Cơ quan công bố
        let cqcbSet = new Set();
        this.nyData.forEach(item => { if (item.cqcb) cqcbSet.add(item.cqcb); });
        let cqcbArr = Array.from(cqcbSet).sort((a, b) => a.localeCompare(b, 'vi'));
        
        let selectCqcb = document.getElementById('ny-config-cqcb');
        if (selectCqcb) {
            selectCqcb.innerHTML = '<option value="">-- Tất cả Cơ quan công bố --</option>' + 
                cqcbArr.map(cq => `<option value="${cq}">${cq}</option>`).join('');
        }
        
        document.getElementById('ny-config-search').value = '';
        document.getElementById('ny-config-checkall').checked = false;

        this.buildConfigFieldsList();
    },

    closeConfigModal() {
        let overlay = document.getElementById('nyConfigModalOverlay');
        if (overlay) overlay.style.display = 'none';
    },

    buildConfigFieldsList() {
        let container = document.getElementById('ny-config-fields-list');
        if (!container) return;
        container.innerHTML = '';

        // Gom nhóm Lĩnh vực và Cơ quan công bố
        let fieldMap = new Map();
        this.nyData.forEach(item => {
            if (item.lv && !fieldMap.has(item.lv)) {
                fieldMap.set(item.lv, item.cqcb || 'Khác');
            }
        });

        let fieldsArr = Array.from(fieldMap.keys()).sort((a, b) => a.localeCompare(b, 'vi'));
        
        // Mặc định: Nếu chưa cấu hình bao giờ thì check toàn bộ
        let isFirstTime = this.nySelectedFields === null;
        let currentSelected = isFirstTime ? fieldsArr : this.nySelectedFields;

        fieldsArr.forEach(lv => {
            let cqcb = fieldMap.get(lv);
            let isChecked = currentSelected.includes(lv) ? 'checked' : '';
            
            let div = document.createElement('div');
            div.className = 'ny-config-field-item';
            div.setAttribute('data-cqcb', cqcb);
            div.style.cssText = "display: flex; align-items: flex-start; gap: 12px; padding: 12px 15px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; transition: 0.2s;";
            
            div.innerHTML = `
                <input type="checkbox" id="ny-chk-${lv.replace(/[\s/]/g, '')}" value="${lv}" class="ny-field-checkbox" ${isChecked} style="width: 18px; height: 18px; margin-top: 3px; accent-color: #D2232A; cursor: pointer; flex-shrink: 0;">
                <label for="ny-chk-${lv.replace(/[\s/]/g, '')}" style="cursor: pointer; display: flex; flex-direction: column; gap: 4px; flex: 1;">
                    <span style="font-weight: 700; color: #1e293b; font-size: 14.5px; line-height: 1.4;">${lv}</span>
                    <span style="font-size: 12.5px; color: #64748b; font-weight: 600;"><i class="fa-solid fa-landmark-flag" style="color:#cbd5e1; margin-right:4px;"></i> ${cqcb}</span>
                </label>
            `;
            container.appendChild(div);
        });
    },

    filterConfigFields() {
        let elCqcb = document.getElementById('ny-config-cqcb');
        let elSearch = document.getElementById('ny-config-search');
        
        let filterCqcb = (elCqcb && elCqcb.value) ? elCqcb.value : "";
        let keyword = (elSearch && elSearch.value) ? elSearch.value.trim().toLowerCase() : "";
        
        let removeAccents = (str) => {
            if (!str) return '';
            return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
        };
        let keywordNoAccent = removeAccents(keyword);

        let items = document.querySelectorAll('.ny-config-field-item');
        items.forEach(item => {
            let cqcb = item.getAttribute('data-cqcb');
            let text = removeAccents(item.innerText).toLowerCase();
            
            let matchCqcb = (filterCqcb === "" || cqcb === filterCqcb);
            let matchKeyword = (keywordNoAccent === "" || text.includes(keywordNoAccent));

            if (matchCqcb && matchKeyword) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
        
        let checkAll = document.getElementById('ny-config-checkall');
        if (checkAll) checkAll.checked = false;
    },

    toggleAllConfigFields(checkbox) {
        let isChecked = checkbox.checked;
        let items = document.querySelectorAll('.ny-config-field-item');
        items.forEach(item => {
            if (item.style.display !== 'none') {
                let cb = item.querySelector('.ny-field-checkbox');
                if (cb) cb.checked = isChecked;
            }
        });
    },

    saveConfig() {
        let selected = [];
        let allCheckboxes = document.querySelectorAll('.ny-field-checkbox');
        allCheckboxes.forEach(cb => {
            if (cb.checked) selected.push(cb.value);
        });
        
        this.nySelectedFields = selected;
        localStorage.setItem('nySelectedFields', JSON.stringify(selected));
        
        this.closeConfigModal();
        
        let searchBox = document.getElementById('ny-search-box');
        if (searchBox) searchBox.value = '';
        
        // ĐÃ SỬA CHUẨN: Phân tách rõ ràng Vỏ bọc (tableView) và Ruột (contentArea)
        let tableView = document.getElementById('ny-table-view');
        let contentArea = document.getElementById('ny-content-area');
        let gridView = document.getElementById('ny-grid-view');
        let btnBack = document.getElementById('ny-btn-back');
        
        // Ẩn vỏ bọc và Xóa sạch ruột
        if (tableView) tableView.style.display = 'none';
        if (contentArea) contentArea.innerHTML = ''; 
        
        if (gridView) gridView.style.display = 'block';
        if (btnBack) btnBack.style.display = 'none';
        
        this.renderLinhVucGrid();
    },

// =======================================================
    // 3. ĐIỀU HƯỚNG GIAO DIỆN & CHỌN LĨNH VỰC (ĐÃ ĐƯỢC KHÔI PHỤC)
    // =======================================================
    resetKioskUI() {
        let searchInput = document.getElementById('ny-search-box');
        if (searchInput) searchInput.value = '';
        
        // Xóa trắng biến nhớ lĩnh vực để thoát trở lại Trang chủ lưới đỏ
        this.activeNyLinhVuc = '';

        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        let detailModal = document.getElementById('procedureDetailModal');
        if (detailModal) detailModal.style.display = 'none';
        
        if (typeof this.filterNyData === 'function') this.filterNyData(); 
    },

    // KHI CÔNG DÂN BẤM VÀO THẺ MÀU ĐỎ
    selectLinhVuc(lv) {
        // Ghi nhớ tên Lĩnh vực vào "não" hệ thống và ra lệnh lọc danh sách
        this.activeNyLinhVuc = lv;
        if (typeof this.filterNyData === 'function') this.filterNyData();
    }

}; // KẾT THÚC KHAI BÁO NYAPP
    
// ===================================================================
// KHIÊN BẢO VỆ CHỐNG SẬP TỐI THƯỢNG (DOM SHIELD)
// ===================================================================
window.UIRenderer = new Proxy({}, { get: () => () => {} }); 

window.app = new Proxy(NyApp, {
    get(target, prop) {
        if (prop in target) return target[prop]; 
        if (['favoriteProcs', 'wizardSelectedFields'].includes(prop)) return [];
        if (prop === 'tableState') return { data: [], filtered: [] };
        return () => { /* Console log if needed */ };
    }
});

// Khởi chạy Kiosk
document.addEventListener("DOMContentLoaded", () => { NyApp.init(); });