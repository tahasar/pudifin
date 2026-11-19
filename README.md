# Pudifin — iPhone altın takibi

iPhone ana ekranında ve kilit ekranında **gram altın (TL)** fiyatını, günlük değişimi (▲/▼ %) ve gün içi grafiği gösterir.
Widget'a dokununca 1G / 1H / 1A / 3A / 1Y aralıklarında parmakla gezilebilen büyük bir grafik açılır.
Fiyat son bildirimden bu yana %1 oynarsa bildirim gönderir.

Uygulama yazmak, Mac/Xcode veya Apple geliştirici hesabı gerekmez. Ücretsiz **Scriptable** uygulaması üzerinde çalışır.

## Kurulum (iPhone'da, ~5 dakika)

1. App Store'dan **Scriptable** uygulamasını indir (ücretsiz, Simon B. Støvring): https://apps.apple.com/app/scriptable/id1405459188
2. Bu depodaki [`scriptable/Altin-Yukleyici.js`](scriptable/Altin-Yukleyici.js) dosyasını aç, **Raw**'a bas, tüm metni kopyala.
3. Scriptable'da sağ üstteki **+**'ya bas, metni yapıştır, üstteki başlığa dokunup adını `Altın` yap.
4. Bir kez ▶ ile çalıştır. Bildirim izni sorarsa **İzin Ver**. Grafik ekranı açılmalı.
5. **Ana ekran widget'ı:** Ana ekranda boş yere basılı tut → sol üstte **Düzenle / +** → Scriptable → **Orta** boyutu ekle → widget'a basılı tut → **Widget'ı Düzenle**:
   - Script: `Altın`
   - When Interacting: `Run Script` (dokununca büyük grafik açılır)
6. **Kilit ekranı widget'ı (isteğe bağlı):** Kilit ekranına basılı tut → **Özelleştir** → Kilit Ekranı → widget alanı → Scriptable → dikdörtgen olanı ekle → ona dokunup Script olarak `Altın` seç.

## Bilmen gerekenler (kısıtlar)

- **"Anlık" değil.** iOS widget'ları kendi zamanlamasıyla yeniler; pratikte 15–60 dakikada bir. Hiçbir üçüncü parti widget gerçek zamanlı değildir. Uygulamada açınca o anki veri gelir.
- **Bildirim de widget yenilendiğinde kontrol edilir**, yani gecikmeli gelebilir. Eşik `scriptable/Altin.js` içindeki `ESIK_YUZDE` ayarıdır (0 = kapalı).
- **Veri kaynakları resmî değil:** gram fiyatı ve günlük % `finans.truncgil.com`'dan, grafik Yahoo Finance'ten (COMEX vadeli altın × USD/TRY). İkisi de ücretsiz ama garantisiz; biri bozulursa widget son başarılı veriyi gösterir.
- Grafikteki gram değeri vadeli kontrattan hesaplandığı için üstteki fiyattan birkaç TL farklı olabilir.

## Geliştirme (bulutta, her yerden)

- Asıl kod: [`scriptable/Altin.js`](scriptable/Altin.js). Telefondaki yükleyici bunu `main` dalından çeker.
- Değişiklik `main`'e girince telefon en geç 6 saat içinde (ya da Scriptable'da script'i elle çalıştırınca hemen) yeni kodu alır.
- **Depo herkese açık (public) olmalı**, yoksa `raw.githubusercontent.com` adresi telefondan okunamaz. Gizli tutmak istersen yükleyiciyi kullanma; `Altin.js`'i doğrudan Scriptable'a yapıştır (otomatik güncelleme olmaz).
