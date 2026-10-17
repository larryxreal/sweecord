import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Bot, ArrowLeft, Plus, Copy, KeyRound, Trash2, Save, Terminal, Server, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getDeveloperPortal, createBotApplication, updateBotApplication, resetBotToken, installBot, removeBotInstallation, deleteBotApplication } from "@/lib/bots.functions";
import { cn } from "@/lib/utils";

const portalOptions = queryOptions({ queryKey: ["developer-portal"], queryFn: () => getDeveloperPortal() });
export const Route = createFileRoute("/_authenticated/developers")({
  loader: ({ context }) => context.queryClient.ensureQueryData(portalOptions),
  head: () => ({ meta: [
    { title: "Geliştirici Portalı — SweeCord" },
    { name: "description", content: "SweeCord bot uygulamalarını, erişim anahtarlarını ve sunucu kurulumlarını yönet." },
    { property: "og:title", content: "Geliştirici Portalı — SweeCord" },
    { property: "og:description", content: "SweeCord botları için uygulama yönetimi." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: DeveloperPortal,
});

function DeveloperPortal() {
  const { data } = useSuspenseQuery(portalOptions);
  const qc = useQueryClient();
  const create = useServerFn(createBotApplication);
  const update = useServerFn(updateBotApplication);
  const reset = useServerFn(resetBotToken);
  const install = useServerFn(installBot);
  const remove = useServerFn(removeBotInstallation);
  const deleteApp = useServerFn(deleteBotApplication);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const app = data.apps.find(a => a.id === selectedId) ?? data.apps[0];
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["developer-portal"] });
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try { await action(); await refresh(); toast.success(success); }
    catch (e) { toast.error(e instanceof Error ? e.message : "İşlem tamamlanamadı"); }
    finally { setBusy(false); }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); toast.success("Kopyalandı"); }
    catch { toast.error("Kopyalanamadı"); }
  }
  return <div className="min-h-screen bg-background text-foreground">
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-rail px-5 py-3 md:px-8">
      <div className="flex items-center gap-3"><Bot className="size-7 text-primary" /><div><p className="font-bold">SweeCord</p><p className="text-xs text-muted-foreground">Geliştirici Portalı</p></div></div>
      <Button variant="ghost" asChild><Link to="/app"><ArrowLeft className="size-4" />Sohbete dön</Link></Button>
    </header>
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:grid-cols-[240px_minmax(0,1fr)] md:px-8">
      <aside className="space-y-4">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-muted-foreground">UYGULAMALAR</h2><Button size="icon" variant="ghost" aria-label="Yeni uygulama" onClick={() => setCreateOpen(true)}><Plus className="size-4" /></Button></div>
        {data.apps.map(a => <Button key={a.id} variant="ghost" className={cn("h-auto w-full justify-start gap-3 py-3", app?.id === a.id && "bg-accent")} onClick={() => { setSelectedId(a.id); setToken(null); }}><Bot className="size-5 shrink-0 text-primary" /><span className="truncate">{a.name}</span></Button>)}
        <Button variant="outline" className="w-full" onClick={() => setCreateOpen(true)}><Plus className="size-4" />Yeni uygulama</Button>
      </aside>
      <main className="min-w-0">
        {!app ? <div className="py-16 text-center"><Bot className="mx-auto size-16 text-primary" /><h1 className="mt-6 text-2xl font-bold">Bot uygulamaların</h1><p className="mt-2 text-muted-foreground">Henüz uygulama yok.</p><Button className="mt-6" onClick={() => setCreateOpen(true)}><Plus className="size-4" />Uygulama oluştur</Button></div> : <>
          <div className="mb-6 flex items-center gap-4"><div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-primary/15"><Bot className="size-8 text-primary" /></div><div className="min-w-0"><h1 className="break-words text-2xl font-bold">{app.name}</h1><div className="mt-1 flex items-center gap-2"><p className="truncate font-mono text-xs text-muted-foreground">{app.id}</p><Button size="icon" variant="ghost" className="size-6" aria-label="Uygulama kimliğini kopyala" onClick={() => copy(app.id)}><Copy className="size-3" /></Button></div></div></div>
          <Tabs defaultValue="general" key={app.id}><TabsList className="mb-6 flex h-auto flex-wrap justify-start"><TabsTrigger value="general">Genel</TabsTrigger><TabsTrigger value="bot">Bot</TabsTrigger><TabsTrigger value="servers">Sunucular</TabsTrigger><TabsTrigger value="api">API</TabsTrigger></TabsList>
            <TabsContent value="general"><ApplicationForm key={app.id + app.name + app.description} app={app} busy={busy} onSave={(name, description) => run(() => update({ data: { applicationId: app.id, name, description } }), "Uygulama kaydedildi")} />
              <div className="mt-10 border-t border-border pt-6"><Button variant="destructive" disabled={busy} onClick={() => { if (confirm(`"${app.name}" silinsin mi? Anahtarı ve sunucu bağlantıları iptal edilir.`)) void run(async () => { await deleteApp({ data: { applicationId: app.id } }); setToken(null); setSelectedId(null); }, "Uygulama silindi"); }}><Trash2 className="size-4" />Uygulamayı sil</Button></div>
            </TabsContent>
            <TabsContent value="bot" className="space-y-6"><h2 className="text-lg font-semibold">Bot erişim anahtarı</h2><p className="text-sm text-muted-foreground">Anahtar yalnızca oluşturulduğunda gösterilir. Yenilemek önceki anahtarı hemen iptal eder. Anahtarını kimseyle paylaşma.</p>
              <Button disabled={busy} onClick={() => { if (confirm("Yeni anahtar oluşturulsun mu? Önceki anahtar artık çalışmaz.")) void run(async () => { const result = await reset({ data: { applicationId: app.id } }); setToken(result.token); }, "Yeni anahtar oluşturuldu"); }}><KeyRound className="size-4" />Anahtarı oluştur / yenile</Button>
              {token && <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-3"><Input type="password" readOnly value={token} aria-label="Bot anahtarı" className="font-mono" /><Button variant="secondary" size="icon" aria-label="Anahtarı kopyala" onClick={() => copy(token)}><Copy className="size-4" /></Button><Button variant="ghost" size="icon" aria-label="Anahtarı gizle" onClick={() => setToken(null)}><X className="size-4" /></Button></div>}
            </TabsContent>
            <TabsContent value="servers" className="space-y-6"><h2 className="text-lg font-semibold">Sunucu bağlantıları</h2><InstallationForm servers={data.servers} busy={busy} onInstall={(serverId, canSend) => run(() => install({ data: { applicationId: app.id, serverId, canSend } }), "Bot sunucuya eklendi")} />
              <div className="divide-y divide-border">{data.installations.filter(i => i.application_id === app.id).map(i => <div key={i.server_id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="flex min-w-0 items-center gap-3"><Server className="size-5 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="break-all text-sm font-semibold">{data.servers.find(s => s.id === i.server_id)?.name ?? i.server_id}</p><p className="text-xs text-muted-foreground">{i.can_send ? "Mesaj gönderme açık" : "Mesaj gönderme kapalı"}</p><Button size="sm" variant="ghost" className="mt-1 h-6 px-0 text-xs" onClick={() => copy(i.server_id)}>Sunucu kimliğini kopyala</Button></div></div><div className="flex items-center gap-3"><Switch aria-label="Bot mesaj gönderme izni" checked={i.can_send} disabled={busy} onCheckedChange={canSend => { void run(() => install({ data: { applicationId: app.id, serverId: i.server_id, canSend } }), "Bot izni güncellendi"); }} /><Button variant="ghost" size="icon" aria-label="Botu sunucudan kaldır" disabled={busy} onClick={() => { if (confirm("Bot sunucudan kaldırılsın mı?")) void run(() => remove({ data: { applicationId: app.id, serverId: i.server_id } }), "Bot kaldırıldı"); }}><Trash2 className="size-4 text-destructive" /></Button></div></div>)}</div>
            </TabsContent>
            <TabsContent value="api" className="space-y-6"><div className="flex items-center gap-2"><Terminal className="size-5 text-primary" /><h2 className="text-lg font-semibold">Bot API · v1</h2></div><p className="text-sm text-muted-foreground">Authorization: Bot &lt;BOT_TOKEN&gt;. Botlar yalnızca eklendikleri sunucularda, @herkes için görme ve yazma izni açık metin kanallarına mesaj gönderebilir. Mesajlar en fazla 2000 karakterdir.</p><ApiExample />
              <p className="text-sm text-muted-foreground">Bu sürüm metin mesajı göndermeyi destekler. Mesaj geçmişi, olay bağlantısı, ses bağlantısı ve slash komutları henüz desteklenmiyor.</p>
            </TabsContent>
          </Tabs>
        </>}
      </main>
    </div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Yeni uygulama</DialogTitle><DialogDescription>Botunun SweeCord’da görünen adı.</DialogDescription></DialogHeader><form onSubmit={e => { e.preventDefault(); void run(async () => { const result = await create({ data: { name: newName, description: "" } }); setSelectedId(result.id); setNewName(""); setCreateOpen(false); setToken(null); }, "Uygulama oluşturuldu"); }}><Label htmlFor="new-app-name">Uygulama adı</Label><Input id="new-app-name" className="mt-2" value={newName} onChange={e => setNewName(e.target.value)} minLength={2} maxLength={40} required autoFocus /><DialogFooter className="mt-6"><Button variant="ghost" type="button" onClick={() => setCreateOpen(false)}>Vazgeç</Button><Button disabled={busy || newName.trim().length < 2} type="submit">Oluştur</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}

function ApplicationForm({ app, busy, onSave }: { app: { name: string; description: string }; busy: boolean; onSave: (name: string, description: string) => Promise<void> }) {
  const [name, setName] = useState(app.name); const [description, setDescription] = useState(app.description);
  return <form className="space-y-6" onSubmit={e => { e.preventDefault(); void onSave(name, description); }}><div className="space-y-2"><Label htmlFor="app-name">Uygulama adı</Label><Input id="app-name" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={40} required /></div><div className="space-y-2"><Label htmlFor="app-description">Açıklama</Label><Textarea id="app-description" value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={4} /></div><Button disabled={busy} type="submit"><Save className="size-4" />Değişiklikleri kaydet</Button></form>;
}

function InstallationForm({ servers, busy, onInstall }: { servers: { id: string; name: string }[]; busy: boolean; onInstall: (serverId: string, canSend: boolean) => Promise<void> }) {
  const [serverId, setServerId] = useState(""); const [canSend, setCanSend] = useState(false);
  return <form className="space-y-4 border-b border-border pb-6" onSubmit={e => { e.preventDefault(); void onInstall(serverId, canSend); }}><Label>Sunucu</Label><Select value={serverId} onValueChange={setServerId}><SelectTrigger aria-label="Botun ekleneceği sunucu"><SelectValue placeholder="Sahip olduğun bir sunucu seç" /></SelectTrigger><SelectContent>{servers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select><div className="flex items-center justify-between gap-4"><Label htmlFor="bot-can-send">Metin kanallarına mesaj gönder</Label><Switch id="bot-can-send" checked={canSend} onCheckedChange={setCanSend} /></div><Button disabled={busy || !serverId} type="submit"><Plus className="size-4" />Sunucuya ekle</Button>{!servers.length && <p className="text-sm text-muted-foreground">Sahip olduğun bir sunucu yok.</p>}</form>;
}

function ApiExample() {
  const base = "https://sweecord.lovable.app/api/public/bots";
  return <div className="space-y-4"><div><p className="mb-2 text-sm font-semibold">Kanalları listele</p><pre className="overflow-x-auto rounded-md bg-rail p-4 font-mono text-xs leading-relaxed">{`curl '${base}/channels?server_id=<SERVER_ID>' \\\n+  -H 'Authorization: Bot <BOT_TOKEN>'`}</pre></div><div><p className="mb-2 text-sm font-semibold">Mesaj gönder</p><pre className="overflow-x-auto rounded-md bg-rail p-4 font-mono text-xs leading-relaxed">{`curl -X POST '${base}/messages' \\\n+  -H 'Authorization: Bot <BOT_TOKEN>' \\\n+  -H 'Content-Type: application/json' \\\n+  -d '{"channel_id":"<CHANNEL_ID>","content":"Merhaba SweeCord!"}'`}</pre></div></div>;
}