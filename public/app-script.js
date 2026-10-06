(function () {
    // 1. جلب ID المتجر من بيئة سلة مباشرة
    const merchantId = (typeof salla !== 'undefined' && salla.config) 
        ? salla.config.get('store.id') 
        : (window.store ? window.store.id : null);

    if (!merchantId) {
        console.log('لم يتم العثور على merchant_id الخاص بسلة');
        return;
    }

    // 2. الاستعلام عن إعدادات التاجر من السيرفر الخاص بك
    fetch(`https://salla-whatsapp-notify.onrender.com/api/settings?merchant_id=${merchantId}`)
        .then(res => res.json())
        .then(data => {
            if (!data || !data.whatsappNumber) {
                console.log('لم يتم ضبط رقم الواتساب لهذا المتجر بعد.');
                return;
            }

            // 3. حقن الزر داخل صفحة المنتج
            injectWhatsAppButton(data.whatsappNumber, data.customMessage);
        })
        .catch(err => console.error('خطأ في جلب إعدادات الواتساب:', err));

    function injectWhatsAppButton(phone, message) {
        // فحص ما إذا كان الزر مضافاً بالفعل لمنع التكرار
        if (document.getElementById('salla-custom-whatsapp-btn')) return;

        // إنشاء عنصر الزر
        const btn = document.createElement('a');
        btn.id = 'salla-custom-whatsapp-btn';
        
        const encodedMessage = encodeURIComponent(message || 'مرحباً، أود الاستفسار عن هذا المنتج.');
        const currentUrl = encodeURIComponent(window.location.href);
        btn.href = `https://wa.me/${phone}?text=${encodedMessage}%0A${currentUrl}`;
        btn.target = '_blank';
        btn.innerText = '💬 تواصل عبر الواتساب لتوفير المنتج';

        // تنسيق الزر ليظهر بشكل شيك وبارز
        Object.assign(btn.style, {
            display: 'block',
            width: '100%',
            backgroundColor: '#25D366',
            color: '#ffffff',
            textAlign: 'center',
            padding: '14px 20px',
            marginTop: '15px',
            marginBottom: '15px',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            textDecoration: 'none',
            boxShadow: '0 4px 10px rgba(37, 211, 102, 0.3)',
            transition: 'all 0.3s ease'
        });

        // تحديد مكان الإدراج (البحث عن أزرار الشراء/نفدت الكمية أو نموذج المنتج)
        const targetContainer = 
            document.querySelector('.product-form') || 
            document.querySelector('.product-details') || 
            document.querySelector('form[action*="cart"]') || 
            document.body;

        targetContainer.appendChild(btn);
    }
})();
