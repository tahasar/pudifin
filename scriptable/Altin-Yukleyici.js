// Variables used by Scriptable.
// icon-color: yellow; icon-glyph: coins;
//
// Pudifin yükleyici: asıl kodu (scriptable/Altin.js) GitHub'dan çeker, yerelde saklar ve çalıştırır.
// Böylece kodu GitHub'da değiştirdiğinde telefondaki widget kendiliğinden güncellenir.
// Bu dosyayı telefona BİR KEZ kopyalaman yeterli. Widget'ta bu script'i seç.
//
// Depo private ise: ilk çalıştırmada GitHub token'ı sorulur ve iPhone Anahtar Zinciri'nde (Keychain) saklanır.
// Token sadece bu depoya "Contents: Read-only" yetkili, fine-grained bir token olmalı.
// Token geçersiz/süresi dolmuşsa script uygulamada çalışınca yeni token'ı kendisi sorar.

const DEPO = "tahasar/pudifin";
const DAL = "main";
const DOSYA = "scriptable/Altin.js";
const KONTROL_SAAT = 6; // GitHub'a en fazla bu kadar saatte bir bakılır
const TOKEN_ANAHTAR = "pudifin-github-token";

const fm = FileManager.local();
const yol = fm.joinPath(fm.documentsDirectory(), "pudifin-kod.js");
const zamanYolu = yol + ".zaman";
const uygulamada = !config.runsInWidget && !config.runsInAccessoryWidget;

async function tokenSor() {
  const a = new Alert();
  a.title = "GitHub token";
  a.message = "Depo private olduğu için bir kez GitHub token'ı gerekli (sadece bu depo, Contents: Read-only). Telefonda Anahtar Zinciri'nde saklanır.";
  a.addSecureTextField("github_pat_...", "");
  a.addAction("Kaydet");
  a.addCancelAction("Vazgeç");
  if ((await a.present()) === -1) return null;
  const t = a.textFieldValue(0).trim();
  if (t) Keychain.set(TOKEN_ANAHTAR, t);
  return t || null;
}

function token() {
  return Keychain.contains(TOKEN_ANAHTAR) ? Keychain.get(TOKEN_ANAHTAR) : null;
}

async function guncelle(tekrar = true) {
  let t = token();
  if (!t && uygulamada) t = await tokenSor();
  if (!t) throw new Error("GitHub token yok. Script'i Scriptable uygulamasında bir kez çalıştır.");
  const r = new Request(`https://api.github.com/repos/${DEPO}/contents/${DOSYA}?ref=${DAL}`);
  r.headers = {
    Authorization: "Bearer " + t,
    Accept: "application/vnd.github.raw",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  r.timeoutInterval = 10;
  const kod = await r.loadString();
  const kodu = r.response.statusCode;
  if ((kodu === 401 || kodu === 404) && uygulamada && tekrar) {
    Keychain.remove(TOKEN_ANAHTAR);
    if (await tokenSor()) return guncelle(false);
  }
  if (kodu === 401 || kodu === 404) {
    throw new Error(`GitHub ${kodu}: token geçersiz, süresi dolmuş ya da bu depoya yetkisi yok.`);
  }
  if (kodu !== 200 || !kod.includes("Pudifin")) throw new Error("Kod alınamadı: " + kodu);
  fm.writeString(yol, kod);
  fm.writeString(zamanYolu, String(Date.now()));
}

const son = fm.fileExists(zamanYolu) ? Number(fm.readString(zamanYolu)) : 0;
if (uygulamada || !fm.fileExists(yol) || Date.now() - son > KONTROL_SAAT * 3600e3) {
  try {
    await guncelle();
  } catch (e) {
    if (!fm.fileExists(yol)) throw e; // hiç kod yoksa hatayı göster
    if (uygulamada) { const a = new Alert(); a.title = "Güncelleme başarısız, eski kod kullanılıyor"; a.message = String(e.message || e); a.addAction("Tamam"); await a.present(); }
  }
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
await new AsyncFunction(fm.readString(yol))();
