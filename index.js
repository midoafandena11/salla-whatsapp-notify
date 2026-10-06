const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إتاحة الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));

// الاتصال بقاعدة البيانات
const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb+srv://salla_user:M461gTnbcqjrUHcl@cluster0.yefpv0p.mongodb.net/salla_db?retryWrites=true&w=majority';

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB Connected Successfully to Cloud!');
}).catch((err) => {
    console.error('MongoDB Connection Error:', err);
});

// النموذج
const storeSchema = new mongoose.Schema({
    merchantId: { type: String, required: true, unique: true },
    accessToken: String,
    refreshToken: String,
    whatsappNumber: { type: String, default: '' },
    customMessage: { type: String, default: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.' }
});

const Store = mongoose.model('Store', storeSchema);

// توجيه الصفحة الرئيسية
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// لوحة التحكم
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// OAuth Callback
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('لم يتم استلام كود المصادقة من سلة');
    }

    try {
        // إرسال طلب التوكن لـ Salla
        const response = await axios.post('https://accounts.salla.sa/oauth2/token', new URLSearchParams({
            client_id: process.env.SALLA_CLIENT_ID || '0abf5b9d-4d16-453c-be37-e6b49a7fb9e9',
            client_secret: process.env.SALLA_CLIENT_SECRET || '342b49a0107bed90e5dca7a188090b13360c369eea675ce4466ba320298f0537',
            grant_type: 'authorization_code',
            redirect_uri: 'https://salla-whatsapp-notify.onrender.com/auth/callback',
            code: code
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, refresh_token } = response.data;

        // جلب بيانات التاجر
        const userProfile = await axios.get('https://api.salla.dev/store/v1/oauth/user', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const merchantId = userProfile.data.data.merchant.id || userProfile.data.data.id;

        // حفظ البيانات
        await Store.findOneAndUpdate(
            { merchantId: String(merchantId) },
            { accessToken: access_token, refreshToken: refresh_token },
            { upsert: true, new: true }
        );

        // التوجيه للوحة التحكم مع معرف المتجر
        res.redirect(`/dashboard?merchant_id=${merchantId}`);

    } catch (error) {
        console.error('Salla OAuth Detailed Error:', error.response?.data || error.message);
        res.status(500).send(`حدث خطأ أثناء المصادقة مع سلة: ${JSON.stringify(error.response?.data || error.message)}`);
    }
});

// API الإعدادات
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
           
