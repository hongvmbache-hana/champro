// =========================================
// FILE: js/constants.js
// Bộ từ điển ánh xạ (Mapping) Enum -> Tiếng Việt
// =========================================

const TTHC_STATE = {
    ACTIVE: 'ACTIVE',
    UPDATED: 'UPDATED'
};

const TTHC_STATE_LABELS = {
    ACTIVE: 'Công khai',
    UPDATED: 'Sửa đổi, bổ sung'
};

const TTHC_TYPE_LABELS = {
    SPECIFIC: 'TTHC đặc thù',
    STANDARD: 'TTHC thông thường',
    INTERCONNECTED: 'TTHC liên thông',
    STANDARD_INTERNAL: 'TTHC nội bộ',
    INTERCONNECTED_INTERNAL: 'TTHC nội bộ liên thông'
};

const TTHC_FORMALITY_TYPE_LABELS = {
    ASSIGNED_REGULATION: 'TTHC được Luật giao quy định chi tiết',
    OTHER: 'Khác',
    NOT_ASSIGNED_REGULATION: 'TTHC không được Luật giao cho địa phương quy định hoặc quy định chi tiết',
    CENTRAL_REGULATION: 'TTHC do Trung ương quy định',
    LOCAL_REGULATION: 'TTHC do Bộ, cơ quan, địa phương quy định'
};

const TTHC_INTERNAL_LABELS = {
    'true': 'Ngành dọc',
    'false': 'Không phải ngành dọc'
};