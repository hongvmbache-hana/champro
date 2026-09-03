// =========================================
// FILE: js/config.js
// Quản lý các cấu hình tĩnh và đường dẫn CSDL
// =========================================

const CONFIG = {
    // 1. CÁC ĐƯỜNG LINK CSV TỪ SHEET CẤU HÌNH TRUNG TÂM
    // Thay thế các chuỗi "LINK_CSV_..." bằng link thực tế của anh
    
    // Tab DanhSachTinh (Cột: TenTinh, LinkCSV)
    URL_DANH_SACH_TINH: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQlBaBQWrwlVYTKY0zr2t7M-xnplWarLHSWjdDznpg32V1aZUrnxyirY-HNGo11jozXX7ZnUhsoBBoS/pub?gid=0&single=true&output=csv", 
    
    // Tab CauHinhDuongLink (Cột: LinhVuc, LinkMau)
    URL_CAU_HINH_LINK: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQlBaBQWrwlVYTKY0zr2t7M-xnplWarLHSWjdDznpg32V1aZUrnxyirY-HNGo11jozXX7ZnUhsoBBoS/pub?gid=166163611&single=true&output=csv",
    
    // Tab CauHinhURL
    URL_CAU_HINH_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQlBaBQWrwlVYTKY0zr2t7M-xnplWarLHSWjdDznpg32V1aZUrnxyirY-HNGo11jozXX7ZnUhsoBBoS/pub?gid=308386425&single=true&output=csv",
    
    // Tab TacNghiepChung (Cột: TenHeThong, LinkMacDinh, Icon, Nhom, ThuTuUuTien)
    URL_TAC_NGHIEP_CHUNG: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQlBaBQWrwlVYTKY0zr2t7M-xnplWarLHSWjdDznpg32V1aZUrnxyirY-HNGo11jozXX7ZnUhsoBBoS/pub?gid=1839871631&single=true&output=csv",
    
    // Tab TacNghiepRieng (Cột: TenTinh, TenHeThong, LinkDacThu)
    URL_TAC_NGHIEP_RIENG: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQlBaBQWrwlVYTKY0zr2t7M-xnplWarLHSWjdDznpg32V1aZUrnxyirY-HNGo11jozXX7ZnUhsoBBoS/pub?gid=1133276101&single=true&output=csv",

    // Tab HuongDan (Cột: TenHuongDan, LinkVideo) - BỔ SUNG MỚI
    URL_HUONG_DAN: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQlBaBQWrwlVYTKY0zr2t7M-xnplWarLHSWjdDznpg32V1aZUrnxyirY-HNGo11jozXX7ZnUhsoBBoS/pub?gid=1982128869&single=true&output=csv",

    APP_LOGO: "https://cdn.jsdelivr.net/gh/ChippedTopaz/dieu-phoi@main/Logo%20CCHC.png",   // Thay bằng link thực tế hoặc mã Base64 của anh
    APP_BANNER: "https://cdn.jsdelivr.net/gh/ChippedTopaz/dieu-phoi@main/banner.jpg", // Thay bằng link thực tế hoặc mã Base64 của anh
    APP_FAVICON: "https://cdn.jsdelivr.net/gh/ChippedTopaz/dieu-phoi@main/kettle.png",
    
};