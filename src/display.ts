import { Signal, computed, effect, signal } from '@preact/signals';
import { DateNumber, DisplayEntry, LinkKey, LinkType, LinksByDay, PluginConfig, ReverseIndex, ReverseIndexEntry } from "./data";


/* DISPLAY UPDATE FUNCTIONS */

/**
 * Generates the list of links displayed in the plugin. The top `maxLength` entries
 * are chosen based on the exponentially-weighted sum of the count of links
 * per day. 
 */
function getDisplayEntry(
  entry: ReverseIndexEntry,
  weightHalflife: number,
  displayDays: number
): DisplayEntry {
  const counts = countlinksByDate(entry, displayDays)
  const total = counts.reduce((acc, cur) => acc + cur, 0)
  return {
    link: entry.link,
    counts: counts,
    total: total,
    weight: weightLinksByDay(counts, weightHalflife)
  }
}

/**
 * Return an array of length `max_days` representing the number of links
 * on each day: [t - (max_days - 1), ..., t-2, yesterday, today ]
 */
export function countlinksByDate(links: ReverseIndexEntry, maxDays: number): LinksByDay {
  const today = new Date().setHours(0, 0, 0, 0)
  const msPerDay = 1000 * 60 * 60 * 24
  const init: LinksByDay = new Array<number>(maxDays).fill(0)
  return Object
    .values(links.linksBySource)
    .reduce((acc: LinksByDay, cur: DateNumber) => {
        const diffDays = Math.floor((today - (new Date(cur)).setHours(0, 0, 0, 0)) / msPerDay)
        if (diffDays < 0) {
          acc[maxDays - 1] = acc[maxDays - 1] + 1
        } else if (diffDays < maxDays) {
          acc[maxDays - diffDays - 1] = acc[maxDays - diffDays - 1] + 1
        }
        return acc
      }, 
      init
    )
}

/**
 * Returns sum_n c_n * exp(-n / falloff)), where c_n = the count of links created n days ago.
 */
function weightLinksByDay(counts: LinksByDay, weightHalflife: number): number {
  return counts.reduce((acc: number, cur: number, i: number) => {
    const nDaysAgo = counts.length - i - 1
    // nDaysAgo = weightHalflife => downweight of 1/2
    // exp(-1) * 1.359 = 1/2
    return acc + cur * 1.359 * Math.exp(-1 * nDaysAgo / weightHalflife )
  }, 0)
}


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
        if (indexEntry.link.linkType == LinkType.RESOLVED) {
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