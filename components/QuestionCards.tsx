const questions = [
    "Why did RBI fine this bank?",
    "What is Digital Trust?",
    "Will this affect customers?",
    "How does AI help banks?"
];

export default function QuestionCards() {
    return (
        <section className="py-20 bg-white">
            <div className="max-w-5xl mx-auto px-8">

                <h2 className="text-4xl font-bold mb-10">
                    If You're Wondering...
                </h2>

                <div className="space-y-4">

                    {questions.map((q) => (
                        <div
                            key={q}
                            className="rounded-xl border p-5 hover:bg-slate-50 cursor-pointer transition"
                        >
                            ❓ {q}
                        </div>
                    ))}

                </div>

            </div>
        </section>
    );
}