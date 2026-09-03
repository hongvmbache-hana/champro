// =========================================
// FILE: js/data-loader.js
// Xử lý đồng bộ, Mapping và chuẩn hóa dữ liệu
// =========================================

// =========================================
// HÀM BỌC THÉP SO SÁNH CHUỖI TIẾNG VIỆT (Khánh Hoà = Khánh Hòa)
// =========================================
window.toSafeKey = function(str) {
    if (!str) return '';
    // Lột sạch dấu, xóa mọi khoảng trắng và đưa về chữ thường
    return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, '');
};

// Hàm so sánh tuyệt đối 2 chuỗi bất chấp dấu
window.isMatch = function(str1, str2) {
    return window.toSafeKey(str1) === window.toSafeKey(str2);
};

// Không gian lưu trữ dữ liệu toàn cục của ứng dụng V2
window.appData = {
    danhSachTinh: [],       // Danh mục các file sheet tỉnh
    cauHinhLink: {},        // Map Lĩnh vực -> Link nộp hồ sơ (Yêu cầu 3.b)
    iconLinhVuc: {},        // BỔ SUNG: Nơi chứa link Icon của từng Lĩnh vực
    tacNghiepChung: [],     // Danh mục phần mềm dùng chung
    tacNghiepRieng: [],     // Danh mục link phần mềm đè theo tỉnh (Yêu cầu 4)
    huongDanData: [],       // BỔ SUNG DÒNG NÀY
    fullDatabase: [],       // Dữ liệu thủ tục tổng hợp
    favoriteProvince: localStorage.getItem('favProvince') || '',
    isLoaded: false
};

const DataLoader = {
    // Hàm tải dữ liệu CSV qua PapaParse
    async fetchCSV(url) {
        if (!url || url.includes("LINK_CSV_TAB")) return [];
        try {
            const cacheBuster = url.includes('?') ? `&_t=${new Date().getTime()}` : `?_t=${new Date().getTime()}`;
            const response = await fetch(url + cacheBuster, { cache: 'no-store' });
            if (!response.ok) return [];
            const text = await response.text();
            
            return new Promise((resolve) => {
                Papa.parse(text, {
                    header: true, 
                    skipEmptyLines: true,
                    complete: function(results) { resolve(results.data); },
                    error: function() { resolve([]); }
                });
            });
        } catch (error) {
            console.error("Lỗi tải data từ:", url, error);
            return [];
        }
    },

    // BỘ NHỚ TẠM ĐỂ CACHE TÊN CỘT (Tránh việc phải chạy Regex 30.000 lần)
    headerCache: {}, 

    // Hàm nhận diện và làm sạch Key Header (Đã tối ưu CPU bằng thuật toán Memoization)
    normalizeRowKeys(row) {
        let cleanRow = {};
        
        Object.keys(row).forEach(k => {
            // NẾU TÊN CỘT NÀY CHƯA TỪNG ĐƯỢC XỬ LÝ -> ĐEM ĐI XÓA DẤU VÀ LƯU VÀO CACHE
            if (!this.headerCache[k]) {
                let simplifiedK = k.replace(/^[\uFEFF]/, '').normalize('NFC').replace(/\s/g, '').toLowerCase();
                let std = simplifiedK;
                
                // Nhận diện theo tên cột (Header-based Mapping)
                if(simplifiedK === 'tentinh' || simplifiedK === 'têntỉnh') std = 'TenTinh';
                else if(simplifiedK === 'tenmien' || simplifiedK === 'tênmiền') std = 'TenMien';
                else if(simplifiedK === 'linhvuc' || simplifiedK === 'lĩnhvực') std = 'LinhVuc';
                else if(simplifiedK === 'madvc' || simplifiedK === 'mãdvc') std = 'MaDVC';
                else if(simplifiedK === 'tendvc' || simplifiedK === 'têndvc') std = 'TenDVC';
                else if(simplifiedK === 'macqth' || simplifiedK === 'mãcqth' || simplifiedK === 'macoquanthuchien') std = 'MaCQTH';
                else if(simplifiedK === 'tencqth' || simplifiedK === 'têncqth' || simplifiedK === 'tencoquanthuchien') std = 'TenCQTH';
                else if(simplifiedK === 'matthc' || simplifiedK === 'mãtthc') std = 'MaTTHC';
                else if(simplifiedK === 'matthcdp' || simplifiedK === 'mãtthcdp') std = 'MaTTHCDP';
                else if(simplifiedK === 'loaihethong' || simplifiedK === 'loạihệthống' || simplifiedK === 'loaihethongxuly' || simplifiedK === 'loạihệthốngxửlý') std = 'LoaiHeThong';
                
                // Quét tìm thời gian cập nhật
                let normK = k.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                let isTime = normK.includes('cap nhat luc') || normK.includes('cap nhat');
                
                // Lưu kết quả vào Cache
                this.headerCache[k] = { std: std, isTime: isTime };
            }
            
            // LẤY KẾT QUẢ TỪ CACHE RA DÙNG (Tốc độ ánh sáng, bỏ qua toàn bộ vòng lặp Regex)
            let mapInfo = this.headerCache[k];
            
            if (mapInfo.isTime) {
                cleanRow['ThoiGianCapNhat'] = k.trim(); 
            }
            cleanRow[mapInfo.std] = row[k] ? row[k].trim() : ''; 
        });
        
        return cleanRow;
    },

    // Tải cấu hình từ Sheet Trung tâm (Master Sheet)
    // Tải cấu hình từ Sheet Trung tâm (Master Sheet)
    async loadMasterConfig() {
        const [tinhData, linkData, urlData, tnChungData, tnRiengData, hdData] = await Promise.all([
            this.fetchCSV(CONFIG.URL_DANH_SACH_TINH),
            this.fetchCSV(CONFIG.URL_CAU_HINH_LINK),
            this.fetchCSV(CONFIG.URL_CAU_HINH_URL), 
            this.fetchCSV(CONFIG.URL_TAC_NGHIEP_CHUNG),
            this.fetchCSV(CONFIG.URL_TAC_NGHIEP_RIENG),
            this.fetchCSV(CONFIG.URL_HUONG_DAN) // Kéo data Video về
        ]);

        window.appData.danhSachTinh = tinhData;
        window.appData.tacNghiepChung = tnChungData;
        window.appData.tacNghiepRieng = tnRiengData;
        window.appData.huongDanData = hdData; // Gắn data Video vào hệ thống
        
        // 1. Map Lĩnh Vực -> Tên Hệ Thống VÀ Lĩnh Vực -> Icon
        window.appData.cauHinhLink = {};
        window.appData.iconLinhVuc = {}; // Reset rỗng
        
        linkData.forEach(row => {
            if (row.LinhVuc && row.TenHeThong) {
                let lvKey = row.LinhVuc.normalize('NFC').trim().toUpperCase();
                window.appData.cauHinhLink[lvKey] = row.TenHeThong.trim();
                
                // Thuật toán quét cột Icon (Bất chấp chữ hoa/thường)
                let iconKey = Object.keys(row).find(k => k.toLowerCase().includes('icon'));
                if (iconKey && row[iconKey]) {
                    window.appData.iconLinhVuc[lvKey] = row[iconKey].trim();
                }
            }
        });

        // 2. Map Tên Hệ Thống -> Cấu trúc URL
        window.appData.danhMucURL = {};
        urlData.forEach(row => {
            if (row.TenHeThong) {
                let key = row.TenHeThong.trim();
                window.appData.danhMucURL[key] = {
                    TenMien: row.TenMien ? row.TenMien.trim() : '',
                    LinkMau: row.LinkMau ? row.LinkMau.trim() : ''
                };
            }
        });
    },

   // Tải dữ liệu các Tỉnh dựa trên cấu hình (ĐÃ TỐI ƯU HÓA: KHÔNG CẦN CỘT TÊN TỈNH)
    // Tải dữ liệu các Tỉnh dựa trên cấu hình (ĐÃ LOẠI BỎ CỘT TENMINH VÀ TENTINH Ở FILE GỐC)
    async loadProvinceData() {
        let tempDatabase = [];
        let favProv = window.appData.favoriteProvince;
        let provincesToFetch = [];

        // 1. Lấy danh sách đối tượng Tỉnh cần tải
        if (!favProv) {
            // NẾU CHƯA CHỌN TỈNH -> DỪNG LẠI NGAY LẬP TỨC ĐỂ TRÁNH TẢI TOÀN BỘ 63 TỈNH
            window.appData.fullDatabase = [];
            return;
        }

        // BỌC THÉP: Tìm Tỉnh bất chấp cách gõ dấu
        let provConfig = window.appData.danhSachTinh.find(p => p.TenTinh && window.isMatch(p.TenTinh, favProv));
        if (provConfig && provConfig.LinkCSV) {
            provincesToFetch.push(provConfig);
        }

        // 2. Tải dữ liệu và gắn mác Tên Tỉnh + Tên Miền từ cấu hình trung tâm
        const provincePromises = provincesToFetch.map(async (prov) => {
            const data = await this.fetchCSV(prov.LinkCSV);
            return {
                tenTinhConfig: prov.TenTinh.trim(), // Chỉ lấy tên tỉnh
                data: data
            };
        });
        
        const provincesData = await Promise.all(provincePromises);
        
        provincesData.forEach(provResult => {
            let mappedRows = provResult.data.map(row => this.normalizeRowKeys(row));
            let validRows = mappedRows.filter(row => row['MaDVC'] || row['TenDVC']);
            
            validRows = validRows.map(row => {
                row['TenTinh'] = provResult.tenTinhConfig; // Chốt cứng tên tỉnh từ Config
                if(row['LinhVuc']) {
                    row['LinhVuc'] = row['LinhVuc'].normalize('NFC').trim().toUpperCase();
                } else {
                    row['LinhVuc'] = 'KHÁC';
                }
                return row;
            });
            tempDatabase = tempDatabase.concat(validRows);
        });

        window.appData.fullDatabase = tempDatabase;
        
    },

    // Hàm khởi chạy (Orchestrator)
    async initData(forceRefresh = false) {
        if (forceRefresh) {
            localStorage.removeItem('dvc_v2_cache');
        }

        const cachedData = localStorage.getItem('dvc_v2_cache');
        
        if (cachedData && !forceRefresh) {
            try {
                const parsed = JSON.parse(cachedData);
                if (!parsed.danhMucURL || Object.keys(parsed.danhMucURL).length === 0) {
                    throw new Error("Phát hiện Cache phiên bản cũ, tiến hành tải mới!");
                }
                window.appData.fullDatabase = parsed.fullDatabase;
                window.appData.cauHinhLink = parsed.cauHinhLink;
                window.appData.iconLinhVuc = parsed.iconLinhVuc || {}; // Đọc Icon từ Cache
                window.appData.tacNghiepChung = parsed.tacNghiepChung;
                window.appData.tacNghiepRieng = parsed.tacNghiepRieng;
                // Bổ sung đọc Cache Video (nếu cache cũ chưa có thì trả về mảng rỗng)
                window.appData.huongDanData = parsed.huongDanData || []; 
                // ---- BỔ SUNG 2 DÒNG NÀY ĐỂ ĐỌC DỮ LIỆU ----
                window.appData.danhMucURL = parsed.danhMucURL || {};
                window.appData.danhSachTinh = parsed.danhSachTinh || [];
                window.appData.isLoaded = true;
                                
                return; 
            } catch(e) {
                console.warn("Lỗi đọc cache, đang tải lại từ CSDL...");
            }
        }

        await this.loadMasterConfig();
        
        if (window.appData.danhSachTinh.length === 0) {
            console.error("Vui lòng dán các link CSV thực tế vào file config.js để hệ thống hoạt động.");
            return;
        }

        await this.loadProvinceData();
        window.appData.isLoaded = true;

        // Lưu Cache
        try {
            localStorage.setItem('dvc_v2_cache', JSON.stringify({
                fullDatabase: window.appData.fullDatabase,
                cauHinhLink: window.appData.cauHinhLink,
                iconLinhVuc: window.appData.iconLinhVuc, // Lưu Icon vào Cache
                tacNghiepChung: window.appData.tacNghiepChung,
                tacNghiepRieng: window.appData.tacNghiepRieng,
                huongDanData: window.appData.huongDanData, // Lưu Cache Video
                danhMucURL: window.appData.danhMucURL,
                danhSachTinh: window.appData.danhSachTinh
            }));
        } catch (e) {}
    }
};