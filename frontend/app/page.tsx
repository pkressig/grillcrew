export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold">GrillCrew FCTC</h1>
      <p className="text-base text-muted-foreground">
        Helfer- und Einsatzplanung für den FC Thusis-Cazis.
      </p>
      <p className="rounded-lg border border-border bg-muted p-4 text-base">
        Die Anwendung befindet sich im Aufbau. Der öffentliche Einsatzplan
        erscheint hier, sobald die erste Saison veröffentlicht ist.
      </p>
    </main>
  );
}
