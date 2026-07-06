export default function ThemeCard() {
    return (
        <section className="bg-white py-20">
            <div className="max-w-6xl mx-auto px-8">

                <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-cyan-50 to-blue-50 p-10 shadow-lg">

                    <p className="uppercase tracking-widest text-cyan-700 font-semibold">
                        Today's Theme
                    </p>

                    <h2 className="text-4xl font-bold mt-3 text-slate-900">
                        Digital Trust
                    </h2>

                    <p className="mt-5 text-lg text-slate-600 max-w-3xl">
                        Why banks are investing billions in cybersecurity,
                        AI, fraud detection and digital identity.
                    </p>

                    <button className="mt-8 bg-cyan-600 text-white px-6 py-3 rounded-xl hover:bg-cyan-700 transition">
                        Read in 8 minutes →
                    </button>

                </div>

            </div>
        </section>
    );
}