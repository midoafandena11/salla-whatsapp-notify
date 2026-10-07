const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   CORS
========================= */

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header(
        'Access-Control-Allow-Methods',
        'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    );
    res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

/* =========================
   Middleware
========================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   Static Files
========================= */

app.use(express.static(path.join(__dirname, 'public')));

/* =========================
   MongoDB
========================= */

const MONGO_URI =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI is missing');
} else {
    mongoose
        .connect(MONGO_URI)
        .then(() => {
            console.log('✅ MongoDB connected');
        })
        .catch((error) => {
            console.error(
                '❌ MongoDB connection error:',
                error.message
            );
        });
}

/* =========================
   Store Schema
========================= */

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
            default:
                'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
        }
    },
    {
        timestamps: true
    }
);

const Store = mongoose.model('Store', storeSchema);

/* =========================
   Health
========================= */

app.get('/health', async (req, res) => {
    const mongoConnected =
        mongoose.connection.readyState === 1;

    res.json({
        success: true,
        service: 'salla-whatsapp-notify',
        mongodb: mongoConnected
            ? 'connected'
            : 'disconnected'
    });
});

/* =========================
   Home
========================= */

app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

/* =========================
   Dashboard
========================= */

app.get('/dashboard', (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            'public',
            'dashboard.html'
        )
    );
});

/* =========================
   Salla OAuth Callback
========================= */

app.get('/auth/callback', async (req, res) => {
    try {
        const code = req.query.code;

        if (!code) {
            console.error(
                '❌ OAuth callback: missing code'
            );

            return res.status(400).send(
                'Missing OAuth code'
            );
        }

        const clientId =
            process.env.SALLA_CLIENT_ID;

        const clientSecret =
            process.env.SALLA_CLIENT_SECRET;

        /*
         * مهم:
         * لازم يكون نفس الـ Redirect URI
         * المسجل في إعدادات تطبيق سلة.
         */
        const redirectUri =
            process.env.SALLA_REDIRECT_URI ||
            `${req.protocol}://${req.get('host')}/auth/callback`;

        if (!clientId || !clientSecret) {
            console.error(
                '❌ Salla OAuth credentials are missing'
            );

            return res.status(500).send(
                'Salla OAuth configuration is missing'
            );
        }

        console.log(
            '🔐 Starting Salla OAuth token exchange...'
        );

        /* =========================
           Exchange code for token
        ========================= */

        const tokenResponse = await axios.post(
            'https://accounts.salla.sa/oauth2/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                redirect_uri: redirectUri
            }).toString(),
            {
                headers: {
                    'Content-Type':
                        'application/x-www-form-urlencoded'
                }
            }
        );

        const accessToken =
            tokenResponse.data?.access_token;

        const refreshToken =
            tokenResponse.data?.refresh_token || '';

        if (!accessToken) {
            console.error(
                '❌ Salla did not return an access token'
            );

            return res.status(500).send(
                'Salla did not return an access token'
            );
        }

        console.log(
            '✅ Salla access token received'
        );

        /* =========================
           Get Salla User Info
        ========================= */

        const userResponse = await axios.get(
            'https://accounts.salla.sa/oauth2/user/info',
            {
                headers: {
                    Authorization:
                        `Bearer ${accessToken}`
                }
            }
        );

        const userData =
            userResponse.data?.data ||
            userResponse.data ||
            {};

        console.log(
            '✅ Salla user information received'
        );

        /*
         * Salla User Info may contain the merchant/store
         * identifier in different structures.
         */
        const merchantId =
            userData.merchant?.id ||
            userData.store?.id ||
            userData.merchant_id ||
            userData.store_id ||
            userData.id;

        if (!merchantId) {
            console.error(
                '❌ Merchant ID was not found in Salla user info'
            );

            console.error(
                JSON.stringify(
                    userData,
                    null,
                    2
                )
            );

            return res.status(500).send(
                'Could not determine merchant ID'
            );
        }

        const merchantIdString =
            String(merchantId);

        /* =========================
           Save Store
        ========================= */

        await Store.findOneAndUpdate(
            {
                merchantId: merchantIdString
            },
            {
                merchantId: merchantIdString,
                accessToken: accessToken,
                refreshToken: refreshToken
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

        console.log(
            `✅ Store saved: ${merchantIdString}`
        );

        /* =========================
           Open Dashboard with Merchant ID
        ========================= */

        res.redirect(
            `/dashboard?merchant_id=${encodeURIComponent(
                merchantIdString
            )}`
        );

    } catch (error) {
        console.error(
            '❌ OAuth error status:',
            error.response?.status
        );

        console.error(
            '❌ OAuth error data:',
            error.response?.data || error.message
        );

        res.status(500).send(
            'Authentication failed. Check Render logs.'
        );
    }
});

/* =========================
   GET Settings
========================= */

app.get('/api/settings', async (req, res) => {
    try {
        const merchantId =
            req.query.merchant_id;

        if (!merchantId) {
            return res.status(400).json({
                success: false,
                error:
                    'merchant_id is required'
            });
        }

        const store =
            await Store.findOne({
                merchantId: String(merchantId)
            }).lean();

        if (!store) {
            return res.json({
                success: true,
                connected: false,
                whatsappNumber: '',
                customMessage:
                    'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
            });
        }

        res.json({
            success: true,
            connected: true,
            whatsappNumber:
                store.whatsappNumber || '',
            customMessage:
                store.customMessage ||
                'هلا، ياليت تبلغوني أول ما يتوفر هذا المنتج.'
        });

    } catch (error) {
        console.error(
            '❌ GET settings error:',
            error.message
        );

        res.status(500).json({
            success: false,
            error:
                'Failed to load settings'
        });
    }
});

/* =========================
   SAVE Settings
========================= */

app.post('/api/settings', async (req, res) => {
    try {
        const {
            merchant_id,
            whatsappNumber,
            customMessage
        } = req.body;

        if (!merchant_id) {
            return res.status(400).json({
                success: false,
                error:
                    'merchant_id is required'
            });
        }

        const store =
            await Store.findOneAndUpdate(
                {
                    merchantId:
                        String(merchant_id)
                },
                {
                    merchantId:
                        String(merchant_id),

                    whatsappNumber:
                        String(
                            whatsappNumber || ''
                        ).trim(),

                    customMessage:
                        String(
                            customMessage || ''
                        ).trim()
                },
                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true
                }
            );

        console.log(
            `✅ Settings saved for merchant: ${merchant_id}`
        );

        res.json({
            success: true,
            message:
                'Settings saved successfully',

            settings: {
                whatsappNumber:
                    store.whatsappNumber || '',

                customMessage:
                    store.customMessage || ''
            }
        });

    } catch (error) {
        console.error(
            '❌ SAVE settings error:',
            error.message
        );

        res.status(500).json({
            success: false,
            error:
                'Failed to save settings'
        });
    }
});

/* =========================
   404
========================= */

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not found'
    });
});

/* =========================
   Start
========================= */

app.listen(PORT, () => {
    console.log(
        `🚀 Server running on port ${PORT}`
    );
});
