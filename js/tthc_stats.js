// =========================================================================
// BỘ MÁY XỬ LÝ THỐNG KÊ BIẾN ĐỘNG THỦ TỤC HÀNH CHÍNH (SMART CHANGELOG)
// =========================================================================
const TTHC_App = {
    includeNoiBo: true, // MẶC ĐỊNH BẬT: Đếm cả TTHC Nội bộ
    changelogData: {},
    currentFluctuations: { new: [], amended: [], abolished: [] },
    currentStatsData: { total: [], tinh: [], xa: [] }, // BỘ NHỚ LƯU DANH SÁCH HIỆN TRẠNG MỚI THÊM

    async init() {
        try {
            // 1. Lấy thông tin thời gian cập nhật mới nhất từ version.json
            fetch('https://raw.githubusercontent.com/ChippedTopaz/am-sieu-toc-data/data/version.json?t=' + new Date().getTime())
                .then(res => res.json())
                .then(data => {
                    if(data && data.last_updated) {
                        let d = new Date(data.last_updated);
                        document.getElementById('tthc-last-update-time').innerText = d.toLocaleTimeString('vi-VN') + ' ngày ' + d.toLocaleDateString('vi-VN');
                    }
                }).catch(e => console.log("Không tải được version.json"));

            // 2. Tải cuốn sổ nhật ký changelog.json
            let resLog = await fetch('https://raw.githubusercontent.com/ChippedTopaz/am-sieu-toc-data/data/version/changelog.json?t=' + new Date().getTime());
            if (resLog.ok) {
                this.changelogData = await resLog.json();
            }

            // 3. Gọi hàm đổ số liệu Hiện trạng và Biến động (mặc định Tháng này)
            this.updateCurrentStats();
            this.loadFluctuations();

        } catch (error) {
            console.error("Lỗi khởi tạo TTHC_App:", error);
        }
    },

    // --- CẬP NHẬT TIỂU MỤC A: HIỆN TRẠNG (Đồng bộ 100% với hàm filterTableData) ---
    updateCurrentStats() {
        this.currentStatsData = { total: [], tinh: [], xa: [] };
        let data = this.tableState ? this.tableState.data : (window.app ? window.app.tableState.data : []);
        // Dự phòng nếu chưa có biến định dạng sẵn từ main.js
        if (!data || data.length === 0) {
           data = window.appData.masterDatabase || [];
        }
        
        let removeAccents = (str) => str ? str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';
        let currentProvClean = removeAccents(window.appData.favoriteProvince || '').replace(/tinh |thanh pho /g, '').trim();

        let total = 0;
        let capTinh = 0;
        let capXa = 0;

        data.forEach(item => {
            // --- CHỐT CHẶN: LOẠI BỎ TTHC NỘI BỘ (Có điều kiện) ---
        let loaiTTHC = (item.loai_tthc || item.loaiTTHC || item.type || '').toString().toLowerCase();
        // Nếu công tắc đang TẮT (!this.includeNoiBo) VÀ là TTHC nội bộ thì mới bỏ qua
        if (!this.includeNoiBo && loaiTTHC.includes('nội bộ')) return;
            // Nếu data là từ masterDatabase (chưa qua chuẩn hóa của initTableData)
            let cqcb = item.cqcb ? item.cqcb : (item.co_quan_cong_bo || '');
            let cap = item.cap ? item.cap : '';
            let isVertical = item.isVertical;

            if (!cap) {
               let capStr = (item.cap_thuc_hien || item.capThucHien || '').toLowerCase();
               let capArr = []; 
               if (capStr.includes('cấp bộ') || capStr.includes('ngang bộ') || item.isMinistry === true) capArr.push('Bộ');
               if (capStr.includes('tỉnh') || capStr.includes('thành phố trực thuộc') || item.isProvince === true) capArr.push('Tỉnh'); 
               if (capStr.includes('xã') || capStr.includes('phường') || item.isWard === true) capArr.push('Xã');
               cap = capArr.join(', ');
            }
            
            if(isVertical === undefined) {
               if ('nganh_doc' in item) {
                   isVertical = item.nganh_doc === true || String(item.nganh_doc).toLowerCase() === 'true';
               } else {
                   isVertical = false;
               }
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

            // BỘ LỌC CỐT LÕI (Copy y hệt từ filterTableData)
            let cqcbClean = removeAccents(cqcb).toLowerCase();
            let isCurrentProv = currentProvClean !== "" && cqcbClean.includes(currentProvClean);
            let isOtherProv = !isCurrentProv && (
                cqcbClean.includes('ubnd') || 
                cqcbClean.includes('uy ban nhan dan') || 
                cqcbClean.includes('tinh ') || 
                cqcbClean.includes('thanh pho ')
            );

            let isMinistry = !isCurrentProv && !isOtherProv;
            
            // Chốt chặn 1: Loại bỏ tỉnh khác
            if (isOtherProv) return; 

            // Chốt chặn 2: Áp dụng công thức Thống kê
            let isValidList = (isMinistry && !isVertical) || isCurrentProv;
            if (!isValidList) return;

            // Chốt chặn 3: Phải có thực hiện ở Cấp Tỉnh hoặc Xã
            if (!cap.includes('Tỉnh') && !cap.includes('Xã')) return;

            // Vượt qua chốt chặn -> Nhét dữ liệu vào mảng tổng số
            this.currentStatsData.total.push(item);

            // Bóc tách nhét vào cấp tương ứng
            if (cap.includes('Tỉnh')) this.currentStatsData.tinh.push(item);
            if (cap.includes('Xã')) this.currentStatsData.xa.push(item);
        });

        // Đổ số liệu ra thẻ
        const animCounter = (id, val) => {
            let el = document.getElementById(id);
            if (el) el.innerText = val.toLocaleString('vi-VN');
        };
        
        animCounter('tthc-stat-total', this.currentStatsData.total.length); 
        animCounter('tthc-stat-tinh', this.currentStatsData.tinh.length);
        animCounter('tthc-stat-xa', this.currentStatsData.xa.length);
    },

    // --- CẬP NHẬT TIỂU MỤC B: BIẾN ĐỘNG (Lọc & Cộng dồn theo thời gian) ---
    loadFluctuations() {
        let filter = document.getElementById('tthc-time-filter').value;
        let scopeFilter = document.getElementById('tthc-scope-filter') ? document.getElementById('tthc-scope-filter').value : 'tinh'; // Nhận diện bộ lọc Phạm vi
        
        let today = new Date();
        today.setHours(0, 0, 0, 0); 
        let startDate = new Date(0); // Mặc định là Toàn bộ lịch sử
        
        // Thuật toán xác định mốc thời gian
        if (filter === 'today') {
            startDate = new Date(today);
        } else if (filter === 'week') {
            let day = today.getDay(), diff = today.getDate() - day + (day === 0 ? -6 : 1);
            startDate = new Date(today.getFullYear(), today.getMonth(), diff);
        } else if (filter === 'month') {
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        } else if (filter === 'quarter') {
            let quarter = Math.floor(today.getMonth() / 3);
            startDate = new Date(today.getFullYear(), quarter * 3, 1);
        } else if (filter === 'year') {
            startDate = new Date(today.getFullYear(), 0, 1);
        }

        let newArr = [], amendedArr = [], abolishedArr = [];

        let removeAccents = (str) => str ? str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';
        let currentProvClean = removeAccents(window.appData.favoriteProvince || '').replace(/tinh |thanh pho /g, '').trim();

        // ========================================================
        // HÀM LỌC "3 PHỄU" CHUẨN XÁC THEO CẤP TỈNH VÀ TOÀN QUỐC
        // ========================================================
        let isMatchProv = (item) => {
            // PHỄU 1 (CHUNG): Tôn trọng công tắc TTHC Nội bộ
            let loaiTTHC = (item.loai_tthc || item.loaiTTHC || item.type || '').toString().toLowerCase();
            if (!this.includeNoiBo && loaiTTHC.includes('nội bộ')) return false;

            // NẾU CHỌN TOÀN QUỐC: Chỉ lọc thời gian và nội bộ, thả cửa các Tỉnh khác và Ngành dọc!
            if (scopeFilter === 'toanquoc') return true;

            // TỪ ĐÂY CHỈ ÁP DỤNG KHI CHỌN "TỈNH/THÀNH PHỐ"
            if (!currentProvClean) return true; // Chưa chọn tỉnh thì đếm hết (fallback an toàn)

            let cqcbClean = removeAccents(item.co_quan_cong_bo || '').toLowerCase();
            let isCurrentProv = cqcbClean.includes(currentProvClean);
            let isOtherProv = !isCurrentProv && (
                cqcbClean.includes('ubnd') || cqcbClean.includes('uy ban nhan dan') || 
                cqcbClean.includes('tinh ') || cqcbClean.includes('thanh pho ')
            );

            // PHỄU 2: Lọc Địa lý và Cấp thực hiện
            if (isOtherProv) return false; // Cấm tỉnh khác
            
            let isMinistry = !isCurrentProv && !isOtherProv;
            
            // Xử lý thủ tục của Bộ (Phải có cấp Tỉnh/Xã thực hiện)
            if (isMinistry) {
                let capStr = (item.cap_thuc_hien || item.capThucHien || item.cap || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                let hasCapTinh = capStr.includes('tinh') || capStr.includes('thanh pho truc thuoc') || item.isProvince === true;
                let hasCapXa = capStr.includes('xa') || capStr.includes('phuong') || item.isWard === true;
                
                if (!hasCapTinh && !hasCapXa) return false; // Nếu chỉ có "Cấp Bộ" -> Cút
            }

            // PHỄU 3: Lọc Ngành dọc (Blacklist/Whitelist)
            let isVertical = item.nganh_doc === true || String(item.nganh_doc).toLowerCase() === 'true';
            
            let configVertical = window.isVerticalConfig;
            if (configVertical) {
                let maTTHC = (item.ma_tthc || item.code || '').toString().trim();
                let lvHienTai = (item.linh_vuc || item.linhVuc || '').toString().toLowerCase();
                if (!lvHienTai && item.categoriesDetails && item.categoriesDetails.length > 0) {
                    lvHienTai = item.categoriesDetails[0].name.toLowerCase();
                }
                let cqcbHienTai = (item.co_quan_cong_bo || item.cqcb || item.departmentPromulgateName || '').toString().toLowerCase();

                // Luật 1 & 2: Cứu bằng Whitelist
                if (configVertical.whitelist_codes && configVertical.whitelist_codes.includes(maTTHC)) {
                    isVertical = false;
                } else if (configVertical.whitelist_domains && configVertical.whitelist_domains.some(rule => {
                    let ruleLv = (rule.linh_vuc || '').toLowerCase();
                    let ruleCqcb = (rule.co_quan_cong_bo || '').toLowerCase();
                    return lvHienTai.includes(ruleLv) && cqcbHienTai.includes(ruleCqcb);
                })) {
                    isVertical = false;
                }
                // Luật 3 & 4: Chặn bằng Blacklist
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

            // Chốt hạ: Của Bộ nhưng bị gắn nhãn Ngành dọc -> Bỏ
            if (isMinistry && isVertical) return false;
            
            return true; // Vượt 3 phễu -> Giữ lại
        };

        // Quét toàn bộ cuốn sổ Changelog
        for (let dateStr in this.changelogData) {
            let logDate = new Date(dateStr);
            logDate.setHours(0,0,0,0);

            // Nếu ngày ghi sổ nằm trong khoảng thời gian đang lọc
            if (logDate >= startDate) {
                let log = this.changelogData[dateStr];
                if (log.new) log.new.forEach(item => { if(isMatchProv(item)) newArr.push(item); });
                if (log.amended) log.amended.forEach(item => { if(isMatchProv(item)) amendedArr.push(item); });
                if (log.abolished) log.abolished.forEach(item => { if(isMatchProv(item)) abolishedArr.push(item); });
            }
        }

        // THUẬT TOÁN KHỬ TRÙNG LẶP: Đảm bảo 1 mã TTHC chỉ xuất hiện 1 lần trong 1 danh sách
        let dedup = (arr) => {
            let map = new Map();
            arr.forEach(item => map.set(item.ma_tthc, item));
            return Array.from(map.values());
        };

        this.currentFluctuations.new = dedup(newArr);
        this.currentFluctuations.amended = dedup(amendedArr);
        this.currentFluctuations.abolished = dedup(abolishedArr);

        // Hiển thị số liệu lên 3 thẻ (Có định dạng dấu chấm hàng nghìn)
        let elNew = document.getElementById('tthc-stat-new');
        let elAmended = document.getElementById('tthc-stat-amended');
        let elAbolished = document.getElementById('tthc-stat-abolished');
        
        if(elNew) elNew.innerText = this.currentFluctuations.new.length.toLocaleString('vi-VN');
        if(elAmended) elAmended.innerText = this.currentFluctuations.amended.length.toLocaleString('vi-VN');
        if(elAbolished) elAbolished.innerText = this.currentFluctuations.abolished.length.toLocaleString('vi-VN');
    },

    // Biến lưu trạng thái đang xem loại nào (để Excel biết mà tải)
    currentViewType: '',

    // --- HIỂN THỊ POPUP DANH SÁCH CHI TIẾT ---
    showDetailList(type) {
        let typeNames = {
            'new': 'BAN HÀNH MỚI',
            'amended': 'SỬA ĐỔI - BỔ SUNG',
            'abolished': 'BÃI BỎ'
        };
        
        let data = this.currentFluctuations[type] || [];
        if (data.length === 0) {
            alert(`Không có thủ tục nào ${typeNames[type]} trong kỳ thống kê này!`);
            return;
        }

        this.currentViewType = type;
        
        // Đổi tên tiêu đề Modal
        let timeFilterName = document.getElementById('tthc-time-filter').options[document.getElementById('tthc-time-filter').selectedIndex].text;
        document.getElementById('tthc-modal-title').innerHTML = `<i class="fa-solid fa-list-check" style="color: #0284c7; margin-right: 8px;"></i> DANH SÁCH TTHC ${typeNames[type]} (${timeFilterName.toUpperCase()})`;

        // Cấu hình Cột động cuối cùng (Ngày tháng / Nội dung sửa)
        let extraCol = document.getElementById('tthc-modal-col-extra');
        if (type === 'amended') extraCol.innerText = 'Nội dung sửa đổi';
        else if (type === 'new') extraCol.innerText = 'Ngày ban hành';
        else extraCol.innerText = 'Ngày bãi bỏ';

        // Đổ dữ liệu vào bảng
        let html = '';
        data.forEach((item, index) => {
            let extraValue = '';
            let extraStyle = '';
            
            if (type === 'amended') {
                extraValue = item.noi_dung_sua_doi || '';
                extraStyle = 'color: #d97706; font-weight: 600; font-size: 12.5px;'; // Màu cam nổi bật
            } else if (type === 'new') {
                extraValue = item.ngay_ban_hanh ? item.ngay_ban_hanh.split('-').reverse().join('/') : '';
                extraStyle = 'color: #059669; font-weight: 600;';
            } else {
                extraValue = item.ngay_bai_bo ? item.ngay_bai_bo.split('-').reverse().join('/') : '';
                extraStyle = 'color: #dc2626; font-weight: 600;';
            }

            html += `
                <tr style="border-bottom: 1px solid #e2e8f0; transition: 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 12px; text-align: center; color: #64748b;">${index + 1}</td>
                    <td style="padding: 12px; font-family: monospace; color: #2563eb; font-weight: 700;">${item.ma_tthc || ''}</td>
                    <td style="padding: 12px; line-height: 1.4; font-weight: 500;">${item.ten_tthc || ''}</td>
                    <td style="padding: 12px; color: #475569;">${item.linh_vuc || ''}</td>
                    <td style="padding: 12px; color: #475569;">${item.co_quan_cong_bo || ''}</td>
                    <td style="padding: 12px; ${extraStyle}">${extraValue}</td>
                </tr>
            `;
        });

        document.getElementById('tthc-modal-tbody').innerHTML = html;
        
        // Hiển thị Modal với hiệu ứng Flex
        document.getElementById('tthc-modal').style.display = 'flex';
    },

    // ==============================================================
    // BỘ CÔNG CỤ XUẤT EXCEL CHUYÊN NGHIỆP (CÓ MAP DỮ LIỆU TỪ SHEET)
    // ==============================================================

    // 1. Hàm nội bộ: Xây dựng từ điển Mức độ từ Google Sheet của Tỉnh
    _buildMucDoMap() {
        // Tránh phải tạo lại Map nhiều lần gây nặng máy
        if (this.mucDoMapCache) return this.mucDoMapCache;
        
        let provData = (window.appData && window.appData.fullDatabase) ? window.appData.fullDatabase : [];
        let mucDoMap = new Map();

        provData.forEach(item => {
            if (!item) return;
            let cleanKey = (k) => k.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
            
            // Tìm cột Mã TTHC
            let maKey = Object.keys(item).find(k => cleanKey(k).includes('matthc') || cleanKey(k).includes('madvc'));
            let maVal = maKey ? (item[maKey] || '').toString().trim() : '';
            if(!maVal) return;

            // Xử lý mã gốc (cắt đuôi nếu có)
            let maClean = maVal.replace(/'/g, '');
            let maGoc = maClean;
            let parts = maClean.split('.');
            if (parts.length >= 3) maGoc = parts[0] + '.' + parts[1];

            // Tìm cột Mức độ
            let finalMucDo = 'Chưa cung cấp DVC';
            let mucDoKey = Object.keys(item).find(k => cleanKey(k).includes('mucdo'));
            if (mucDoKey) {
                let mdVal = (item[mucDoKey] || '').toString().toLowerCase();
                if (mdVal.includes('toàn trình') || mdVal.includes('toantrinh') || mdVal === '4') finalMucDo = 'Toàn trình';
                else if (mdVal.includes('một phần') || mdVal.includes('motphan') || mdVal === '3') finalMucDo = 'Một phần';
            }

            // Ghi vào từ điển
            if (!mucDoMap.has(maGoc)) mucDoMap.set(maGoc, finalMucDo);
            else if (finalMucDo === 'Toàn trình' && mucDoMap.get(maGoc) !== 'Toàn trình') mucDoMap.set(maGoc, 'Toàn trình'); 
        });

        this.mucDoMapCache = mucDoMap;
        return mucDoMap;
    },

    // 2. Hàm xử lý xuất Excel cho khối BIẾN ĐỘNG
    exportExcel() {
        let type = this.currentViewType;
        if (!type) return;
        let data = this.currentFluctuations[type] || [];
        if (data.length === 0) return;

        let mucDoMap = this._buildMucDoMap(); // Gọi từ điển Mức độ
        let typeNames = { 'new': 'BanHanhMoi', 'amended': 'SuaDoiBoSung', 'abolished': 'BaiBo' };
        let extraColName = type === 'amended' ? 'Nội dung sửa đổi' : (type === 'new' ? 'Ngày ban hành' : 'Ngày bãi bỏ');

        let exportData = data.map((item, index) => {
            let extraValue = '';
            if (type === 'amended') extraValue = item.noi_dung_sua_doi || '';
            else if (type === 'new') extraValue = item.ngay_ban_hanh ? item.ngay_ban_hanh.split('-').reverse().join('/') : '';
            else extraValue = item.ngay_bai_bo ? item.ngay_bai_bo.split('-').reverse().join('/') : '';

            let capStr = item.cap || '';
            if (!capStr) {
                let tempArr = [];
                let rawCap = (item.cap_thuc_hien || item.capThucHien || '').toLowerCase();
                if (rawCap.includes('bộ') || item.isMinistry) tempArr.push('Cấp Bộ');
                if (rawCap.includes('tỉnh') || item.isProvince) tempArr.push('Cấp Tỉnh');
                if (rawCap.includes('xã') || item.isWard) tempArr.push('Cấp Xã');
                capStr = tempArr.join(', ');
            }

            // Đối chiếu Mức độ DVC
            let maTTHC = (item.ma_tthc || item.maTTHC || item.code || '').toString().trim();
            let maGoc = maTTHC;
            let parts = maTTHC.split('.');
            if (parts.length >= 3) maGoc = parts[0] + '.' + parts[1];
            let mucDo = mucDoMap.get(maGoc) || 'Chưa cung cấp DVC';

            return {
                "STT": index + 1,
                "Mã TTHC": maTTHC,
                "Tên Thủ tục hành chính": (item.ten_tthc || item.tenTTHC || item.name || '').toString().trim(),
                "Lĩnh vực": (item.linh_vuc || item.linhVuc || '').toString().trim(),
                "Cơ quan công bố": (item.co_quan_cong_bo || item.cqcb || '').toString().trim(),
                "Loại TTHC": (item.loai_tthc || item.loaiTTHC || '').toString().trim(),
                "Cơ quan thực hiện": (item.co_quan_thuc_hien || item.executingAgencies || item.cqth || '').toString().trim(),
                "Cấp thực hiện": capStr,
                "Mức độ cung cấp": mucDo,
                [extraColName]: extraValue
            };
        });

        this.downloadExcel(exportData, `ThongKe_${typeNames[type]}_${new Date().toISOString().split('T')[0]}`);
    },

    // 3. Hàm xử lý xuất Excel cho khối HIỆN TRẠNG
    exportCurrentStatsExcel(type) {
        let data = this.currentStatsData[type] || [];
        if (data.length === 0) {
            alert("Đang tải dữ liệu hoặc không có thủ tục nào!");
            return;
        }

        if (this.showToast) this.showToast(`Đang kết xuất ${data.length} thủ tục ra Excel...`, 2000);
        let mucDoMap = this._buildMucDoMap(); // Gọi từ điển Mức độ
        let typeNames = { 'total': 'TongSoTTHC', 'tinh': 'CapTinh', 'xa': 'CapXa' };

        let exportData = data.map((item, index) => {
            let capStr = item.cap || '';
            if (!capStr) {
                let tempArr = [];
                let rawCap = (item.cap_thuc_hien || item.capThucHien || '').toLowerCase();
                if (rawCap.includes('bộ') || item.isMinistry) tempArr.push('Cấp Bộ');
                if (rawCap.includes('tỉnh') || item.isProvince) tempArr.push('Cấp Tỉnh');
                if (rawCap.includes('xã') || item.isWard) tempArr.push('Cấp Xã');
                capStr = tempArr.join(', ');
            }

            // Đối chiếu Mức độ DVC
            let maTTHC = (item.ma_tthc || item.maTTHC || item.code || '').toString().trim();
            let maGoc = maTTHC;
            let parts = maTTHC.split('.');
            if (parts.length >= 3) maGoc = parts[0] + '.' + parts[1];
            let mucDo = mucDoMap.get(maGoc) || 'Chưa cung cấp DVC';

            return {
                "STT": index + 1,
                "Mã TTHC": maTTHC,
                "Tên Thủ tục hành chính": (item.ten_tthc || item.tenTTHC || item.name || '').toString().trim(),
                "Lĩnh vực": (item.linh_vuc || item.linhVuc || '').toString().trim(),
                "Cơ quan công bố": (item.co_quan_cong_bo || item.cqcb || '').toString().trim(),
                "Loại TTHC": (item.loai_tthc || item.loaiTTHC || '').toString().trim(),
                "Cơ quan thực hiện": (item.co_quan_thuc_hien || item.executingAgencies || item.cqth || '').toString().trim(),
                "Cấp thực hiện": capStr,
                "Mức độ cung cấp": mucDo
            };
        });

        this.downloadExcel(exportData, `DanhSach_${typeNames[type]}_${new Date().toISOString().split('T')[0]}`);
    },

    // 4. BỘ KẾT XUẤT CÓ ĐỊNH DẠNG ĐỘ RỘNG CỘT (COLUMN WIDTHS)
    downloadExcel(jsonArray, fileName) {
        if (typeof XLSX !== 'undefined') {
            let ws = XLSX.utils.json_to_sheet(jsonArray);
            
            // Cấu hình độ rộng các cột (Tính theo số lượng ký tự)
            let wscols = [
                {wch: 5},   // STT
                {wch: 16},  // Mã TTHC
                {wch: 55},  // Tên TTHC (Kéo rất rộng)
                {wch: 25},  // Lĩnh vực
                {wch: 30},  // CQCB
                {wch: 20},  // Loại TTHC
                {wch: 35},  // CQTH
                {wch: 20},  // Cấp thực hiện
                {wch: 25},  // Mức độ
                {wch: 45}   // Cột Nội dung sửa đổi / Ngày tháng (nếu có)
            ];
            ws['!cols'] = wscols;

            let wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "DanhSach");
            XLSX.writeFile(wb, fileName + '.xlsx');
        } 
        else {
            // Fallback: Mở rộng HTML width cho chuẩn nếu không có SheetJS
            let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="utf-8"></head>
            <body>
                <table border="1" style="font-family: Calibri, Arial; font-size: 11pt; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #e2e8f0; font-weight: bold;">`;
            
            let keys = Object.keys(jsonArray[0]);
            let htmlWidths = [40, 100, 450, 200, 250, 150, 250, 150, 200, 350]; // Width tính theo Pixel
            
            keys.forEach((k, idx) => {
                let w = htmlWidths[idx] || 150;
                html += `<th style="width: ${w}px; padding: 5px;">${k}</th>`;
            });
            html += `</tr></thead><tbody>`;

            jsonArray.forEach(row => {
                html += `<tr>`;
                keys.forEach(k => {
                    let val = row[k] || '';
                    if (k === 'Mã TTHC') html += `<td style="mso-number-format:'\\@'; padding: 5px;">${val}</td>`;
                    else html += `<td style="padding: 5px;">${val}</td>`;
                });
                html += `</tr>`;
            });
            html += `</tbody></table></body></html>`;

            let blob = new Blob([html], { type: 'application/vnd.ms-excel' });
            let url = URL.createObjectURL(blob);
            let a = document.createElement('a');
            a.href = url;
            a.download = fileName + '.xls';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    },

    // --- CÔNG TẮC BẬT/TẮT ĐẾM TTHC NỘI BỘ ---
    toggleNoiBo() {
        this.includeNoiBo = !this.includeNoiBo;
        let btn = document.getElementById('btn-toggle-noibo');
        
        if (this.includeNoiBo) {
            btn.style.borderColor = '#10b981';
            btn.style.background = '#ecfdf5';
            btn.style.color = '#10b981';
            btn.innerHTML = `<i class="fa-solid fa-toggle-on" style="font-size: 16px;"></i> <span>Tính cả TTHC Nội bộ</span>`;
        } else {
            btn.style.borderColor = '#cbd5e1';
            btn.style.background = '#f8fafc';
            btn.style.color = '#64748b';
            btn.innerHTML = `<i class="fa-solid fa-toggle-off" style="font-size: 16px;"></i> <span>Bỏ qua TTHC Nội bộ</span>`;
        }
        
        // Cập nhật lại 2 bảng số liệu ngay lập tức
        this.updateCurrentStats();
        this.loadFluctuations();
    },
}; // Kết thúc block const TTHC_App