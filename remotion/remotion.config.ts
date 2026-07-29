import { Config } from "@remotion/cli/config";

// Deterministic, fast-decoding output — this is rendered daily in CI, not
// hand-tuned per video.
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setCodec("h264");
