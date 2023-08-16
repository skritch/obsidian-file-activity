

export type PathStr = string;
type LinkText = string;
type DateNumber = number;
type LinksByDay = Array<number>;

/**
 * Object recording which other files link to this one.
 * 
 * TODO: add forward-index for fast deletes at the cost of complexity?
 */ 
export interface IndexEntry {
  name: LinkText;
  linksBySource: Record<PathStr, DateNumber>;
}

/**
 * Stores all state of the plugin:
 * - backlink tracking  (TODO: add tags)
 * - cache of file modification times (could remove this?)
 * - settings
 */
export interface FileActivityPluginData {
  // Reverse index of paths -> paths which link to them
  linkIndex: Record<PathStr, IndexEntry>;

  // Reverse index of unresolved link text -> paths which link to it 
  unresolvedLinkIndex: Record<LinkText, IndexEntry>;

  // Path -> last seen modification time
  modTimes: Record<PathStr, DateNumber>;

  // Settings
  activityTTLdays: number; // Maybe we ignore links in files older than this many days?
  weightFalloff: number;  // Number greater than zero. Higher = more recent links go to the top of the list.
  maxLength: number;
  disallowedPaths: string[];
  openType: string;
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
    linkIndex: {},
    unresolvedLinkIndex: {},
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
 * 
 * For each target, ensure this source is tracked and the modTime is fresh.
 */
export function update(
  sourcePath: PathStr, 
  modTime: DateNumber,
  links: Array<PathStr>,
  unresolvedLinks: Array<LinkText>,
  data: FileActivityPluginData
) {
  // If two-sided index, skip even the modTime step our links haven't changed

  // No-op if we've seen a newer resolve event for this file.
  if (data.modTimes[sourcePath] >= modTime) {
    return
  } else {
    data.modTimes[sourcePath] = modTime
  }
  // TODO: handle our disallow list

  updateLinkIndex(sourcePath, modTime, links, data.linkIndex);
  removeDeadLinks(sourcePath, links, data.linkIndex);
  updateLinkIndex(sourcePath, modTime, unresolvedLinks, data.unresolvedLinkIndex);
  removeDeadLinks(sourcePath, unresolvedLinks, data.unresolvedLinkIndex);
}

/**
 * Inserts all links in `links` into a reverse index.
 */
function updateLinkIndex<K extends PathStr | LinkText>(
  sourcePath: PathStr,
  modTime: DateNumber,
  links: K[], 
  index: Record<K, IndexEntry>
) {
  links.forEach((target) => {
    if (index[target] === undefined) {
      index[target] = {
        name: pathToLinkText(target),
        linksBySource: {[sourcePath]: modTime},
      }
    } else {
      index[target].linksBySource[sourcePath] = modTime
    }
  })
}


/**
 * Remove entries in a reverse index which are no longer found in `links`.
 * 
 * TODO: n^2 and inefficient. Two-sided index?
 * Or, some way to query current backlinks?
 */
function removeDeadLinks<K extends PathStr | LinkText>(
  sourcePath: PathStr,
  links: K[], 
  index: Record<K, IndexEntry>
) {
  Object.entries(index)
    .forEach(([key, targetLinks]: [K, IndexEntry]) => {
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
  newLinks: Array<PathStr>,
  unresolvedLinks: Array<LinkText>,
  data: FileActivityPluginData
) {
  remove(oldPath, data)
  update(path, modTime, newLinks, unresolvedLinks, data)
}

/**
 * Update state to reflect the deleting of a file. 
 * - Remove its name from the backlink state
 * - Delete any backlinks using the old name.
 * - Delete it from the modtime cache.
 */
export function remove(
  path: PathStr, 
  data: FileActivityPluginData
) {
  // Obsidian will re-resolve any files which linked to this one.
  delete data.linkIndex[path]
  delete data.modTimes[path]
  removeDeadLinks(path, [], data.linkIndex);
  removeDeadLinks(path, [], data.unresolvedLinkIndex);
}

// TODO can we use Obsidian's own function for this? MetadataCache.fileToLinktext?
function pathToLinkText(path: PathStr): LinkText {
  return path.replace(/^.*\//, '').replace(/\.[^/.]+$/, '')
}


/**
 * Generates the entries displayed in the plugin. The top `maxLength` entries
 * are chosen based on the exponentially-weighted sum of the count of links
 * per day.
 * 
 * TODO: this going to get calculated for every link on every refresh.
 * Better to do some dirty flagging:
 * - skip the whole step if nothing has changed
 * - cache the DisplayEntries unless they've changed, or the day has turned
 * - but do this in a way that won't write to storage...?  
 */
export function getWeightedTopLinks(
  data: FileActivityPluginData
): Array<DisplayEntry> {
  let linkCounts: Array<DisplayEntry> = Object.entries(data.linkIndex)
    .map(([path, entry]: [PathStr, IndexEntry]) => {
      let counts = countlinksByDate(entry, data.activityTTLdays)
      return {
        name: entry.name,
        counts: counts,
        total: counts.reduce((acc, cur) => acc + cur, 0),
        weight: weightLinksByDay(counts, data.weightFalloff),
        path: path
      }
    });

  let unresolvedLinkCounts: Array<DisplayEntry> = Object.values(data.unresolvedLinkIndex)
    .map((entry: IndexEntry) => {
      let counts = countlinksByDate(entry, data.activityTTLdays)
      return {
        name: entry.name,
        counts: counts,
        total: counts.reduce((acc, cur) => acc + cur, 0),
        weight: weightLinksByDay(counts, data.weightFalloff)
      }
    });

  let topN = linkCounts.concat(unresolvedLinkCounts)
    .sort(((e1, e2) => e2.weight - e1.weight))  // Sort by weight descending
    .slice(0, data.maxLength)

  return topN
}

/**
 * Return an array of length `max_days` representing the number of links
 * on each day: [today, yesterday, t-2, ..., t - (max_days - 1) ]
 */
export function countlinksByDate(links: IndexEntry, maxDays: number): LinksByDay {
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
