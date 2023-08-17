

export type PathStr = string;
export type LinkText = string;
export type DateNumber = number;
export type LinksByDay = Array<number>;
export type ResolvedLink = {
  isResolved: true
  path: PathStr
  text: LinkText
}
export type UnresolvedLink = {
  isResolved: false
  text: LinkText
}
export type LinkKey = PathStr | LinkText
export type Link = ResolvedLink | UnresolvedLink
const keyForLink = (link: Link): LinkKey => {return (link.isResolved) ? link.path : link.text};
export interface ReverseIndexEntry {
  text: LinkText,
  isResolved: boolean,
  linksBySource: Record<PathStr, DateNumber>,
}

/**
 * Full state of the plugin
 */
export interface FileActivityPluginData {
  reverseIndex: Record<LinkKey, ReverseIndexEntry>,
  // Path -> last seen modification time
  modTimes: Record<PathStr, DateNumber>,

  // Settings
  activityTTLdays: number, // Maybe we ignore links in files older than this many days?
  weightFalloff: number,  // Number greater than zero. Higher = more recent links go to the top of the list.
  maxLength: number,
  disallowedPaths: string[],
  openType: string
}

export interface DisplayEntry {
  name: LinkText,
  counts: LinksByDay,
  total: number,
  weight: number,
  path?: PathStr
}

// A function returning the default data (safer since we mutate)
export const DEFAULT_DATA = ():  FileActivityPluginData => { 
  return {
    reverseIndex: {},
    modTimes: {},
    activityTTLdays: 31,
    weightFalloff: 7,
    disallowedPaths: [],
    maxLength: 50,
    openType: 'tab'
  }
};

/**
 * Sync our state with a current list of links for a given source.
 */
export function update(
  sourcePath: PathStr, 
  modTime: DateNumber,
  links: Array<Link>,
  data: FileActivityPluginData
) {
  // No-op if we've seen a newer resolve event for this file.
  if (data.modTimes[sourcePath] >= modTime) {
    return
  } else {
    data.modTimes[sourcePath] = modTime
  }
  
  // Update reverse index to reflect new links
  links.forEach((link) => {
    let key = keyForLink(link)
    if (data.reverseIndex[key] === undefined) {
      data.reverseIndex[key] = {
        text: link.isResolved ? link.text : link.text,
        linksBySource: {[sourcePath]: modTime},
        isResolved: link.isResolved
      }
    } else {
      data.reverseIndex[key].linksBySource[sourcePath] = modTime
    }
  })

  removeDeadLinks(sourcePath, links.map(keyForLink), data.reverseIndex)
}

/**
 * Remove entries in a reverse index which are no longer found in `links`.
 */
function removeDeadLinks(
  sourcePath: PathStr,
  links: Array<LinkKey>, 
  index: Record<LinkKey, ReverseIndexEntry>
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
      };
    });
}

/**
 * Update state to reflect the renaming of a file. 
 * - Update its existing outgoing links to use the new path. (Implemented as delete + update)
 */
export function rename(
  path: PathStr,
  oldPath: PathStr,
  modTime: DateNumber,
  newLinks: Array<Link>,
  data: FileActivityPluginData
) {
  remove(oldPath, data)
  update(path, modTime, newLinks, data)
}

/**
 * Update state to reflect the deleting of a file.
 */
export function remove(
  path: PathStr, 
  data: FileActivityPluginData
) {
  delete data.reverseIndex[path]
  delete data.modTimes[path]
  removeDeadLinks(path, [], data.reverseIndex);
  // Obsidian will re-resolve any files which linked to this one, so we don't need to
  // handle converting them to unresolved links. So we don't have to do that.
}


/**
 * Generates the list of links displayed in the plugin. The top `maxLength` entries
 * are chosen based on the exponentially-weighted sum of the count of links
 * per day.
 * 
 * TODO: this going to get calculated for every link on every refresh.
 * Better to do some dirty flagging, or some reactive state library.
 * - skip the whole step if nothing has changed
 * - cache the DisplayEntries unless they've changed, or the day has turned
 * - but do this in a way that won't write to storage...?  
 */
export function getDisplayLinks(data: FileActivityPluginData): Array<DisplayEntry> {
  let disallowPatterns = data.disallowedPaths
    .filter((path) => path.length > 0)
    .map((pattern) => new RegExp(pattern))

  let linkCounts: Array<DisplayEntry> = Object
    .entries(data.reverseIndex)
    .filter(([key, entry]) => !entry.isResolved || !isDisallowed(key, disallowPatterns))
    .map(([key, entry]: [LinkKey, ReverseIndexEntry]) => {
      let counts = countlinksByDate(entry, data.activityTTLdays)
      var displayName = entry.text
      var path: PathStr | undefined = (entry.isResolved) ? key : undefined

      return {
        name: displayName,
        counts: counts,
        total: counts.reduce((acc, cur) => acc + cur, 0),
        weight: weightLinksByDay(counts, data.weightFalloff),
        path: path
      }
    });

  let topN = linkCounts
    .sort(((e1, e2) => e2.weight - e1.weight))  // Sort by weight descending
    .slice(0, data.maxLength)

  return topN
}

/**
 * Return an array of length `max_days` representing the number of links
 * on each day: [today, yesterday, t-2, ..., t - (max_days - 1) ]
 */
export function countlinksByDate(links: ReverseIndexEntry, maxDays: number): LinksByDay {
  let today = new Date().setHours(0, 0, 0, 0)
  let msPerDay = 1000 * 60 * 60 * 24
  let init: LinksByDay = new Array<number>(maxDays).fill(0)
  return Object
    .values(links.linksBySource)
    .reduce((acc: LinksByDay, cur: DateNumber) => {
        let diffDays = Math.floor((today - (new Date(cur)).setHours(0, 0, 0, 0)) / msPerDay)
        if (diffDays < 0) {
          acc[0] = acc[0] + 1
        } else if (diffDays < maxDays) {
          acc[diffDays] = acc[diffDays] + 1
        }
        return acc
      }, 
      init
  )
}

/**
 * Returns sum_n c_n * exp(-n / falloff)), where c_n = the count of links created n days ago.
 * 
 * This is the numerator of an exponential-weighted-average.
 */
function weightLinksByDay(counts: LinksByDay, falloff: number): number {
  return counts.reduce((acc: number, cur: number, i: number) => {
    return acc + cur * Math.exp(-1 * i / falloff)
  }, 0)
}

function isDisallowed(path: string, patterns: Array<RegExp>): boolean {
  return patterns.some((r) => r.test(path))
}
