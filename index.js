const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));

// =========================
// MongoDB
// =========================

const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoURI) {
    console.error('MONGO_URI is not configured.');
} else {
    mongoose
        .connect(mongoURI)
        .then(() => {
            console.log('MongoDB Connected Successfully.');
        })
        .catch((err) => {
            console.error('MongoDB Connection Error:', err);
        });
}

// =========================
// Store Model
// =========================

const storeSchema = new mongoose.Schema(
    {
        merchantId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        accessToken: {
            type: String,
            default: ''
        },

        refreshToken: {
            type: String,
            default: ''
        },

        whatsappNumber: {
            type: String,
            default: ''
        },

        customMessage: {
            type: String,
            default: 'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
        }
    },
    {
        timestamps: true
    }
);

const Store = mongoose.model('Store', storeSchema);

// =========================
// Home
// =========================

app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// =========================
// Dashboard
// =========================

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// =========================
// Salla OAuth Callback
// =========================

app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send(
            'لم يتم استلام كود المصادقة من سلة.'
        );
    }

    const clientId = process.env.SALLA_CLIENT_ID;
    const clientSecret = process.env.SALLA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        console.error('Salla OAuth credentials are missing.');

        return res.status(500).send(
            'إعدادات المصادقة مع سلة غير مكتملة على الخادم.'
        );
    }

    try {
        // 1. تحويل authorization code إلى access token
        const tokenResponse = await axios.post(
            'https://accounts.salla.sa/oauth2/token',
            new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                redirect_uri:
                    'https://salla-whatsapp-notify.onrender.com/auth/callback',
                code: String(code)
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const {
            access_token,
            refresh_token
        } = tokenResponse.data;

        if (!access_token) {
            return res.status(500).send(
                'لم يتم الحصول على Access Token من سلة.'
            );
        }

        // 2. الحصول على بيانات التاجر
        const userInfoResponse = await axios.get(
            'https://accounts.salla.sa/oauth2/user/info',
            {
                headers: {
                    Authorization: `Bearer ${access_token}`
                }
            }
        );

        const merchantId =
            userInfoResponse.data?.data?.merchant?.id ||
            userInfoResponse.data?.data?.id;

        if (!merchantId) {
            console.error(
                'Salla user info response:',
                userInfoResponse.data
            );

            return res.status(400).send(
                'تعذر العثور على معرف المتجر في بيانات سلة.'
            );
        }

        const merchantIdStr = String(merchantId);

        // 3. إنشاء/تحديث المتجر
        await Store.findOneAndUpdate(
            { merchantId: merchantIdStr },
            {
                merchantId: merchantIdStr,
                accessToken: access_token,
                refreshToken: refresh_token || ''
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

        console.log(
            `Salla merchant authenticated: ${merchantIdStr}`
        );

        // 4. الذهاب للوحة التحكم
        res.redirect(
            `/dashboard?merchant_id=${encodeURIComponent(merchantIdStr)}`
        );

    } catch (error) {
        console.error(
            'Salla OAuth Error:',
            error.response?.data || error.message
        );

        res.status(500).send(
            'حدث خطأ أثناء المصادقة مع سلة. يرجى المحاولة مرة أخرى.'
        );
    }
});

// =========================
// GET Settings
// =========================

app.get('/api/settings', async (req, res) => {
    const merchantId = req.query.merchant_id;

    if (!merchantId) {
        return res.status(400).json({
            error: 'مطلوب معرف المتجر merchant_id'
        });
    }

    try {
        const store = await Store.findOne({
            merchantId: String(merchantId)
        }).lean();

        if (!store) {
            return res.json({
                whatsappNumber: '',
                customMessage:
                    'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
            });
        }

        return res.json({
            whatsappNumber: store.whatsappNumber || '',
            customMessage:
                store.customMessage ||
                'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
        });

    } catch (error) {
        console.error(
            'GET /api/settings error:',
            error
        );

        return res.status(500).json({
            error: 'خطأ في جلب إعدادات المتجر'
        });
    }
});

// =========================
// SAVE Settings
// =========================

app.post('/api/settings', async (req, res) => {
    const {
        merchant_id,
        whatsappNumber,
        customMessage
    } = req.body;

    if (!merchant_id) {
        return res.status(400).json({
            error: 'مطلوب معرف المتجر merchant_id'
        });
    }

    try {
        const cleanWhatsappNumber =
            typeof whatsappNumber === 'string'
                ? whatsappNumber.trim()
                : '';

        const cleanCustomMessage =
            typeof customMessage === 'string'
                ? customMessage.trim()
                : '';

        await Store.findOneAndUpdate(
            {
                merchantId: String(merchant_id)
            },
            {
                $set: {
                    whatsappNumber: cleanWhatsappNumber,
                    customMessage:
                        cleanCustomMessage ||
                        'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
                }
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

        return res.json({
            success: true,
            message: 'تم حفظ الإعدادات بنجاح'
        });

    } catch (error) {
        console.error(
            'POST /api/settings error:',
            error
        );

        return res.status(500).json({
            error: 'فشل حفظ الإعدادات'
        });
    }
});

// =========================
// Health Check
// =========================

app.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'salla-whatsapp-notify',
        mongodb:
            mongoose.connection.readyState === 1
                ? 'connected'
                : 'disconnected'
    });
});

// =========================
// Server
// =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
