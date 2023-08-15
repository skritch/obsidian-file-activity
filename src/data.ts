type LinkText = string;
export type PathStr = string;
type DateNumber = number;
const DATE_FORMAT = "YYYY-MM-DD";

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
 * - backlink tracking
 * - cache of file modification times (could remove this?)
 * - settings
 * TODO: add tags
 */
export interface FileActivityPluginData {
  // Reverse index of paths -> paths which link to them
  linkIndex: Record<PathStr, IndexEntry>;

  // Reverse index of unresolved link text -> paths which link to it 
  unresolvedLinkIndex: Record<LinkText, IndexEntry>;

  // Path -> last seen modification time
  modTimes: Record<PathStr, DateNumber>;

  // Settings
  activityTTLdays: number;  // TODO: replace with a "falloff" setting for display
  disallowedPaths: string[];
  maxLength: number;
  openType: string;
}


// A function returning the default data (safer since we mutate)
export const DEFAULT_DATA = ():  FileActivityPluginData => { 
  return {
    linkIndex: {},
    unresolvedLinkIndex: {},
    modTimes: {},
    activityTTLdays: 21,
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

// function countLinksByDate(links: Record<PathStr, DateNumber>) {
//   return Object.values(links).reduce((acc: Record<DateStr, number>, cur: DateNumber) => {
//     let curStr = dateNumberToString(cur)
//     if (acc[curStr] !== undefined) {
//       acc[curStr] = acc[curStr] + 1
//     } else {
//       acc[curStr] = 1
//     }
//     return acc
//   }, {})
// }

// function dateNumberToString(n: DateNumber): DateStr {
//   return moment.unix(n / 1000).format(DATE_FORMAT)
// }

export function getTopLinks(data: FileActivityPluginData) {
  // TODO: remove empty entries here?
  // TODO: count backlinks by date here
  let counts: Record<PathStr, number> = 
    Object.entries(data.linkIndex)
      .reduce((acc: Record<PathStr, number>, cur: [PathStr, IndexEntry]) => {
        let len = Object.values(cur[1].linksBySource).length
        if (len > 0) { acc[cur[0]] = len}
        return acc
      }, {})

  // Sort descending
  return Object.entries(counts)
    .sort((([k1, c1], [k2, c2]) => c2 - c1))
    .slice(0, data.maxLength)
    .map(([path, ct]) => [path, data.linkIndex[path].name, ct] as [string, string, number ])
}
