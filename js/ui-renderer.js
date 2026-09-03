// =========================================
// FILE: js/ui-renderer.js
// Quản lý việc hiển thị (Render) DOM
// =========================================

const UIRenderer = {
    currentLevel: 'linhvuc',
    selectedLinhVuc: '',
    selectedThuTucObj: null,
    selectedTinh: '',
    isSearchFlow: false,

    // BỘ MÁY 1: TẠO REGEX TỪ TỪ KHÓA KHÔNG DẤU ĐỂ TRUY TÌM CHỮ CÓ DẤU
    createHighlightRegex(keyword) {
        if (!keyword) return null;
        let normalizedKeyword = app.removeAccents(keyword.trim().toLowerCase());
        if (!normalizedKeyword) return null;
        
        let chars = normalizedKeyword.split('');
        let pattern = chars.map(c => {
            if (c === 'a') return "[aàáạảãâầấậẩẫăằắặẳẵAÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴ]";
            if (c === 'e') return "[eèéẹẻẽêềếệểễEÈÉẸẺẼÊỀẾỆỂỄ]";
            if (c === 'i') return "[iìíịỉĩIÌÍỊỈĨ]";
            if (c === 'o') return "[oòóọỏõôồốộổỗơờớợởỡOÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]";
            if (c === 'u') return "[uùúụủũưừứựửữUÙÚỤỦŨƯỪỨỰỬỮ]";
            if (c === 'y') return "[yỳýỵỷỹYỲÝỴỶỸ]";
            if (c === 'd') return "[dđDĐ]";
            return c.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); // Bọc lót ký tự đặc biệt
        }).join('');
        
        return new RegExp(`(${pattern})`, 'gi');
    },

    // BỘ MÁY 2: BỌC THẺ MARK VÀO CHUỖI TÌM ĐƯỢC
    highlightText(text) {
        let keyword = document.getElementById('search-box') ? document.getElementById('search-box').value.trim() : '';
        if (!keyword || !this.isSearchFlow) return text; // Chỉ Highlight khi đang ở luồng tìm kiếm
        
        let regex = this.createHighlightRegex(keyword);
        if (!regex) return text;
        
        // Thay thế bằng thẻ mark với tone màu vàng - cam của DVC Quốc gia
        return text.replace(regex, '<mark style="background-color: #fef08a; color: #854d0e; padding: 0 2px; border-radius: 3px; font-weight: bold;">$1</mark>');
    },
  

    // [YÊU CẦU 3.B]: THUẬT TOÁN SINH LINK THEO CẤU HÌNH BỘ HOẶC TỈNH
   // [YÊU CẦU 3.B + CẬP NHẬT LOẠI HỆ THỐNG]: THUẬT TOÁN SINH LINK THEO BỘ/TỈNH
    // THUẬT TOÁN ĐỊNH TUYẾN URL THÔNG MINH
    // THUẬT TOÁN ĐỊNH TUYẾN URL THÔNG MINH (XÉT KÉP ĐIỀU KIỆN TỪNG DÒNG)
    generateFinalUrl(coquanObj, procMaDVC) {
        let linhVuc = coquanObj['LinhVuc'] || 'KHÁC';
        let loaiHeThong = (coquanObj['LoaiHeThong'] || '').toLowerCase().trim(); 
        let tenTinh = (coquanObj['TenTinh'] || '').trim();
        let tenCoQuan = (coquanObj['TenCQTH'] || '').trim(); // Lấy tên cơ quan để kiểm tra

        let targetSystem = "";
        if (loaiHeThong.includes('trên hệ thống bộ ngành')) {
            // Quét tìm Lĩnh vực an toàn bất chấp dấu
            for (let key in window.appData.cauHinhLink) {
                if (window.isMatch(key, linhVuc)) {
                    targetSystem = window.appData.cauHinhLink[key];
                    break;
                }
            }
        } else {
            targetSystem = tenTinh; 
        }

        if (!targetSystem) targetSystem = tenTinh;
        
        // Quét tìm URL Config an toàn bất chấp dấu
        let urlConfig = null;
        for (let key in window.appData.danhMucURL) {
            if (window.isMatch(key, targetSystem)) {
                urlConfig = window.appData.danhMucURL[key];
                break;
            }
        }
        if (!urlConfig) return null;

        let linkMau = urlConfig.LinkMau;
        let tenMien = urlConfig.TenMien;
        if (!tenMien.startsWith('http')) tenMien = 'https://' + tenMien;

        let capThucHien = "2"; // Mặc định cấp xã
        let tenCoQuanLower = tenCoQuan.toLowerCase();
        
        // Điều kiện: Có chữ "Sở" VÀ không phải là Phường/Xã/Thị trấn
        let laCapXa = tenCoQuanLower.includes('phường') || tenCoQuanLower.includes('xã') || tenCoQuanLower.includes('đặc khu');
        
        if (tenCoQuanLower.includes('sở') && !laCapXa) {
            capThucHien = "1";
        }

        // Kiểm tra điều kiện riêng cho Bộ Tư pháp và Bộ Dân tộc Tôn giáo
        let isSpecialMinistry = (targetSystem === "Bộ Tư pháp" || targetSystem === "Bộ Dân tộc và Tôn giáo");

        let maTTHC = (coquanObj['MaTTHC'] || '').trim();
        let maCQTH = (coquanObj['MaCQTH'] || '').trim();
        let maTTHCDP = (coquanObj['MaTTHCDP'] || coquanObj['MaTTHC'] || '').trim(); 
        
        // Trích xuất biến PID từ data (nếu ô rỗng thì trả về chuỗi rỗng)
        let pid = (coquanObj['pid'] || coquanObj['PID'] || '').toString().trim();
        console.log("Dữ liệu của thủ tục này là:", coquanObj, "Mã PID hệ thống đang hiểu là:", pid);

        if (!maTTHC || !maCQTH) return null;

        let finalUrl = linkMau
            .replace(/{TenMien}/gi, tenMien)
            .replace(/{MaTTHC}/gi, maTTHC)
            .replace(/{MaCQTH}/gi, maCQTH)
            .replace(/{MaCoQuanThucHien}/gi, maCQTH)
            .replace(/{MaDVC}/gi, procMaDVC)
            .replace(/{MaTTHCDP}/gi, maTTHCDP)
            .replace(/{TenTinh}/gi, tenTinh)
            .replace(/{pid}/gi, pid); // Bổ sung thay thế PID

        // Bổ sung tham số CapThucHien nếu là bộ đặc thù
        if (isSpecialMinistry) {
            // Nếu link mẫu đã có sẵn tham số CapThucHien thì thay thế, chưa có thì nối đuôi
            if (finalUrl.includes('CapThucHien=')) {
                finalUrl = finalUrl.replace(/CapThucHien=\d+/gi, 'CapThucHien=' + capThucHien);
            } else {
                finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'CapThucHien=' + capThucHien;
            }
        }

        // XỬ LÝ NGOẠI LỆ CHO THỪA THIÊN HUẾ (Bọc thép 100%):
        // Nếu link sinh ra có chứa tên miền của Huế MÀ biến pid lại rỗng
        if (finalUrl.includes('dichvucong.hue.gov.vn') && pid === '') {
            finalUrl = `https://dichvucong.gov.vn/p/home/dvc-chi-tiet-thu-tuc-hanh-chinh.html?ma_thu_tuc=${procMaDVC}`;
        }

        return finalUrl;
    }, // (Dấu ngoặc đóng của hàm)

    // ==============================================================
    // CÁC HÀM RENDER DỊCH VỤ CÔNG (Giữ nguyên cấu trúc HTML để khớp CSS cũ)
    // ==============================================================
    renderLinhVuc() {
        this.isSearchFlow = false;
        this.currentLevel = 'linhvuc';
        app.showDVCLayout();
        document.getElementById('search-box').value = '';
        this.updateBreadcrumb(); 
        
        let container = document.getElementById('content-grid');
        container.className = 'grid-container'; 
        container.innerHTML = '';
        
        let danhSachLinhVucGoc = [...new Set(window.appData.fullDatabase.map(item => item['LinhVuc']))];
        let favFields = app.wizardSelectedFields || [];
        
        // NẾU KHÔNG CHỌN LĨNH VỰC NÀO -> HIỂN THỊ KHỐI THÔNG BÁO GỌN GÀNG HƠN
        if (favFields.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding: 25px 20px; background: var(--card-bg); border-radius: 8px; border: 1px dashed var(--border-color); box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                    <div style="color: #64748b; font-size: 15px; margin-bottom: 5px;">Bạn chưa cấu hình Lĩnh vực yêu thích nào</div>
                    <div style="color: var(--text-color); font-weight: 600; font-size: 14px;">Bạn vẫn có thể tìm kiếm thủ tục bằng tên/mã, hoặc bấm nút "Cấu hình" ở thanh menu góc trên!</div>
                </div>`;
        } else {
            // NẾU CÓ CHỌN THÌ CHỈ HIỂN THỊ ĐÚNG CÁC LĨNH VỰC ĐÃ CHỌN
            let danhSachLinhVuc = danhSachLinhVucGoc.filter(lv => favFields.includes(lv)).sort((a, b) => a.localeCompare(b, 'vi'));
            
            danhSachLinhVuc.forEach(lv => {
                let iconData = window.appData.iconLinhVuc[lv] || "fa-solid fa-layer-group"; 
                container.appendChild(this.createCard(lv, "", iconData, "#8b5cf6", () => this.renderThuTucByLinhVuc(lv), iconData.includes('.')));
            });
        }
        
        app.focusSearchBox();
        app.renderFavorites();
    },

    renderThuTucByLinhVuc(lv) {
        this.currentLevel = 'thutuc'; 
        this.selectedLinhVuc = lv; 
        document.getElementById('search-box').value = ''; 
        this.updateBreadcrumb();
        
        let container = document.getElementById('content-grid');
        container.className = 'list-container'; container.innerHTML = '';
        
        let dbLinhVuc = window.appData.fullDatabase.filter(item => item['LinhVuc'] === lv);
        
        if (window.appData.favoriteProvince) {
            let dbLinhVucTheoTinh = dbLinhVuc.filter(item => item['TenTinh'] === window.appData.favoriteProvince);
            if (dbLinhVucTheoTinh.length > 0) dbLinhVuc = dbLinhVucTheoTinh;
        }

        let danhSachTTHC_DuyNhat = []; 
        let seenMaDVC = new Set();
        
        dbLinhVuc.forEach(item => {
            let maDVC = item['MaDVC'].trim();
            if (maDVC && !seenMaDVC.has(maDVC)) {
                seenMaDVC.add(maDVC);
                // ĐÃ BỔ SUNG TenTinh
                danhSachTTHC_DuyNhat.push({ TenDVC: item['TenDVC'], MaDVC: maDVC, TenTinh: item['TenTinh'] });
            }
        });
                
        danhSachTTHC_DuyNhat.sort((a, b) => a.TenDVC.trim().localeCompare(b.TenDVC.trim(), 'vi')).forEach(tthcObj => {
            // ĐÃ TRUYỀN THÊM TenTinh
            container.appendChild(this.createProcedureRow(tthcObj.TenDVC, tthcObj.MaDVC, tthcObj.TenTinh));
        });
        app.focusSearchBox();
    },

    renderTinhByThuTuc(procObj) {
        window.scrollTo({
            top: 0,
            behavior: 'smooth' // Tạo hiệu ứng trượt mượt mà lên đầu trang
        });
        this.selectedThuTucObj = procObj; 

        // ==============================================================
        // BƯỚC 3 (HOÀN THIỆN): LOGIC SIÊU TỐC - KIỂM TRA CƠ QUAN MẶC ĐỊNH
        // ==============================================================
        let defaultAgency = window.appData.defaultAgency;
        if (defaultAgency) {
            let dsTheoThuTuc = window.appData.fullDatabase.filter(item => item['MaDVC'] === procObj.MaDVC);
            let matchedItem = null;
            
            // Quét tìm xem thủ tục này có thuộc cơ quan mặc định không
            for (let item of dsTheoThuTuc) {
                if (item['TenCQTH'] && item['TenCQTH'].includes(defaultAgency)) {
                    matchedItem = item;
                    break;
                }
            }

            if (matchedItem) {
                // Ép tham số CQTH theo đúng cơ quan mặc định để sinh link chuẩn xác
                let targetMaCQTH = matchedItem['MaCQTH'];
                let names = matchedItem['TenCQTH'].toString().split(/(?:;|,|\n)/).map(s => s.trim());
                let codes = matchedItem['MaCQTH'].toString().split(/(?:;|,|\n)/).map(s => s.trim());
                
                let idx = names.indexOf(defaultAgency);
                if (idx !== -1 && codes[idx]) {
                    targetMaCQTH = codes[idx];
                }

                // Gán tạm mã cơ quan chuẩn xác vào object và gọi hàm sinh link của anh
                let tempItem = { ...matchedItem, MaCQTH: targetMaCQTH }; 
                let link = this.generateFinalUrl(tempItem, procObj.MaDVC);
                
                // Mở link và kết thúc lệnh ngay lập tức
                app.openProcedureLink(null, link);
                return; // NGẮT HÀM, BAY THẲNG VÀO LINK VÀ KHÔNG VẼ BẢNG CƠ QUAN NỮA
            }
        }
        // ==============================================================
        
        
        let availableProvinces = new Set();
        
        window.appData.fullDatabase.forEach(item => { 
            if (item['MaDVC'] === procObj.MaDVC) availableProvinces.add(item['TenTinh']); 
        });
        
        // NHẢY CÓC: Bỏ qua bước Tỉnh nếu đã cài Tỉnh mặc định
        if (window.appData.favoriteProvince && availableProvinces.has(window.appData.favoriteProvince)) {
            this.renderCoQuanByTinh(window.appData.favoriteProvince);
            return;
        }

        this.currentLevel = 'tinh'; 
        document.getElementById('search-box').value = ''; 
        this.updateBreadcrumb();
        
        let container = document.getElementById('content-grid');
        container.className = 'grid-container'; container.innerHTML = '';
        
        Array.from(availableProvinces).sort((a, b) => a.localeCompare(b, 'vi')).forEach(tinh => {
            container.appendChild(this.createCard(tinh, "", "fa-solid fa-map-location-dot", "#10b981", () => this.renderCoQuanByTinh(tinh)));
        });
        app.focusSearchBox();
    },

    renderCoQuanByTinh(tinh) {
        this.currentLevel = 'coquan'; 
        this.selectedTinh = tinh; 
        document.getElementById('search-box').value = ''; 
        this.updateBreadcrumb();
        
        let container = document.getElementById('content-grid');
        container.className = ''; container.innerHTML = '';
        
        let coquans = window.appData.fullDatabase.filter(item => item['TenTinh'] === tinh && item['MaDVC'] === this.selectedThuTucObj.MaDVC);
        
        // HÀM LỘT VỎ TÊN ĐỊA DANH (Bảo toàn nguyên bản V1)
        function getCleanName(name) {
            return name.replace(/^(UBND phường|UBND xã|UBND thị trấn|UBND|Ủy ban nhân dân phường|Ủy ban nhân dân xã|Ủy ban nhân dân thị trấn|Ủy ban nhân dân|Xã|Phường|Thị trấn|Chi nhánh văn phòng đăng ký đất đai|Chi nhánh VPĐKĐĐ|Chi nhánh)\s+/i, '').trim();
        }
        function getSortLetter(name) {
            let letter = getCleanName(name).charAt(0).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/Đ/g, "D");
            return /[A-Z]/.test(letter) ? letter : "#"; 
        }

        let groupedCoquans = {};
        coquans.forEach(coquan => {
            let letter = getSortLetter(coquan['TenCQTH']);
            if (!groupedCoquans[letter]) groupedCoquans[letter] = [];
            groupedCoquans[letter].push(coquan);
        });

        Object.keys(groupedCoquans).sort().forEach(letter => {
            let groupDiv = document.createElement('div');
            groupDiv.className = 'cq-group';
            groupDiv.innerHTML = `<div class="cq-letter-title">${letter}</div>`;
            
            let gridDiv = document.createElement('div');
            gridDiv.className = 'cq-grid';

            groupedCoquans[letter].sort((a, b) => getCleanName(a['TenCQTH']).localeCompare(getCleanName(b['TenCQTH']), 'vi')).forEach(coquan => {
                let tenCQ = coquan['TenCQTH'];
                let maCQ = coquan['MaCQTH'];
                let finalUrl = this.generateFinalUrl(coquan, this.selectedThuTucObj.MaDVC);
                
                let favId = this.selectedThuTucObj.MaDVC + "_" + maCQ;
                let isFav = app.favoriteProcs.some(f => f.id === favId);
                let starClass = isFav ? "btn-star active" : "btn-star";
                
                let safeTenThuTuc = this.selectedThuTucObj.TenDVC.replace(/[\r\n]+/g, ' ').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                let safeTenCoQuan = tenCQ.replace(/[\r\n]+/g, ' ').replace(/'/g, "\\'").replace(/"/g, '&quot;');

                // ÁP DỤNG HIGHLIGHT CHO TÊN VÀ MÃ CƠ QUAN HIỂN THỊ
                let displayTenCQ = this.highlightText(tenCQ.replace(/[\r\n]+/g, ' '));
                let displayMaCQ = this.highlightText(maCQ);

                let row = document.createElement('div');
                row.className = 'list-row search-item';
                row.innerHTML = `
                    <div class="row-content" onclick="app.openProcedureLink(event, '${finalUrl}')" style="cursor:pointer; flex: 1;">
                        <div class="row-title">${displayTenCQ}</div>
                        <div class="row-badge">Mã CQ: ${displayMaCQ}</div>
                    </div>
                    <div class="list-row-actions">
                        <button class="btn-copy-info" onclick="app.copyProcInfo(event, '${safeTenThuTuc}', '${this.selectedThuTucObj.MaDVC}', '${finalUrl}')" title="Copy thông tin">
                            <i class="fa-regular fa-copy"></i>
                        </button>
                        
                        <button class="btn-report-error" onclick="event.stopPropagation(); app.reportBrokenLink('${safeTenThuTuc}', '${this.selectedThuTucObj.MaDVC}', '${finalUrl}')" title="Báo cáo link lỗi">
                            <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i>
                        </button>

                        <button class="${starClass}" onclick="app.toggleFavorite(event, '${favId}', '${safeTenThuTuc}', '${safeTenCoQuan}', '${tinh}', '${finalUrl}')" title="Lưu thủ tục này">
                            <i class="fa-solid fa-star"></i>
                        </button>
                    </div>
                `;
                gridDiv.appendChild(row);
            });   
            groupDiv.appendChild(gridDiv);
            container.appendChild(groupDiv);
        });
        app.focusSearchBox();
    },

    // [YÊU CẦU 4]: RENDER TÁC NGHIỆP CÓ TÍNH NĂNG "ĐÈ LINK" THEO TỈNH
    renderTacNghiep() {
        this.isSearchFlow = false;
        this.currentLevel = 'tacnghiep';
        app.setActiveTab('tacnghiep');

        document.getElementById('content-grid').style.display = 'none';
        document.getElementById('favorites-section').style.display = 'none';
        document.getElementById('donate-section').style.display = 'none';
        document.getElementById('tacnghiep-section').style.display = 'block';

        let searchWrapper = document.querySelector('.search-wrapper');
        if (searchWrapper) {
            searchWrapper.style.display = 'flex';
            document.getElementById('search-box').placeholder = "Tìm kiếm hệ thống tác nghiệp nội bộ...";
            document.getElementById('search-box').value = '';
        }

        this.updateBreadcrumb();

        let container = document.getElementById('tacnghiep-grid');
        if (!container) return;
        container.innerHTML = '';

        // -- TẠO NÚT CÀI ĐẶT --
        let headerDiv = document.createElement('div');
        headerDiv.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 2px solid var(--border-color); padding-bottom: 10px;";
        headerDiv.innerHTML = `
            <h3 style="margin: 0; color: var(--primary-color); font-size: 18px;"><i class="fa-solid fa-server"></i> Danh mục phần mềm</h3>
            <button onclick="app.openTnConfig()" style="background: var(--card-bg); border: 1px solid var(--border-color); padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; color: var(--text-color); transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <i class="fa-solid fa-sliders" style="color: var(--primary-color);"></i> Tùy chỉnh hiển thị
            </button>
        `;
        container.appendChild(headerDiv);

        let currentProv = window.appData.favoriteProvince || '';

        let chungData = (window.appData.tacNghiepChung || []).map(item => ({...item, LinkDich: item['Link'] || item['LinkDacThu'] || ''}));
        // BỌC THÉP: Lọc tác nghiệp riêng khớp tuyệt đối tên Tỉnh
        let riengData = (window.appData.tacNghiepRieng || [])
            .filter(item => window.isMatch(item['TenTinh'], currentProv))
            .map(item => ({...item, LinkDich: item['LinkDacThu'] || item['Link'] || ''}));

        let allData = [...chungData, ...riengData];

        if (allData.length === 0) {
            container.innerHTML += `<div style="text-align:center; padding: 20px; color: #64748b;">Chưa có hệ thống tác nghiệp nào được cấu hình.</div>`;
            return;
        }

        // Gom nhóm dữ liệu
        let groupedData = {};
        allData.forEach(item => {
            let nhom = (item['Nhom'] || 'TÁC NGHIỆP KHÁC').trim().toUpperCase();
            if (!groupedData[nhom]) groupedData[nhom] = [];
            groupedData[nhom].push(item);
        });

        // -- BỘ LỌC 1: ẨN CÁC LINK BỊ TẮT TRONG CẤU HÌNH --
        Object.keys(groupedData).forEach(nhom => {
            groupedData[nhom] = groupedData[nhom].filter(item => {
                let ten = (item['TenHeThong'] || '').trim();
                return !app.hiddenTnItems.includes(ten); // Nếu có tên trong mảng hidden thì loại bỏ
            });
            // Nếu xóa hết link mà nhóm rỗng thì xóa luôn nhóm
            if (groupedData[nhom].length === 0) delete groupedData[nhom];
        });

        // -- BỘ LỌC 2: SẮP XẾP NHÓM THEO TRẬT TỰ ĐÃ LƯU --
        let savedOrder = app.tnGroupOrder || [];
        let sortedGroups = Object.keys(groupedData).sort((a, b) => {
            let idxA = savedOrder.indexOf(a);
            let idxB = savedOrder.indexOf(b);
            
            if (idxA !== -1 && idxB !== -1) return idxA - idxB; // Cả 2 đều có trong cấu hình -> Xếp theo index
            if (idxA !== -1) return -1; // A có, B không có -> A ưu tiên
            if (idxB !== -1) return 1;  // B có, A không có -> B ưu tiên
            return a.localeCompare(b);  // Cả 2 đều mới tinh -> Xếp theo chữ cái (A-Z)
        });

        // Render ra giao diện
        sortedGroups.forEach(nhom => {
            let items = groupedData[nhom].sort((a, b) => {
                let sttA = parseInt(a['ThuTu']) || 999;
                let sttB = parseInt(b['ThuTu']) || 999;
                return sttA - sttB;
            });

            let groupDiv = document.createElement('div');
            groupDiv.className = 'tn-group';

            let groupTitle = document.createElement('div');
            groupTitle.className = 'tn-group-title';
            groupTitle.innerHTML = `<i class="fa-solid fa-layer-group"></i> ${nhom}`;
            groupDiv.appendChild(groupTitle);

            let gridDiv = document.createElement('div');
            gridDiv.className = 'tn-grid';

            items.forEach(item => {
                let tenHeThong = (item['TenHeThong'] || '').trim();
                let link = (item.LinkDich || '').trim();
                
                // BỌC THÉP: Tự động nhận diện và bù giao thức https:// nếu thiếu
                if (link && !link.startsWith('http://') && !link.startsWith('https://')) {
                    link = 'https://' + link;
                }
                
                let icon = (item['Icon'] || 'fa-solid fa-link').trim();

                let card = document.createElement('a');
                card.className = 'tn-card';
                card.href = link;
                card.target = '_blank';
                
                let iconHtml = '';
                if (icon.includes('.')) {
                    iconHtml = `<img src="${icon}" class="tn-icon" alt="icon">`;
                } else {
                    iconHtml = `<div class="tn-icon" style="display:flex; align-items:center; justify-content:center; font-size: 32px; color: var(--primary-color);"><i class="${icon}"></i></div>`;
                }

                card.innerHTML = `
                    ${iconHtml}
                    <div class="tn-text" title="${tenHeThong}">${tenHeThong}</div>
                `;
                gridDiv.appendChild(card);
            });

            groupDiv.appendChild(gridDiv);
            container.appendChild(groupDiv);
        });
        
        app.focusSearchBox();
    },

    // Các hàm Helper tạo Component
    createCard(text, subText, iconData, iconColor, onClickFunc, isImage = false) {
        let card = document.createElement('div');
        card.className = 'card search-item';
        card.onclick = onClickFunc;
        let subTextHtml = subText ? `<div class="card-subtext">${subText}</div>` : '';
        let iconHtml = isImage ? `<img src="${iconData}" alt="${text}" class="custom-img-icon">` : `<i class="${iconData}"></i>`;
        card.innerHTML = `
            <div class="card-left">
                <div class="icon-box" style="color: ${iconColor}; background-color: ${iconColor}20;">${iconHtml}</div>
                <div class="card-content"><div class="card-text">${text}</div>${subTextHtml}</div>
            </div>
            <i class="fa-solid fa-chevron-right card-arrow"></i>
        `;
        return card;
    },

    createProcedureRow(tenDVC, maDVC, tenTinh) {
        // Đảm bảo bắt được Tên Tỉnh (Nếu chưa truyền vào thì dò từ database)
        if (!tenTinh) {
            let procData = window.appData.fullDatabase.find(item => item['MaDVC'] === maDVC);
            tenTinh = procData ? procData['TenTinh'] : window.appData.favoriteProvince || '';
        }

        let favId = window.appData.favoriteProvince ? "PROC_" + maDVC + "_" + window.appData.favoriteProvince : "PROC_" + maDVC;
        let isFav = app.favoriteProcs.some(f => f.id === favId);
        let starClass = isFav ? "btn-star active" : "btn-star";
        
        let safeTenThuTuc = tenDVC.replace(/[\r\n]+/g, ' ').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        let safeTooltip = tenDVC.replace(/[\r\n]+/g, ' ').replace(/"/g, '&quot;');

        let displayTenDVC = this.highlightText(tenDVC.replace(/[\r\n]+/g, ' '));
        let displayMaDVC = this.highlightText(maDVC);

        let procData = window.appData.fullDatabase.find(item => item['MaDVC'] === maDVC);
        let linhVuc = procData ? procData['LinhVuc'] : 'KHÁC';
        let iconData = window.appData.iconLinhVuc[linhVuc] || "fa-solid fa-layer-group";
        
        let iconHtml = iconData.includes('.') 
            ? `<img src="${iconData}" style="width: 24px; height: 24px; object-fit: contain;">` 
            : `<i class="${iconData}" style="font-size: 20px; color: var(--primary-color);"></i>`;

        // Vẽ thêm Tên Tỉnh cho các Row thủ tục
        let tenTinhHtml = tenTinh ? `<i class="fa-solid fa-map-location-dot"></i> ${tenTinh} | ` : '';

        let row = document.createElement('div');
        row.className = 'list-row search-item';
        
        row.innerHTML = `
            <div style="display: flex; align-items: center; cursor: pointer; flex: 1;" onclick="UIRenderer.renderTinhByThuTuc({TenDVC: '${safeTenThuTuc}', MaDVC: '${maDVC}'})">
                <div style="margin-right: 15px; display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; background: rgba(201, 81, 23, 0.1); border-radius: 8px; flex-shrink: 0;">
                    ${iconHtml}
                </div>
                <div class="row-content" style="flex: 1;">
                    <div class="row-title" title="${safeTooltip}" style="display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;">${displayTenDVC}</div>
                    <div class="row-badge">${tenTinhHtml}Mã DVC: ${displayMaDVC}</div>
                </div>
            </div>

            <div class="list-row-actions">
                <button class="${starClass}" onclick="app.toggleFavProcedure(event, '${favId}', '${safeTenThuTuc}', '${maDVC}', '${tenTinh}')" title="Thêm vào thủ tục yêu thích">
                    <i class="fa-solid fa-star"></i>
                </button>
                <i class="fa-solid fa-chevron-right row-arrow" style="margin-left: 10px;" onclick="UIRenderer.renderTinhByThuTuc({TenDVC: '${safeTenThuTuc}', MaDVC: '${maDVC}'})"></i>
            </div>
        `;
        return row;
    },

    updateBreadcrumb() {
        let sub = document.getElementById('breadcrumb-sub');
        let prefix = `<span onclick="app.resetSearchAndGoHome()" style="cursor: pointer; color: var(--primary-color);">Dịch vụ công</span>`;

        if (this.currentLevel === 'tacnghiep' || this.currentLevel === 'linhvuc') {
            sub.style.display = 'none';
            sub.innerHTML = '';
            return;
        }

        sub.style.display = 'block';
        let html = '';
        let formatTTHC = (name, ma) => name.length > 50 ? name.substring(0, 50) + '... (' + ma + ')' : `${name} (${ma})`;

        if (this.isSearchFlow) {
            if (this.currentLevel === 'search_results') {
                html = `${prefix} > <span>Kết quả tìm kiếm</span>`;
            } else if (this.currentLevel === 'tinh') {
                html = `${prefix} > <span onclick="document.getElementById('search-box').focus(); app.handleSearch();" style="cursor:pointer;">KQ tìm kiếm</span> > <span>${formatTTHC(this.selectedThuTucObj.TenDVC, this.selectedThuTucObj.MaDVC)}</span> > <span>Chọn Tỉnh/TP</span>`;
            } else if (this.currentLevel === 'coquan') {
                html = `${prefix} > <span onclick="document.getElementById('search-box').focus(); app.handleSearch();" style="cursor:pointer;">KQ tìm kiếm</span> > <span onclick="UIRenderer.renderTinhByThuTuc(UIRenderer.selectedThuTucObj)" style="cursor:pointer;">${formatTTHC(this.selectedThuTucObj.TenDVC, this.selectedThuTucObj.MaDVC)}</span> > <span>${this.selectedTinh}</span>`;
            }
        } else {
            if (this.currentLevel === 'thutuc') {
                html = `${prefix} > <span>${this.selectedLinhVuc}</span>`;
            } else if (this.currentLevel === 'tinh') {
                html = `${prefix} > <span onclick="UIRenderer.renderThuTucByLinhVuc('${this.selectedLinhVuc}')" style="cursor:pointer;">${this.selectedLinhVuc}</span> > <span>${formatTTHC(this.selectedThuTucObj.TenDVC, this.selectedThuTucObj.MaDVC)}</span>`;
            } else if (this.currentLevel === 'coquan') {
                html = `${prefix} > <span onclick="UIRenderer.renderThuTucByLinhVuc('${this.selectedLinhVuc}')" style="cursor:pointer;">${this.selectedLinhVuc}</span> > <span onclick="UIRenderer.renderTinhByThuTuc(UIRenderer.selectedThuTucObj)" style="cursor:pointer;">${formatTTHC(this.selectedThuTucObj.TenDVC, this.selectedThuTucObj.MaDVC)}</span> > <span>${this.selectedTinh}</span>`;
            }
        }
        sub.innerHTML = html;
    }
};