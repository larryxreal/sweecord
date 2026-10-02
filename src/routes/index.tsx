import { createFileRoute, Link } from "@tanstack/react-router";
import { MessagesSquare, Hash, Users, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SweeCord — İnsanlarla sohbet et" },
      {
        name: "description",
        content:
          "SweeCord ile kendi sunucunu kur, kanallar aç ve arkadaşlarınla anlık sohbet et.",
      },
      { property: "og:title", content: "SweeCord — İnsanlarla sohbet et" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        property: "og:description",
        content: "Sunucunu kur, kanallar aç, arkadaşlarınla anlık sohbet et.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: MessagesSquare,
    title: "Anlık sohbet",
    text: "Mesajlar herkese anında ulaşır, yenilemeye gerek yok.",
  },
  {
    icon: Hash,
    title: "Kanallar",
    text: "Konuları ayrı kanallara böl, sohbet dağılmasın.",
  },
  {
    icon: Users,
    title: "Sunucular",
    text: "Davet koduyla arkadaşlarını topluluğuna çağır.",
  },
  {
    icon: ShieldCheck,
    title: "Güvenli",
    text: "Sunucu içeriğini yalnızca üyeler görebilir.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-rail">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-2xl bg-primary">
            <MessagesSquare className="size-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-extrabold tracking-tight">SweeCord</span>
        </div>
        <Link
          to="/auth"
          className="rounded-full bg-card px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          Giriş yap
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="py-16 text-center md:py-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
            Topluluğun için bir yer
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
            SweeCord sade ve hızlı bir sohbet alanı. Sunucunu kur, kanallarını aç,
            arkadaşlarınla konuşmaya başla.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Ücretsiz katıl
            </Link>
            <Link
              to="/auth"
              className="rounded-full bg-card px-7 py-3 text-sm font-semibold transition-colors hover:bg-accent"
            >
              Hesabım var
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl bg-card p-6 shadow-panel">
              <f.icon className="size-6 text-primary" />
              <h2 className="mt-4 text-base font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
