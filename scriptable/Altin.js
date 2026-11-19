// Variables used by Scriptable.
// icon-color: yellow; icon-glyph: coins;
//
// Pudifin — Altın takip widget'ı (Scriptable)
// - Ana ekran widget'ı (küçük / orta / büyük): gram altın TL, günlük değişim, gün içi grafik
// - Kilit ekranı widget'ı (satır içi / dikdörtgen / yuvarlak)
// - Uygulamada çalışınca: 1G / 1H / 1A / 3A / 1Y aralıklı dokunmatik grafik
// - Fiyat son bildirimden bu yana ESIK_YUZDE kadar oynarsa yerel bildirim
//
// Veri kaynakları (ikisi de resmî/garantili API DEĞİL, bozulabilir):
// - finans.truncgil.com/today.json  -> gram altın / ons satış fiyatı ve günlük % değişim
// - query1.finance.yahoo.com chart  -> GC=F (COMEX altın vadeli, USD/ons) ve TRY=X (USD/TRY) geçmişi
//   Grafikteki gram TL = GC=F * USDTRY / 31.1035. Vadeli kontrat olduğu için spot fiyattan biraz sapar.

const AYAR = {
  ESIK_YUZDE: 1.0,          // bildirim eşiği (%). 0 yaparsan bildirim kapanır.
  YENILEME_DK: 15,          // iOS bunu garanti etmez; sadece "en erken" isteğidir.
  GRAM_ONS: 31.1034768,
};

const RENK = {
  arka: new Color("#111317"),
  yazi: Color.white(),
  soluk: new Color("#9aa0a6"),
  yukari: new Color("#34c759"),
  asagi: new Color("#ff453a"),
  altin: new Color("#f5c542"),
};

const UA = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" };

// ---------- yardımcılar ----------

function trSayi(s) {
  // "$3.709,73" / "6.020,25" / "%-0,33" -> number
  if (s == null) return NaN;
  return parseFloat(String(s).replace(/[^0-9,.\-]/g, "").replace(/\./g, "").replace(",", "."));
}

function tl(n, ondalik = 2) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik });
}

function yuzdeYazi(p) {
  const ok = p > 0 ? "▲" : p < 0 ? "▼" : "•";
  return `${ok} %${tl(Math.abs(p))}`;
}

async function json(url) {
  const r = new Request(url);
  r.headers = UA;
  r.timeoutInterval = 15;
  return await r.loadJSON();
}

// ---------- veri ----------

async function anlikFiyat() {
  const d = await json("https://finans.truncgil.com/today.json");
  const g = d["gram-altin"], o = d["ons"];
  return {
    gram: trSayi(g["Satış"]),
    gramYuzde: trSayi(g["Değişim"]),
    ons: trSayi(o["Satış"]),
    onsYuzde: trSayi(o["Değişim"]),
    zaman: d["Update_Date"],
  };
}

async function yahoo(sembol, range, interval) {
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sembol)}?range=${range}&interval=${interval}`;
  const r = (await json(u)).chart.result[0];
  const q = r.indicators.quote[0].close;
  const noktalar = [];
  (r.timestamp || []).forEach((t, i) => { if (q[i] != null) noktalar.push([t * 1000, q[i]]); });
  return { noktalar, oncekiKapanis: r.meta.chartPreviousClose, son: r.meta.regularMarketPrice };
}

// ons(USD) serisini USD/TRY serisiyle birleştirip gram TL serisi üret
function gramSeri(altin, kur) {
  const k = kur.noktalar;
  if (!k.length) return [];
  let j = 0;
  return altin.noktalar.map(([t, ons]) => {
    while (j + 1 < k.length && k[j + 1][0] <= t) j++;
    return [t, (ons * k[j][1]) / AYAR.GRAM_ONS];
  });
}

const ARALIK = {
  "1G": ["1d", "5m"],
  "1H": ["5d", "30m"],
  "1A": ["1mo", "1d"],
  "3A": ["3mo", "1d"],
  "1Y": ["1y", "1d"],
};

async function grafikVerisi(kod) {
  const [r, i] = ARALIK[kod];
  // kur için daha sık aralık kullanmak hizalamayı iyileştirir
  const [altin, kur] = await Promise.all([yahoo("GC=F", r, i), yahoo("TRY=X", r, i)]);
  return { kod, gram: gramSeri(altin, kur), ons: altin.noktalar };
}

// ---------- önbellek & bildirim ----------

const fm = FileManager.local();
const durumYolu = fm.joinPath(fm.documentsDirectory(), "pudifin-durum.json");

function durumOku() {
  try { return fm.fileExists(durumYolu) ? JSON.parse(fm.readString(durumYolu)) : {}; } catch (e) { return {}; }
}
function durumYaz(d) { try { fm.writeString(durumYolu, JSON.stringify(d)); } catch (e) {} }

async function bildirimKontrol(fiyat, durum) {
  if (!AYAR.ESIK_YUZDE || !isFinite(fiyat.gram)) return;
  if (!durum.bildirimFiyati) { durum.bildirimFiyati = fiyat.gram; return; }
  const fark = ((fiyat.gram - durum.bildirimFiyati) / durum.bildirimFiyati) * 100;
  if (Math.abs(fark) >= AYAR.ESIK_YUZDE) {
    const n = new Notification();
    n.title = fark > 0 ? "Altın yükseldi 📈" : "Altın düştü 📉";
    n.body = `Gram altın ${tl(fiyat.gram)} ₺ (${yuzdeYazi(fark)} son bildirimden beri, bugün ${yuzdeYazi(fiyat.gramYuzde)})`;
    n.threadIdentifier = "pudifin-altin";
    await n.schedule();
    durum.bildirimFiyati = fiyat.gram;
  }
}

// ---------- widget çizimi ----------

function sparkline(seri, w, h, renk) {
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  dc.respectScreenScale = true;
  if (seri.length < 2) return dc.getImage();
  const ys = seri.map((p) => p[1]);
  const min = Math.min(...ys), max = Math.max(...ys), aralik = max - min || 1;
  const pts = seri.map((p, i) => new Point((i / (seri.length - 1)) * w, h - 2 - ((p[1] - min) / aralik) * (h - 4)));

  const dolgu = new Path();
  dolgu.move(new Point(0, h));
  pts.forEach((p) => dolgu.addLine(p));
  dolgu.addLine(new Point(w, h));
  dolgu.closeSubpath();
  dc.addPath(dolgu);
  dc.setFillColor(new Color(renk.hex, 0.18));
  dc.fillPath();

  const cizgi = new Path();
  cizgi.addLines(pts);
  dc.addPath(cizgi);
  dc.setStrokeColor(renk);
  dc.setLineWidth(2);
  dc.strokePath();
  return dc.getImage();
}

function anaWidget(fiyat, seri, aile) {
  const w = new ListWidget();
  w.backgroundColor = RENK.arka;
  w.setPadding(12, 14, 12, 14);
  const renk = fiyat.gramYuzde >= 0 ? RENK.yukari : RENK.asagi;

  const ust = w.addStack();
  ust.centerAlignContent();
  const baslik = ust.addText("GRAM ALTIN");
  baslik.font = Font.semiboldSystemFont(11);
  baslik.textColor = RENK.altin;
  ust.addSpacer();
  if (aile !== "small") {
    const ons = ust.addText(`Ons $${tl(fiyat.ons, 0)}  ${yuzdeYazi(fiyat.onsYuzde)}`);
    ons.font = Font.systemFont(11);
    ons.textColor = RENK.soluk;
  }

  w.addSpacer(4);
  const f = w.addText(`${tl(fiyat.gram)} ₺`);
  f.font = Font.boldRoundedSystemFont(aile === "small" ? 22 : 26);
  f.textColor = RENK.yazi;
  f.minimumScaleFactor = 0.6;
  f.lineLimit = 1;

  const y = w.addText(`${yuzdeYazi(fiyat.gramYuzde)} bugün`);
  y.font = Font.semiboldSystemFont(13);
  y.textColor = renk;

  w.addSpacer();
  const gen = aile === "small" ? 130 : 300;
  const yuk = aile === "large" ? 180 : 44;
  const img = w.addImage(sparkline(seri, gen, yuk, renk));
  img.resizable = true;
  img.imageSize = new Size(gen, yuk);

  w.addSpacer(4);
  const z = w.addText(`Güncelleme ${fiyat.zaman ? fiyat.zaman.slice(11, 16) : "-"}`);
  z.font = Font.systemFont(9);
  z.textColor = RENK.soluk;
  return w;
}

function kilitWidget(fiyat, seri, aile) {
  const w = new ListWidget();
  const ok = fiyat.gramYuzde > 0 ? "▲" : fiyat.gramYuzde < 0 ? "▼" : "•";
  if (aile === "accessoryInline") {
    w.addText(`Altın ${tl(fiyat.gram, 0)}₺ ${ok}%${tl(Math.abs(fiyat.gramYuzde))}`);
  } else if (aile === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const a = w.addText(ok + tl(Math.abs(fiyat.gramYuzde), 1));
    a.font = Font.boldSystemFont(12);
    a.centerAlignText();
    const b = w.addText(tl(fiyat.gram / 1000, 1) + "B");
    b.font = Font.systemFont(10);
    b.centerAlignText();
  } else {
    const a = w.addText(`Gram ${tl(fiyat.gram)} ₺`);
    a.font = Font.boldSystemFont(14);
    const b = w.addText(`${ok} %${tl(Math.abs(fiyat.gramYuzde))} bugün`);
    b.font = Font.systemFont(12);
    const img = w.addImage(sparkline(seri, 150, 18, Color.white()));
    img.imageSize = new Size(150, 18);
  }
  return w;
}

function hataWidget(mesaj) {
  const w = new ListWidget();
  w.backgroundColor = RENK.arka;
  const t = w.addText("Altın verisi alınamadı");
  t.textColor = RENK.yazi;
  t.font = Font.semiboldSystemFont(12);
  const m = w.addText(String(mesaj).slice(0, 80));
  m.textColor = RENK.soluk;
  m.font = Font.systemFont(9);
  return w;
}

// ---------- uygulama içi grafik ----------

function grafikHTML(fiyat, veriler) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
:root{color-scheme:dark}body{margin:0;background:#111317;color:#fff;font:15px -apple-system,system-ui;padding:16px}
.k{color:#f5c542;font-weight:600;font-size:13px;letter-spacing:.05em}.f{font-size:34px;font-weight:700;margin:4px 0}
.u{color:#34c759}.d{color:#ff453a}.s{color:#9aa0a6;font-size:13px}
.tabs{display:flex;gap:6px;margin:18px 0 8px}.tabs button{flex:1;background:#1f2228;color:#ddd;border:0;border-radius:8px;padding:8px 0;font:600 14px -apple-system}
.tabs button.on{background:#f5c542;color:#111}
canvas{width:100%;height:300px;touch-action:none}#tip{min-height:20px;margin-top:6px}
.sw{display:flex;gap:6px;margin-top:10px}.sw button{background:none;border:1px solid #333;color:#aaa;border-radius:6px;padding:4px 10px}.sw button.on{border-color:#f5c542;color:#f5c542}
</style></head><body>
<div class="k">GRAM ALTIN</div>
<div class="f">${tl(fiyat.gram)} ₺</div>
<div class="${fiyat.gramYuzde >= 0 ? "u" : "d"}">${yuzdeYazi(fiyat.gramYuzde)} bugün</div>
<div class="s">Ons $${tl(fiyat.ons)} (${yuzdeYazi(fiyat.onsYuzde)}) · ${fiyat.zaman || ""}</div>
<div class="tabs" id="tabs"></div>
<canvas id="c"></canvas><div id="tip" class="s"></div>
<div class="sw"><button id="bg" class="on">Gram ₺</button><button id="bo">Ons $</button></div>
<p class="s">Grafik COMEX vadeli altın × USD/TRY'den hesaplanır; üstteki anlık fiyattan biraz farklı olabilir.</p>
<script>
const V=${JSON.stringify(veriler)};let aktif=Object.keys(V)[0],tur="gram";
const c=document.getElementById("c"),x=c.getContext("2d"),tip=document.getElementById("tip");
const fmt=(n,d=2)=>n.toLocaleString("tr-TR",{minimumFractionDigits:d,maximumFractionDigits:d});
function seri(){return (V[aktif]||{})[tur]||[]}
function ciz(hi){const s=seri(),dpr=devicePixelRatio||1,W=c.clientWidth,H=c.clientHeight;c.width=W*dpr;c.height=H*dpr;x.scale(dpr,dpr);x.clearRect(0,0,W,H);
 if(s.length<2){x.fillStyle="#999";x.fillText("Veri yok",10,20);return}
 const ys=s.map(p=>p[1]),mn=Math.min(...ys),mx=Math.max(...ys),r=mx-mn||1,P=24;
 const X=i=>i/(s.length-1)*W,Y=v=>P+(1-(v-mn)/r)*(H-2*P);const up=ys[ys.length-1]>=ys[0],col=up?"#34c759":"#ff453a";
 x.strokeStyle="#2a2d33";x.fillStyle="#9aa0a6";x.font="11px -apple-system";x.lineWidth=1;
 [mn,(mn+mx)/2,mx].forEach(v=>{x.beginPath();x.moveTo(0,Y(v));x.lineTo(W,Y(v));x.stroke();x.fillText(fmt(v,tur=="gram"?0:0),4,Y(v)-3)});
 const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,col+"55");g.addColorStop(1,col+"00");
 x.beginPath();s.forEach((p,i)=>i?x.lineTo(X(i),Y(p[1])):x.moveTo(X(i),Y(p[1])));x.lineTo(W,H);x.lineTo(0,H);x.fillStyle=g;x.fill();
 x.beginPath();s.forEach((p,i)=>i?x.lineTo(X(i),Y(p[1])):x.moveTo(X(i),Y(p[1])));x.strokeStyle=col;x.lineWidth=2;x.stroke();
 const ch=((ys[ys.length-1]-ys[0])/ys[0]*100);
 if(hi==null){tip.innerHTML="Dönem değişimi: <b style='color:"+col+"'>"+(ch>=0?"▲":"▼")+" %"+fmt(Math.abs(ch))+"</b>";return}
 const p=s[hi];x.strokeStyle="#f5c542";x.beginPath();x.moveTo(X(hi),0);x.lineTo(X(hi),H);x.stroke();x.beginPath();x.arc(X(hi),Y(p[1]),4,0,7);x.fillStyle="#f5c542";x.fill();
 const t=new Date(p[0]);tip.textContent=t.toLocaleString("tr-TR",{day:"2-digit",month:"short",hour:aktif=="1G"||aktif=="1H"?"2-digit":undefined,minute:aktif=="1G"||aktif=="1H"?"2-digit":undefined})+" · "+(tur=="gram"?fmt(p[1])+" ₺":"$"+fmt(p[1]))}
function dok(e){const s=seri(),b=c.getBoundingClientRect(),cx=(e.touches?e.touches[0].clientX:e.clientX)-b.left;ciz(Math.max(0,Math.min(s.length-1,Math.round(cx/b.width*(s.length-1)))));e.preventDefault()}
c.addEventListener("touchstart",dok);c.addEventListener("touchmove",dok);c.addEventListener("touchend",()=>ciz());
const T=document.getElementById("tabs");Object.keys(V).forEach(k=>{const b=document.createElement("button");b.textContent=k;b.onclick=()=>{aktif=k;[...T.children].forEach(z=>z.classList.toggle("on",z===b));ciz()};if(k===aktif)b.className="on";T.appendChild(b)});
bg.onclick=()=>{tur="gram";bg.className="on";bo.className="";ciz()};bo.onclick=()=>{tur="ons";bo.className="on";bg.className="";ciz()};
ciz();addEventListener("resize",()=>ciz());
</script></body></html>`;
}

// ---------- ana akış ----------

async function main() {
  const durum = durumOku();
  let fiyat, gunluk;
  try {
    [fiyat, gunluk] = await Promise.all([anlikFiyat(), grafikVerisi("1G")]);
    durum.sonFiyat = fiyat;
    durum.sonSeri = gunluk.gram;
  } catch (e) {
    // ağ yoksa son başarılı veriyi göster
    if (durum.sonFiyat) { fiyat = durum.sonFiyat; gunluk = { gram: durum.sonSeri || [] }; }
    else throw e;
  }

  // truncgil düşerse Yahoo'dan hesapla
  if (!isFinite(fiyat.gram) && gunluk.gram.length) {
    fiyat.gram = gunluk.gram[gunluk.gram.length - 1][1];
  }

  await bildirimKontrol(fiyat, durum);
  durumYaz(durum);

  if (config.runsInWidget || config.runsInAccessoryWidget) {
    const aile = config.widgetFamily || "medium";
    const w = aile.startsWith("accessory") ? kilitWidget(fiyat, gunluk.gram, aile) : anaWidget(fiyat, gunluk.gram, aile);
    w.refreshAfterDate = new Date(Date.now() + AYAR.YENILEME_DK * 60 * 1000);
    Script.setWidget(w);
  } else {
    const kodlar = Object.keys(ARALIK);
    const sonuc = await Promise.all(kodlar.map((k) => (k === "1G" ? Promise.resolve(gunluk) : grafikVerisi(k).catch(() => null))));
    const veriler = {};
    sonuc.forEach((v, i) => { if (v) veriler[kodlar[i]] = { gram: v.gram, ons: v.ons || [] }; });
    const wv = new WebView();
    await wv.loadHTML(grafikHTML(fiyat, veriler));
    await wv.present(true);
  }
}

try {
  await main();
} catch (e) {
  if (config.runsInWidget || config.runsInAccessoryWidget) Script.setWidget(hataWidget(e));
  else { const a = new Alert(); a.title = "Hata"; a.message = String(e); a.addAction("Tamam"); await a.present(); }
}
Script.complete();
