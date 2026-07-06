import { Edition } from "./types";

export const mockEdition: Edition = {
  date: "2026-07-05",
  slug: "2026-07-05",
  themeTitle: "Digital Trust",
  themeDescription:
    "Why banks are investing heavily in AI, cybersecurity, and digital identity.",
  themeIcon: "shield",
  numberValue: "₹66.7 Lakh",
  numberLabel: "RBI penalty imposed on Bank of Baroda for regulatory non-compliance.",
  numberTrend: "up",
  vocabulary: [
    {
      term: "Periodic KYC Review",
      definition:
        "A scheduled re-verification of a customer's identity and details, done at intervals set by risk category, rather than only once at account opening.",
    },
    {
      term: "Repo Rate",
      definition:
        "The interest rate at which RBI lends short-term funds to commercial banks. It is the main lever RBI uses to control inflation.",
    },
    {
      term: "Systemic Risk",
      definition:
        "Risk that a failure in one institution or market could cascade and destabilize the entire financial system.",
    },
  ],
  questions: [
    {
      question: "Why did RBI impose the penalty?",
      answer:
        "For failing to complete periodic KYC updates within the required timeline for a segment of customer accounts.",
    },
    {
      question: "What is periodic KYC review?",
      answer:
        "A scheduled re-check of customer identity documents, required more frequently for higher-risk customers.",
    },
    {
      question: "How does this impact customers?",
      answer:
        "Customers may be asked to re-submit documents sooner than expected, and some transactions could be paused until KYC is complete.",
    },
    {
      question: "What are banks doing to improve compliance?",
      answer:
        "Most large banks are automating KYC tracking so reviews trigger themselves instead of relying on manual follow-up.",
    },
  ],
  stories: [
    {
      headline: "RBI issues new guidelines on periodic KYC review",
      slug: "rbi-periodic-kyc-review-guidelines",
      category: "Banking",
      summary: "What it means for banks and customers.",
      readMinutes: 6,
      sentiment: "caution",
      quickRead:
        "RBI tightened the timeline banks must follow for re-verifying customer identity, after several banks were found lagging on high-risk accounts.",
      understandRead:
        "RBI has shortened the window banks get to complete periodic KYC (Know Your Customer) reviews, especially for accounts flagged as higher-risk. The change follows inspection findings that several banks — including Bank of Baroda, fined today — were letting reviews lapse well past their due dates. Banks must now show an auditable trail proving each review happened on time, not just that it eventually happened.",
      deepDiveRead:
        "## Background\nKYC review cycles in India are risk-tiered: low-risk accounts are reviewed once a decade, medium-risk every 8 years, and high-risk accounts every 2 years. The gap RBI is closing is enforcement, not policy — the rules existed, but banks had no real-time way to prove compliance.\n\n## What changes operationally\nBanks must now integrate KYC due-dates into their core banking system so an account can be automatically flagged, and in some cases restricted, if a review lapses.\n\n## The counterargument\nSome bankers argue this pushes friction onto customers who did nothing wrong, and that risk-based supervision of the bank's *process* would achieve the same safety without inconveniencing depositors. RBI's position is that self-reported process audits have already failed once.\n\n## What to watch\nWhether smaller cooperative and regional banks — with weaker core banking systems — can meet the same technical bar as large private banks.",
      whatHappened:
        "RBI tightened enforcement of periodic KYC review timelines and fined Bank of Baroda ₹66.7 lakh for lapses.",
      whyToday:
        "The penalty was disclosed today alongside a fresh RBI circular clarifying the exact audit trail banks must maintain going forward.",
      whyCare:
        "If you bank with any of the institutions found lagging, you may be asked to re-verify your KYC sooner than you expect.",
      whatNext:
        "Expect other banks to proactively announce KYC catch-up drives over the next quarter to avoid similar penalties.",
      keyNumbers: [
        { label: "Penalty amount", value: "₹66.7 Lakh" },
        { label: "Accounts affected (est.)", value: "~40,000" },
        { label: "New review deadline", value: "90 days" },
      ],
      knowledgeChain: [
        "KYC Compliance",
        "Regulatory Risk",
        "Bank Reputation",
        "Cost of Compliance",
        "Credit Growth",
      ],
      ifYoureWondering: [
        {
          q: "Does this mean my bank is unsafe?",
          a: "No — this is a process penalty, not a solvency issue. Your deposits are not at risk because of this.",
        },
        {
          q: "Will I need to do anything?",
          a: "Only if your account was flagged for review — your bank will contact you directly if so.",
        },
      ],
      officialSources: [
        { label: "RBI Press Release", url: "https://rbi.org.in" },
        { label: "RBI KYC Master Direction", url: "https://rbi.org.in" },
      ],
    },
    {
      headline: "India's GDP growth outlook revised up",
      slug: "india-gdp-growth-outlook-revised",
      category: "Economy",
      summary: "Key factors driving the positive revision.",
      readMinutes: 5,
      sentiment: "positive",
      quickRead:
        "A major forecaster raised India's growth estimate, citing stronger-than-expected services exports and rural consumption.",
      understandRead:
        "The revised forecast reflects two forces: services exports (especially IT and business process outsourcing) growing faster than expected, and rural consumption recovering after a stronger monsoon. Together, these offset weaker-than-hoped manufacturing output.",
      deepDiveRead:
        "## Why forecasts move\nGrowth forecasts are revised as new high-frequency data (GST collections, PMI, exports) comes in ahead of the quarterly GDP print itself. This is a leading indicator, not a final number.\n\n## The rural angle\nRural consumption is disproportionately driven by agricultural income, which is itself driven by monsoon quality — this is why a single weather season can move a growth forecast for an entire year.\n\n## Risk to the upgrade\nGlobal services demand (a major driver here) is sensitive to a slowdown in the US and EU, so this upgrade partly depends on external demand holding up.",
      whatHappened:
        "A leading forecaster revised India's growth outlook upward for the year.",
      whyToday:
        "New GST collection and export data released this week came in above expectations, prompting the revision.",
      whyCare:
        "Growth forecasts influence interest rate expectations, which affect loan and deposit rates for everyone.",
      whatNext:
        "Watch the next RBI monetary policy meeting for whether this feeds into a rate decision.",
      keyNumbers: [
        { label: "Revised growth estimate", value: "6.9%" },
        { label: "Previous estimate", value: "6.5%" },
      ],
      knowledgeChain: [
        "GDP Growth",
        "Services Exports",
        "Rural Consumption",
        "Interest Rates",
        "Currency",
      ],
      ifYoureWondering: [
        {
          q: "Does higher growth mean higher interest rates?",
          a: "Not automatically — RBI weighs growth against inflation. Strong growth with controlled inflation can even support rate cuts.",
        },
      ],
      officialSources: [{ label: "Ministry of Finance", url: "https://pib.gov.in" }],
    },
    {
      headline: "AI continues to transform financial services",
      slug: "ai-transforms-financial-services",
      category: "Technology",
      summary: "How banks are using AI to improve customer experience.",
      readMinutes: 4,
      sentiment: "neutral",
      quickRead:
        "Indian banks are moving AI use beyond chatbots into fraud detection and credit underwriting.",
      understandRead:
        "The shift is from customer-facing AI (chatbots) to back-office AI that scores credit risk and flags fraud in real time. This matters because it changes approval speed and, potentially, who qualifies for credit.",
      deepDiveRead:
        "## From assistance to decisioning\nEarly banking AI answered questions. The current wave makes decisions — approving a loan, flagging a transaction — which raises the stakes on accuracy and explainability.\n\n## The regulatory gap\nRBI has issued guidance but no binding rules yet on explainability requirements for AI-driven credit decisions, unlike the EU's stricter approach.\n\n## Counterpoint\nCritics note that AI underwriting models trained on historical data can encode past biases, potentially disadvantaging first-time borrowers with thin credit files.",
      whatHappened:
        "Several large banks announced expanded AI use in fraud detection and loan underwriting.",
      whyToday:
        "Two banks published investor updates today highlighting AI-driven cost savings.",
      whyCare:
        "AI underwriting could mean faster loan approvals for you — or a rejection with less explanation than before.",
      whatNext:
        "Watch for RBI guidance on mandatory explainability for AI credit decisions.",
      keyNumbers: [{ label: "Fraud caught by AI systems (bank estimate)", value: "+31%" }],
      knowledgeChain: ["AI Underwriting", "Credit Access", "Financial Inclusion", "Regulation"],
      ifYoureWondering: [
        {
          q: "Can I ask why an AI rejected my loan?",
          a: "Yes — RBI's fair practice code requires banks to give a reason for rejection, though the detail level varies today.",
        },
      ],
      officialSources: [],
    },
    {
      headline: "Global markets react to policy changes",
      slug: "global-markets-react-policy-changes",
      category: "World",
      summary: "Key global events impacting markets today.",
      readMinutes: 5,
      sentiment: "caution",
      quickRead:
        "A shift in a major central bank's tone moved currency and bond markets worldwide today.",
      understandRead:
        "When a major central bank signals a change in interest rate direction, capital moves globally — investors reposition into or out of that currency's assets, which is why a single overseas statement can move Indian markets too.",
      deepDiveRead:
        "## Transmission mechanism\nCapital flows chase yield. A hint of higher rates abroad can pull investment away from emerging markets like India, pressuring the rupee and equity markets simultaneously.\n\n## India's buffer\nForex reserves act as a shock absorber — RBI can intervene to smooth currency volatility, within limits.\n\n## What's different this time\nAnalysts are split on whether this signals a sustained shift or a one-off statement; markets are pricing in roughly a 50-50 split.",
      whatHappened:
        "A major central bank's policy signal triggered volatility in currency and bond markets globally.",
      whyToday:
        "The statement was made in a policy meeting concluded today.",
      whyCare:
        "This can affect the rupee's value, which feeds into import prices and eventually inflation.",
      whatNext:
        "Watch RBI's forex reserve data and rupee movement over the next few trading sessions.",
      keyNumbers: [{ label: "Forex reserves", value: "$682 Bn" }],
      knowledgeChain: ["Global Rates", "Capital Flows", "Rupee", "Import Prices", "Inflation"],
      ifYoureWondering: [
        {
          q: "Does this affect my fixed deposit rate?",
          a: "Indirectly — sustained rupee pressure can influence RBI's domestic rate decisions over time, though not immediately.",
        },
      ],
      officialSources: [{ label: "RBI Forex Data", url: "https://rbi.org.in" }],
    },
  ],
};
