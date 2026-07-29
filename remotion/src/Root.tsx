import React from "react";
import { Composition, CalculateMetadataFunction } from "remotion";
import StoryVideo, { StoryVideoProps, totalDurationInFrames } from "./StoryVideo";
import { getVisualTheme } from "../../lib/visualEngine/theme";
import { classifyStory } from "../../lib/visualEngine/classify";
import { buildVisualBlueprint } from "../../lib/visualEngine/blueprint";
import type { Story } from "../../lib/types";

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

// Placeholder story so the composition has valid defaultProps for Remotion
// Studio's preview — real props are always passed explicitly by render.ts.
const PLACEHOLDER_STORY: Story = {
  headline: "Why did India's factories just hit a 22-month high?",
  slug: "placeholder",
  category: "Economy",
  summary: "India's industrial production surged in June 2026, its fastest growth in 22 months.",
  quickRead: "",
  understandRead: "",
  deepDiveRead: "",
  whatHappened: "",
  whyToday: "",
  whyCare: "",
  whatNext: "",
  keyNumbers: [{ label: "June 2026 IIP Growth", value: "7.3%", previousValue: "6.2%", previousLabel: "May 2026" }],
  knowledgeChain: [],
  ifYoureWondering: [],
  officialSources: [],
  readMinutes: 3,
  sentiment: "positive",
};

const placeholderClassification = classifyStory(PLACEHOLDER_STORY);
const placeholderTheme = getVisualTheme(PLACEHOLDER_STORY);
const placeholderBlueprint = buildVisualBlueprint(PLACEHOLDER_STORY, placeholderClassification, placeholderTheme);

const calculateMetadata: CalculateMetadataFunction<StoryVideoProps> = ({ props }) => ({
  durationInFrames: totalDurationInFrames(props.blueprint, FPS, Boolean(props.headlineImageUrl)),
});

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="StoryVideo"
      component={StoryVideo}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      durationInFrames={totalDurationInFrames(placeholderBlueprint, FPS, false)}
      defaultProps={{ blueprint: placeholderBlueprint } satisfies StoryVideoProps}
      calculateMetadata={calculateMetadata}
    />
  );
};
