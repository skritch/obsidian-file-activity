

export type PathStr = string;
export type LinkText = string;
export type DateNumber = number;
export type LinksByDay = Array<number>;
export type ResolvedLink = {
  isResolved: true
  path: PathStr
}
export type UnresolvedLink = {
  isResolved: false
  text: LinkText
}
export type LinkKey = PathStr | LinkText
export type Link = ResolvedLink | UnresolvedLink
const keyForLink = (link: Link): LinkKey => {return (link.isResolved) ? link.path : link.text};
export interface ReverseIndexEntry {
  link: Link,
  // Path of file which links to this one => file created ts
  linksBySource: Record<PathStr, DateNumber>,
}
// Reverse index of path/link text => everything that links to it.
export type ReverseIndex = Record<LinkKey, ReverseIndexEntry>

// Only plugin configuration is saved to storage
export interface PluginConfig {
  // Settings
  displayDays: number,
  displayCount: number,
  weightHalflife: number,
  disallowedPaths: string[],
  openType: "split" | "window" | "tab"
}

// Data for entries in the UI
export interface DisplayEntry {
  link: Link,
  counts: LinksByDay,
  total: number,
  weight: number,
}

export const DEFAULT_CONFIG: PluginConfig = {
  displayDays: 31,
  weightHalflife: 10,
  disallowedPaths: [],
  displayCount: 50,
  openType: 'tab'
};

/* INDEX UPDATE EVENT HANDLERS */

/**
 * Sync our state with a current list of links for a given source.
 */
export function update(
  sourcePath: PathStr,
  createTime: DateNumber,
  links: Array<Link>,
  index: ReverseIndex
) {
  // Update reverse index to reflect new links
  links.forEach((link) => {
    const key = keyForLink(link)
    if (index[key] === undefined) {
      index[key] = {
        link: link,
        linksBySource: {[sourcePath]: createTime},
      }
    } else {
      index[key].linksBySource[sourcePath] = createTime
    }
  })

  removeDeadLinks(sourcePath, links.map(keyForLink), index)
}

/**
 * Remove entries in a reverse index which are no longer found in `links`.
 */
function removeDeadLinks(
  sourcePath: PathStr,
  links: Array<LinkKey>, 
  index: ReverseIndex
) {
  Object.entries(index)
    .forEach(([key, targetLinks]: [LinkKey, ReverseIndexEntry]) => {
      if (
        targetLinks.linksBySource[sourcePath] !== undefined 
        && !links.includes(key)
      ) {
        delete targetLinks.linksBySource[sourcePath]
        // Remove the entry entirely if no links remain
        if (Object.keys(targetLinks.linksBySource).length == 0) {
          delete index[key]
        }
      }
    });
}

/**
 * Update state to reflect the renaming of a file. 
 * - Update its existing outgoing links to use the new path. (Implemented as delete + update)
 */
export function rename(
  path: PathStr,
  oldPath: PathStr,
  createTime: DateNumber,
  newLinks: Array<Link>,
  index: ReverseIndex
) {
  remove(oldPath, index)
  update(path, createTime, newLinks, index)
}

/**
 * Update state to reflect the deleting of a file.
 */
export function remove(
  path: PathStr, 
  index: ReverseIndex
) {
  // Obsidian will re-resolve any files which linked to this one, so we don't need to
  // handle converting them to unresolved links. So we don't have to do that.
  delete index[path]
  removeDeadLinks(path, [], index);
}

/* DISPLAY UPDATE FUNCTIONS */

/**
 * Generates the list of links displayed in the plugin. The top `maxLength` entries
 * are chosen based on the exponentially-weighted sum of the count of links
 * per day. 
 */
export function getDisplayEntry(
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

// TODO: can we use Obsidian's own function for this? MetadataCache.fileToLinktext?
// TODO: strip path#heading suffixes
export function pathToLinkText(path: PathStr): LinkText {
  return path.replace(/^.*\//, '').replace(/\.[^/.]+$/, '')
}
