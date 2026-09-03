export interface DetectorSettings {
  patternLookback: number;
  supportResistanceTolerance: number;
  fibonacciLookback: number;
  volumeProfileLookback: number;
  volumeProfileBins: number;
  avwapAnchorLookback: number;
  trendlineLookback: number;
  confirmationBars: number;
}

export const DEFAULT_DETECTOR_SETTINGS: DetectorSettings = {
  patternLookback: 120,
  supportResistanceTolerance: 1.2,
  fibonacciLookback: 120,
  volumeProfileLookback: 80,
  volumeProfileBins: 24,
  avwapAnchorLookback: 60,
  trendlineLookback: 120,
  confirmationBars: 1,
};
