const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ذاكرة حفظ إعدادات التاجر
let merchantConfig = {
    phone: '',
    template: 'أهلاً، أرغب بتوفر منتج: {اسم_المنتج}\nرابط المنتج: {رابط_المنتج}'
};

// 1. عرض واجهة لوحة تحكم التاجر
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 2. حفظ إعدادات التاجر (الرقم والرسالة)
app.post('/api/save-settings', (req, res) => {
    const { phone, template } = req.body;
    if (phone) merchantConfig.phone = phone;
    if (template) merchantConfig.template = template;
    
    res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' });
});

// 3. جلب رابط الواتساب المباشر لصفحة العميل
app.get('/api/get-whatsapp-button', (req, res) => {
    const { productName, productUrl, productPrice } = req.query;

    if (!merchantConfig.phone) {
        return res.status(400).json({ error: 'لم يتم ضبط رقم الواتساب بعد' });
    }

    // استبدال المتغيرات تلقائياً ببيانات المنتج
    let message = merchantConfig.template
        .replace(/{اسم_المنتج}/g, productName || '')
        .replace(/{رابط_المنتج}/g, productUrl || '')
        .replace(/{سعر_المنتج}/g, productPrice || '');

    const whatsappUrl = `https://wa.me/${merchantConfig.phone}?text=${encodeURIComponent(message)}`;

    res.json({ whatsappUrl });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
