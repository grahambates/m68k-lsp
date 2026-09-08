import { FC } from "react";
import { formatTiming, Timing as TimingType, timingLevel } from "68kcounter";

export interface TimingProps {
  timing: TimingType;
  color?: boolean;
}

const Timing: FC<TimingProps> = ({ timing, color }) => {
  const className = color ? timingLevel(timing).toLowerCase() : "";
  return <span className={"Timing " + className}>{formatTiming(timing)}</span>;
};

export default Timing;
