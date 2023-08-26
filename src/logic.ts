import { Signal, computed, effect, signal } from '@preact/signals';
import { DisplayEntry, LinkKey, PluginConfig, ReverseIndex, getDisplayEntry } from "./data";

/**
 * Set up the signals to derive the entries in the plugin display.
 */
export function deriveDisplayEntries(
  index: ReverseIndex,
  update: Signal<number>,
  config: Signal<PluginConfig>
): Signal<DisplayEntry[]> {
  const regexes = computed(() => {
    return config.value.disallowedPaths
      .filter((path) => path.length > 0)
      .map((pattern) => new RegExp(pattern))}
  )

  const getDisplayEntries = (conf: PluginConfig, res: RegExp[]) => {
    return Object.entries(index)
      .reduce<Record<LinkKey, DisplayEntry>>((acc, [key, indexEntry]) => {
        if (indexEntry.link.isResolved) {
          const path = indexEntry.link.path
          if (res.some((r) => r.test(path))) { 
            return acc 
          }
        }
        const entry = getDisplayEntry(indexEntry, conf.weightHalflife, conf.displayDays)
        if (entry.total > 0) {
          acc[key] = entry
        }
        return acc
      }, {})
    }

  // Initialize
  const displayEntries = signal<Record<LinkKey, DisplayEntry>>(getDisplayEntries(config.value, regexes.value))

  // Full refresh on any of the signal changes
  // Could be more efficient if we didn't recompute unchanged entries...
  // Store the "update counter" on each entry?
  effect(() => {
    update.value; // Subscribe to signal
    displayEntries.value = getDisplayEntries(config.value, regexes.value)
  })

  // Updates whenever displayEntries is recomputed
  const topN: Signal<DisplayEntry[]> = computed(() => {
    return Object.values(displayEntries.value)
      .sort(((e1, e2) => e2.weight - e1.weight))  // Weight descending
      .slice(0, config.value.displayCount)
  })

  return topN
}