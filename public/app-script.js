(async function () {
    // التأكد من أن الزائر في صفحة منتج داخل متجر سلة
    if (!window.salla || !salla.product) return;

    salla.product.event.on('ready', async (product) => {
        // التحقق مما إذا كان المنتج نافد الكمية
        if (!product.is_out_of_stock) return;

        const merchantId = salla.config.get('store.id') || salla.config.get('merchant_id');

        try {
            // جلب رقم التاجر والرسالة الخاصة بمتجره
            const response = await fetch(`https://salla-whatsapp-notify.onrender.com/api/settings?merchant_id=${merchantId}`);
            const settings = await response.json();

            if (!settings.whatsappNumber) return; // عدم إظهار الزر إذا لم يحدد التاجر رقمه

            // تجهيز نص الرسالة طبقاً لتنسيق المحادثة المرفقة
            const productName = product.name;
            const productPrice = product.price?.amount || product.price;
            const productUrl = window.location.href;

            const textMessage = `${settings.customMessage}\n\n📦 المنتج: ${productName}\n💰 السعر: ${productPrice}\n🔗 الرابط: ${productUrl}`;
            const encodedText = encodeURIComponent(textMessage);
            const whatsappUrl = `https://wa.me/${settings.whatsappNumber}?text=${encodedText}`;

            // إنشاء وزر "أعلمني عند التوفر عبر الواتساب"
            const btn = document.createElement('a');
            btn.href = whatsappUrl;
            btn.target = '_blank';
            btn.innerText = 'أعلمني عند التوفر عبر الواتساب';
            btn.style.cssText = `
                display: block;
                width: 100%;
                background-color: #25D366;
                color: white;
                text-align: center;
                padding: 12px;
                margin-top: 10px;
                border-radius: 8px;
                font-weight: bold;
                text-decoration: none;
                font-size: 16px;
            `;

            // إضافة الزر تحت زر الشراء المغلق أو منطقة السعر
            const targetContainer = document.querySelector('.product-form') || document.querySelector('.s-product-card-content');
            if (targetContainer) {
                targetContainer.appendChild(btn);
            }
        } catch (err) {
            console.error('WhatsApp Notify Error:', err);
        }
    });
})();
