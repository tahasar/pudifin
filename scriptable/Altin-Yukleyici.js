// Variables used by Scriptable.
// icon-color: yellow; icon-glyph: coins;
//
// Pudifin yükleyici: asıl kodu (scriptable/Altin.js) GitHub'dan çeker, yerelde saklar ve çalıştırır.
// Böylece kodu GitHub'da değiştirdiğinde telefondaki widget kendiliğinden güncellenir.
// Bu dosyayı telefona BİR KEZ kopyalaman yeterli. Widget'ta bu script'i seç.
//
// UYARI: Bu dosya, aşağıdaki adresteki kodu telefonda çalıştırır. Depoya yazma yetkisi olan herkes
// telefonda kod çalıştırabilir demektir. Depo senin kontrolünde olduğu sürece sorun yok.

const KOD_URL = "https://raw.githubusercontent.com/tahasar/pudifin/main/scriptable/Altin.js";
const KONTROL_SAAT = 6; // GitHub'a en fazla bu kadar saatte bir bakılır

const fm = FileManager.local();
const yol = fm.joinPath(fm.documentsDirectory(), "pudifin-kod.js");
const zamanYolu = yol + ".zaman";

async function guncelle() {
  const r = new Request(KOD_URL + "?t=" + Date.now());
  r.timeoutInterval = 10;
  const kod = await r.loadString();
  if (r.response.statusCode !== 200 || !kod.includes("Pudifin")) throw new Error("Kod alınamadı: " + r.response.statusCode);
  fm.writeString(yol, kod);
  fm.writeString(zamanYolu, String(Date.now()));
}

const son = fm.fileExists(zamanYolu) ? Number(fm.readString(zamanYolu)) : 0;
const zorla = !config.runsInWidget && !config.runsInAccessoryWidget; // uygulamada açınca hep güncelle
if (zorla || !fm.fileExists(yol) || Date.now() - son > KONTROL_SAAT * 3600e3) {
  try { await guncelle(); } catch (e) { if (!fm.fileExists(yol)) throw e; }
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
await new AsyncFunction(fm.readString(yol))();
