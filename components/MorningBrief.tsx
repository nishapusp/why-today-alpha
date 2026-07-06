const cards = [
    {
        title: "🏦 Banking",
        text: "RBI issues new operational guidelines."
    },
    {
        title: "📈 Economy",
        text: "India's GDP outlook revised upward."
    },
    {
        title: "💻 Technology",
        text: "AI continues transforming financial services."
    },
    {
        title: "🌍 World",
        text: "Global markets react to policy changes."
    }
];

export default function MorningBrief() {
    return (
        <section className="py-20 bg-slate-100">
            <div className="max-w-6xl mx-auto px-8">

                <h2 className="text-4xl font-bold mb-10">
                    Morning Brief
                </h2>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">

                    {cards.map((card) => (

                        <div
                            key={card.title}
                            className="bg-white rounded-2xl p-6 shadow hover:shadow-xl transition"
                        >
                            <h3 className="font-bold text-xl">
                                {card.title}
                            </h3>

                            <p className="mt-4 text-slate-600">
                                {card.text}
                            </p>

                            <button className="mt-6 text-cyan-600 font-semibold">
                                Read →
                            </button>

                        </div>

                    ))}

                </div>

            </div>
        </section>
    );
}