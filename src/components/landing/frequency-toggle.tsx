import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import type React from "react";

export type FREQUENCY = "monthly" | "yearly";

type FrequencyToggleProps = React.ComponentProps<"div"> & {
  frequency: FREQUENCY;
  setFrequency: React.Dispatch<React.SetStateAction<FREQUENCY>>;
  frequencies?: FREQUENCY[];
};

export function FrequencyToggle({
  frequency,
  setFrequency,
  frequencies = ["monthly", "yearly"],
  className,
  ...props
}: FrequencyToggleProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-fit rounded-xl border bg-white/70 backdrop-blur p-1 shadow-sm",
        className
      )}
      style={{ borderColor: "rgba(4,44,83,0.12)" }}
      {...props}
    >
      {frequencies.map((freq) => (
        <button
          className="relative px-4 py-1.5 text-sm capitalize font-medium"
          key={freq}
          onClick={() => setFrequency(freq)}
          type="button"
          style={{ color: frequency === freq ? "#ffffff" : "#3d4f66" }}
        >
          <span className="relative z-10">{freq}</span>
          {frequency === freq && (
            <motion.span
              className="absolute inset-0 z-0 rounded-lg"
              style={{ background: "linear-gradient(135deg,#042C53 0%,#185FA5 50%,#1D9E75 100%)" }}
              layoutId="vela-frequency"
              transition={{ type: "spring", duration: 0.4 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}