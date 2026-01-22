// ABOUTME: Compact help tooltip component for inline hints
// ABOUTME: Shows question mark icon that reveals help text on hover

import * as Tooltip from "@radix-ui/react-tooltip";
import { QuestionMarkCircledIcon } from "@radix-ui/react-icons";

interface HelpTooltipProps {
  content: string;
  side?: "top" | "right" | "bottom" | "left";
}

export function HelpTooltip({ content, side = "top" }: HelpTooltipProps) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center w-4 h-4 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <QuestionMarkCircledIcon className="w-3.5 h-3.5" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="max-w-[200px] px-3 py-2 text-xs bg-gray-800 text-gray-300 rounded shadow-lg border border-gray-700 z-50"
            sideOffset={5}
            side={side}
          >
            {content}
            <Tooltip.Arrow className="fill-gray-800" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
