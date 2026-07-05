export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">

      {/* Hero Section */}

      <section className="max-w-6xl mx-auto px-6 py-16">

        <p className="text-blue-600 font-semibold">
          🌍 WHY TODAY
        </p>

        <h1 className="text-5xl font-bold mt-4 leading-tight">
          Understand today's world,
          <br />
          not just today's news.
        </h1>

        <p className="mt-6 text-xl text-gray-600 max-w-2xl">
          Every morning, Why Today helps you understand
          the stories shaping our world through context,
          curiosity and clarity.
        </p>

        <div className="mt-10 flex gap-4">

          <button className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition">

            Start Today's Journey

          </button>

          <button className="border px-6 py-3 rounded-xl">

            Explore Archive

          </button>

        </div>

      </section>

    </main>
  );
}