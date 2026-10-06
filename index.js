const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إتاحة الملفات الثابتة داخل مجلد public
app.use(express.static(path.join(__dirname, 'public')));

// 1. الاتصال بقاعدة البيانات السحابية (MongoDB Atlas)
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/salla_db';

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB Connected Successfully to Cloud!');
}).catch((err) => {
    console.error('MongoDB Connection Error:', err);
});

// تعريف نموذج بيانات المتجر
const storeSchema = new mongoose.Schema({
    merchantId: { type: String, required: true, unique: true },
    accessToken: String,
    refreshToken: String,
    whatsappNumber: { type: String, default: '' },
    customMessage: { type: String, default: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.' }
});

const Store = mongoose.model('Store', storeSchema);

// 2. إعادة توجيه الصفحة الرئيسية (/) إلى لوحة التحكم لحل مشكلة Cannot GET /
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// 3. مسار لوحة تحكم التاجر
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 4. رابط Callback لمصادقة سلة (OAuth)
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const response = await axios.post('https://accounts.salla.sa/oauth2/token', {
            client_id: process.env.SALLA_CLIENT_ID,
            client_secret: process.env.SALLA_CLIENT_SECRET,
            grant_type: 'authorization_code',
            redirect_uri: 'https://salla-whatsapp-notify.onrender.com/auth/callback',
            code
        });

        const { access_token, refresh_token } = response.data;

        // جلب معرف المتجر (Merchant ID)
        const userProfile = await axios.get('https://api.salla.dev/store/v1/oauth/user', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const merchantId = userProfile.data.data.merchant.id;

        // حفظ أو تحديث التوكن في الداتابيز
        await Store.findOneAndUpdate(
            { merchantId },
            { accessToken: access_token, refreshToken: refresh_token },
            { upsert: true, new: true }
        );

        // توجيه التاجر إلى لوحة التحكم
        res.redirect(`/dashboard?merchant_id=${merchantId}`);
    } catch (error) {
        console.error('OAuth Error:', error.response?.data || error.message);
        res.status(500).send('حدث خطأ أثناء المصادقة مع سلة');
    }
});

// 5. API لجلب إعدادات التاجر
app.get('/api/settings', async (req, res) => {
    const { merchant_id } = req.query;
    try {
        const store = await Store.findOne({ merchantId: merchant_id });
        if (!store) {
            return res.json({ whatsappNumber: '', customMessage: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.' });
        }
        
        res.json({
            whatsappNumber: store.whatsappNumber,
            customMessage: store.customMessage
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب البيانات' });
    }
});

// 6. API لحفظ إعدادات التاجر
app.post('/api/settings', async (req, res) => {
    const { merchant_id, whatsappNumber, customMessage } = req.body;
    try {
        await Store.findOneAndUpdate(
            { merchantId: merchant_id },
            { whatsappNumber, customMessage },
            { upsert: true }
        );
        res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' });
    } catch (err) {
        res.status(500).json({ error: 'فشل حفظ الإعدادات' });
    }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
