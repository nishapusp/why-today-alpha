import type { Metadata } from "next";
import PulseFeed from "@/components/PulseFeed";

export const metadata: Metadata = {
  title: "Pulse — Why Today",
  description: "Quick reads on the day's major financial and market-moving stories.",
};

export default function PulsePage() {
  return <PulseFeed />;
}
