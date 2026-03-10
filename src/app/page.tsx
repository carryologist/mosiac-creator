import MosaicCreator from "@/components/MosaicCreator";

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          {/* LEGO brick icon */}
          <div className="w-9 h-9 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-500/20">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-1.5 h-1.5 bg-red-300 rounded-full" />
              <div className="w-1.5 h-1.5 bg-red-300 rounded-full" />
              <div className="w-1.5 h-1.5 bg-red-300 rounded-full" />
              <div className="w-1.5 h-1.5 bg-red-300 rounded-full" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              LEGO Mosaic Creator
            </h1>
            <p className="text-xs text-slate-500">
              Convert images to BrickLink Studio files
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-10">
        <MosaicCreator />
      </div>
    </main>
  );
}
