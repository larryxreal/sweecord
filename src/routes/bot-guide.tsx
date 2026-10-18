import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, ArrowLeft, BookOpen, Copy, ExternalLink, ShieldCheck, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/bot-guide")({
  head: () => ({ meta: [
    { title: "Bot Yapım Rehberi — SweeCord" },
    { name: "description", content: "SweeCord botunu oluştur, güvenli anahtarını al, sunucuna ekle ve JavaScript veya Python ile ilk mesajını gönder. API referansı ve hata çözümleri." },
    { property: "og:title", content: "Bot Yapım Rehberi — SweeCord" },
    { property: "og:description", content: "Geliştirici portalından ilk bot mesajına: adım adım SweeCord bot rehberi." },
    { property: "og:type", content: "article" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: BotGuide,
});

const base = "https://sweecord.lovable.app/api/public/bots";
const sections = [
  ["overview", "Başlamadan önce"], ["application", "1. Uygulama oluştur"],
  ["token", "2. Anahtar oluştur"], ["installation", "3. Sunucuya ekle"],
  ["channels", "4. Kanal kimliğini bul"], ["first-message", "5. İlk mesajını gönder"],
  ["api-reference", "API referansı"], ["troubleshooting", "Hata çözümleri"],
  ["security", "Güvenlik ve sınırlar"],
] as const;

const setup = `# macOS / Linux — değerleri kendi bilgilerinle değiştir
export SWEECORD_BOT_TOKEN='BOT_ANAHTARIN'
export SWEECORD_SERVER_ID='SUNUCU_UUID'
export SWEECORD_CHANNEL_ID='KANAL_UUID'

# Windows PowerShell
$env:SWEECORD_BOT_TOKEN = 'BOT_ANAHTARIN'
$env:SWEECORD_SERVER_ID = 'SUNUCU_UUID'
$env:SWEECORD_CHANNEL_ID = 'KANAL_UUID'`;
const channels = `curl --fail-with-body --get '${base}/channels' \\
  --data-urlencode "server_id=$SWEECORD_SERVER_ID" \\
  -H "Authorization: Bot $SWEECORD_BOT_TOKEN"`;
const curlMessage = `curl --fail-with-body -X POST '${base}/messages' \\
  -H "Authorization: Bot $SWEECORD_BOT_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d "{\"channel_id\":\"$SWEECORD_CHANNEL_ID\",\"content\":\"Merhaba SweeCord!\"}"`;
const javascript = `// bot.mjs — Node.js 20+; ek paket gerekmez
const token = process.env.SWEECORD_BOT_TOKEN;
const channelId = process.env.SWEECORD_CHANNEL_ID;
if (!token || !channelId) {
  throw new Error("SWEECORD_BOT_TOKEN ve SWEECORD_CHANNEL_ID gerekli.");
}

const response = await fetch("${base}/messages", {
  method: "POST",
  headers: {
    Authorization: \`Bot \${token}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    channel_id: channelId,
    content: "Merhaba SweeCord! JavaScript botum çalışıyor.",
  }),
});
const result = await response.json();
if (!response.ok) {
  throw new Error(\`HTTP \${response.status}: \${result.error}\`);
}
console.log("Mesaj gönderildi:", result.id);

// Çalıştır: node bot.mjs`;
const python = `# bot.py — Python 3.10+; ek paket gerekmez
import json
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError

token = os.environ["SWEECORD_BOT_TOKEN"]
channel_id = os.environ["SWEECORD_CHANNEL_ID"]
request = Request(
    "${base}/messages",
    data=json.dumps({
        "channel_id": channel_id,
        "content": "Merhaba SweeCord! Python botum çalışıyor.",
    }).encode("utf-8"),
    headers={
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
    },
    method="POST",
)
try:
    with urlopen(request, timeout=30) as response:
        result = json.load(response)
        print("Mesaj gönderildi:", result["id"])
except HTTPError as error:
    result = json.loads(error.read().decode("utf-8"))
    raise SystemExit(f"HTTP {error.code}: {result.get('error')}")

# Çalıştır: python3 bot.py`;

function CodeBlock({ title, code }: { title: string; code: string }) {
  return <div className="min-w-0 overflow-hidden rounded-md border border-border bg-rail">
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2"><span className="text-xs font-semibold text-muted-foreground">{title}</span><Button size="icon" variant="ghost" aria-label={`${title} kodunu kopyala`} title="Kodu kopyala" onClick={async () => { try { await navigator.clipboard.writeText(code); toast.success("Kod kopyalandı"); } catch { toast.error("Kod kopyalanamadı"); } }}><Copy className="size-4" /></Button></div>
    <pre className="max-w-full overflow-x-auto p-4 text-xs leading-6"><code>{code}</code></pre>
  </div>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-6 space-y-4 border-b border-border py-8 last:border-0"><h2 className="text-xl font-bold">{title}</h2>{children}</section>;
}

function BotGuide() {
  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border bg-rail"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 md:px-8"><Link to="/" className="flex items-center gap-3 font-bold"><Bot className="size-7 text-primary" />SweeCord <span className="text-sm font-normal text-muted-foreground">Geliştirici belgeleri</span></Link><Button variant="outline" asChild><Link to="/developers"><ArrowLeft className="size-4" />Geliştirici Portalı</Link></Button></div></header>
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:grid-cols-[220px_minmax(0,1fr)] md:px-8">
      <aside><nav aria-label="Rehber içindekiler" className="space-y-1 md:sticky md:top-6"><p className="mb-3 flex items-center gap-2 text-sm font-bold"><BookOpen className="size-4 text-primary" />İçindekiler</p>{sections.map(([id, title]) => <a key={id} href={`#${id}`} className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">{title}</a>)}</nav></aside>
      <main className="min-w-0"><div className="space-y-4 pb-8"><p className="flex items-center gap-2 text-sm font-semibold text-primary"><Terminal className="size-4" />BOT API · v1</p><h1 className="text-3xl font-bold md:text-4xl">SweeCord bot yapım rehberi</h1><p className="max-w-2xl leading-7 text-muted-foreground">İlk uygulamanı oluştur, sunucuna ekle ve kendi kodundan bir mesaj gönder. Bu rehber SweeCord botları içindir; gerçek Discord bot anahtarları burada çalışmaz.</p><Button asChild><Link to="/developers"><ExternalLink className="size-4" />Uygulamalarımı aç</Link></Button></div>
        <Section id="overview" title="Başlamadan önce"><p className="leading-7 text-muted-foreground">Bir SweeCord hesabı ve tamamlanmış profilin, sahibi olduğun bir sunucu ve bir metin kanalı gerekir. Örnekler bilgisayarında veya kendi sunucunda çalışır; portal kodunu senin yerine barındırmaz.</p><ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground"><li>JavaScript için Node.js 20 veya üzeri; Python için Python 3.10 veya üzeri.</li><li>Hızlı deneme için macOS/Linux terminali ve cURL yeterli. cURL örnekleri Bash içindir; PowerShell’de JavaScript veya Python örneğini kullanabilirsin.</li><li>Bu sürüm kanalları listelemeyi ve metin mesajı göndermeyi destekler; gelen mesajları dinleyen bir olay bağlantısı yoktur.</li></ul></Section>
        <Section id="application" title="1. Uygulama oluştur"><ol className="list-decimal space-y-2 pl-5 leading-7 text-muted-foreground"><li>Geliştirici Portalı’na giriş yap ve <strong className="text-foreground">Yeni uygulama</strong> seçeneğini aç.</li><li>Botun için 2–40 karakterlik bir ad yazıp <strong className="text-foreground">Oluştur</strong> düğmesine bas.</li><li><strong className="text-foreground">Genel</strong> sekmesinden adını ve en fazla 500 karakterlik açıklamasını düzenleyebilirsin.</li></ol><p className="text-sm leading-6 text-muted-foreground">Uygulama kimliği botu tanımlar; anahtarın yerine geçmez. Bot mesajlarında uygulama adı ve BOT etiketi görünür.</p></Section>
        <Section id="token" title="2. Anahtar oluştur ve güvenli sakla"><p className="leading-7 text-muted-foreground"><strong className="text-foreground">Bot</strong> sekmesindeki <strong className="text-foreground">Anahtarı oluştur / yenile</strong> düğmesine bas ve onayla. Anahtarı kopyalayıp özel bir yerde sakla. Sayfayı yeniledikten veya anahtarı gizledikten sonra aynı anahtarı yeniden görüntüleyemezsin.</p><p className="text-sm leading-6 text-muted-foreground">Yeni anahtar oluşturmak eskisini hemen iptal eder. Anahtar bir şifre gibi korunmalı; paylaşılırsa hemen yenilenmelidir. Aşağıdaki örneklerde gerçek anahtarı yalnızca kendi terminaline gir; kodun içine koyma.</p><CodeBlock title="Ortam değişkenleri" code={setup} /><p className="text-sm text-muted-foreground">Bu değerler terminal oturumu içindir. Komut geçmişini ve bilgisayarına erişimi koru; barındırma hizmetinde gizli ortam değişkenlerini kullan.</p></Section>
        <Section id="installation" title="3. Botu sunucuna ekle"><ol className="list-decimal space-y-2 pl-5 leading-7 text-muted-foreground"><li>Uygulamanın <strong className="text-foreground">Sunucular</strong> sekmesini aç.</li><li>Sahibi olduğun sunucuyu seç. Şu an yalnızca kendi botunu kendi sunucuna ekleyebilirsin.</li><li><strong className="text-foreground">Metin kanallarına mesaj gönder</strong> iznini aç ve <strong className="text-foreground">Sunucuya ekle</strong> düğmesine bas. İzin varsayılan olarak kapalıdır.</li><li>Bağlantı satırındaki <strong className="text-foreground">Sunucu kimliğini kopyala</strong> düğmesinden UUID’yi al; SWEECORD_SERVER_ID değerine yaz.</li></ol><p className="text-sm leading-6 text-muted-foreground">Bağlantının anahtarını kapatmak mesaj göndermeyi durdurur. Çöp kutusu botu sunucudan kaldırır. Sunucu kimliği davet kodu değildir.</p></Section>
        <Section id="channels" title="4. Kanal kimliğini bul"><p className="leading-7 text-muted-foreground">Aşağıdaki isteği çalıştır. Yanıttaki uygun metin kanalının <code>id</code> değerini SWEECORD_CHANNEL_ID olarak kaydet. Kimlikler geçerli UUID olmalıdır.</p><CodeBlock title="Bash · Kanalları listele" code={channels} /><CodeBlock title="Örnek yanıt · 200 OK (temsili kimlik)" code={'{\n  "channels": [\n    { "id": "11111111-1111-4111-8111-111111111111", "name": "genel", "type": "text" }\n  ]\n}'} /><p className="text-sm leading-6 text-muted-foreground">Liste yalnızca botun kurulu olduğu sunucudaki, @herkes için hem görme hem yazma izni açık metin kanallarını döndürür. Bot rol bazlı özel erişim kullanmaz. Liste boşsa kanal izinlerini kontrol et.</p></Section>
        <Section id="first-message" title="5. İlk mesajını gönder"><p className="leading-7 text-muted-foreground">Bir örnek seç. Başarılı istek <strong className="text-foreground">201 Created</strong> döndürür; ilgili SweeCord metin kanalını açıp mesajın bot adı ve BOT etiketiyle geldiğini kontrol et.</p><Tabs defaultValue="javascript"><TabsList className="mb-4"><TabsTrigger value="javascript">JavaScript</TabsTrigger><TabsTrigger value="python">Python</TabsTrigger><TabsTrigger value="curl">cURL</TabsTrigger></TabsList><TabsContent value="javascript"><CodeBlock title="bot.mjs" code={javascript} /></TabsContent><TabsContent value="python"><CodeBlock title="bot.py" code={python} /></TabsContent><TabsContent value="curl"><CodeBlock title="Bash · Mesaj gönder" code={curlMessage} /></TabsContent></Tabs><p className="text-sm leading-6 text-muted-foreground">Örnek bir mesaj gönderip biter. Düzenli duyuru için kendi barındırma hizmetindeki zamanlayıcıdan çalıştırabilirsin; sık tekrar veya sınırsız yeniden deneme kullanma.</p></Section>
        <Section id="api-reference" title="API referansı"><p className="break-all font-mono text-xs text-muted-foreground">Temel adres: {base}</p><p className="text-sm leading-6 text-muted-foreground">Her istekte <code>Authorization: Bot &lt;BOT_TOKEN&gt;</code> gerekir; <code>Bearer</code> kullanma. Anahtarı adresin içine veya sorgu parametresine ekleme.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="py-3 pr-4">İstek</th><th className="py-3 pr-4">Girdi</th><th className="py-3">Başarı</th></tr></thead><tbody className="text-muted-foreground"><tr className="border-b border-border"><td className="py-3 pr-4 font-mono">GET /channels</td><td className="py-3 pr-4">server_id: UUID (sorgu)</td><td className="py-3">200 · channels dizisi</td></tr><tr><td className="py-3 pr-4 font-mono">POST /messages</td><td className="py-3 pr-4">channel_id: UUID, content: metin (JSON)</td><td className="py-3">201 · oluşturulan mesaj</td></tr></tbody></table></div><p className="text-sm leading-6 text-muted-foreground">Mesaj metni baştaki ve sondaki boşluklar temizlendikten sonra 1–2000 karakter olmalıdır. POST isteğinde Content-Type: application/json gönder. Boş mesajlar ve hatalı kimlikler reddedilir.</p><CodeBlock title="Örnek mesaj yanıtı (temsili değerler)" code={'{\n  "id": "22222222-2222-4222-8222-222222222222",\n  "channel_id": "11111111-1111-4111-8111-111111111111",\n  "content": "Merhaba SweeCord!",\n  "bot_application_id": "33333333-3333-4333-8333-333333333333",\n  "created_at": "2026-10-18T09:45:00+00:00"\n}'} /></Section>
        <Section id="troubleshooting" title="Hata çözümleri"><dl className="space-y-5 text-sm leading-6">{[
          ["400 · Invalid input", "UUID’leri, JSON biçimini ve mesajın uzunluğunu kontrol et. Sunucu kimliğinin yerine davet kodu kullanma."],
          ["401 · Invalid bot token / Bot unavailable", "Anahtar eksik, hatalı, yenilenmiş veya uygulama silinmiş olabilir. Authorization başlığında Bot ve ardından bir boşluk kullan; geçerli anahtarını tekrar ayarla."],
          ["403 · Bot is not installed / Bot cannot send", "Botu doğru sunucuya ekle, mesaj iznini aç ve kanalın metin türünde, @herkes için görünür ve yazılabilir olduğunu doğrula."],
          ["413 · Request too large", "İstek gövdesini küçült. Metin mesajı gönder; dosyaları veya kodlanmış resimleri gövdeye koyma."],
          ["503 · Service unavailable", "Geçici hizmet sorunu olabilir. Kısa bir süre bekleyip sınırlı sayıda yeniden dene; anahtarını hata kayıtlarına yazma."],
          ["404 veya sayfa yanıtı", "Adresin /api/public/bots ile başladığını kontrol et. Yeni değişiklikler yayınlanan sitede henüz yoksa site sahibi güncellemeyi yayınlamalıdır."],
        ].map(([title, text]) => <div key={title}><dt className="font-semibold">{title}</dt><dd className="mt-1 text-muted-foreground">{text}</dd></div>)}</dl></Section>
        <Section id="security" title="Güvenlik ve mevcut sınırlar"><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-success" />Anahtarını koru</h3><ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground"><li>Anahtarı GitHub’a, ekran görüntüsüne, sohbete veya tarayıcıda çalışan JavaScript’e koyma. Örnekler güvenilir bilgisayarda ya da özel sunucuda çalıştırılmalıdır.</li><li>SweeCord anahtarın kendisini değil SHA-256 özetini saklar. Yenileme, önceki anahtarı geçersiz kılar.</li><li>Uygulamayı silmek anahtarı ve sunucu bağlantılarını kaldırır. Geçmiş mesajlar kanalda kalabilir.</li><li>Botlar bu sürümde özel mesaj, dosya, ses, ekran paylaşımı veya slash komutu kullanamaz; mesaj geçmişini okuyamaz ve gelen mesajlara otomatik cevap veremez.</li><li>Botlara kullanıcı rolleri atanmaz. Erişim, sunucu kurulumu, mesaj gönderme anahtarı ve kanalın @herkes izinleriyle sınırlıdır.</li><li>Bu sürüm için bir kota veya hız limiti garantisi sunulmuyor. Toplu mesaj ve spam gönderme; hata tekrarlarını sınırla.</li></ul></Section>
      </main>
    </div>
  </div>;
}