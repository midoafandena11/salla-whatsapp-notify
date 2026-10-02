const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// قاعدة بيانات في الذاكرة لحفظ إعدادات كل متجر حسب معرّفه (storeId)
const storesConfig = {};

// 1. عرض لوحة تحكم التاجر
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 2. جلب إعدادات التاجر الحالية عند فتح لوحة التحكم
app.get('/api/get-settings', (req, res) => {
    const storeId = req.query.storeId || 'default_store';
    const config = storesConfig[storeId] || {
        phone: '',
        template: 'أهلاً، أرغب بتوفر منتج: {اسم_المنتج}\nرابط المنتج: {رابط_المنتج}'
    };
    res.json(config);
});

// 3. حفظ إعدادات التاجر بشكل مستقل
app.post('/api/save-settings', (req, res) => {
    const { storeId, phone, template } = req.body;
    const targetStore = storeId || 'default_store';

    if (!phone) {
        return res.status(400).json({ success: false, message: 'رقم الواتساب مطلوب' });
    }

    storesConfig[targetStore] = {
        phone: phone.replace(/[^0-9]/g, ''), // تنظيف الرقم من أي رموز أو مساحات
        template: template || 'أهلاً، أرغب بتوفر منتج: {اسم_المنتج}\nرابط المنتج: {رابط_المنتج}'
    };

    res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' });
});

// 4. جلب رابط الواتساب الجاهز للعميل في صفحة المنتج
app.get('/api/get-whatsapp-button', (req, res) => {
    const { storeId, productName, productUrl, productPrice } = req.query;
    const targetStore = storeId || 'default_store';
    const config = storesConfig[targetStore];

    if (!config || !config.phone) {
        return res.status(400).json({ error: 'لم يتم ضبط رقم الواتساب لهذا المتجر بعد' });
    }

    // استبدال الكلمات التلقائية بدقة داخل النص
    let message = config.template
        .replace(/{اسم_المنتج}/g, productName || '')
        .replace(/{رابط_المنتج}/g, productUrl || '')
        .replace(/{سعر_المنتج}/g, productPrice || '');

    const whatsappUrl = `https://wa.me/${config.phone}?text=${encodeURIComponent(message)}`;

    res.json({ whatsappUrl });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
