import type { Metadata } from "next";
import QuickReadsFeed from "@/components/QuickReadsFeed";

export const metadata: Metadata = {
  title: "Quick Reads — Why Today",
  description: "Quick reads on the day's major financial and market-moving stories.",
};

export default function QuickReadsPage() {
  return <QuickReadsFeed />;
}
