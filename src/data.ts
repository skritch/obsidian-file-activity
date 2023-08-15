type LinkText = string;
export type PathStr = string;
export type Links = Array<PathStr>
type DateStr = string;
type DateNumber = number;
const DATE_FORMAT = "YYYY-MM-DD";

/**
 * Object recording which other files link to this one.
 * 
 * TODO: add tags and unresolved names
 */ 
export interface BacklinkIndexEntry {
  path: PathStr;
  name: LinkText;
  linksBySource: Record<PathStr, DateNumber>;
}

/**
 * Stores all state of the plugin:
 * - backlink tracking
 * - cache of file modification times (could remove this?)
 * - settings
 */
export interface FileActivityPluginData {
  // State
  // Target Path -> {source paths and timestamp}
  backlinkIndex: Record<PathStr, BacklinkIndexEntry>;
  // Path -> last seen modification time
  modTimes: Record<PathStr, DateNumber>;

  // Behavior Settings
  activityTTLdays: number;  // TODO: replace with a "falloff" setting for display
  disallowedPaths: string[];
  
  // UI settings
  maxLength: number;
  openType: string;
}


// A functionr returning the default data (safer since we mutate)
export const DEFAULT_DATA = ():  FileActivityPluginData => { 
  return {
    backlinkIndex: {},
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
export function updateOutgoingLinks(
  sourcePath: PathStr, 
  modTime: DateNumber,
  sourceLinks: Links,
  data: FileActivityPluginData
) {
  // If two-sided index, skip even the modTime step our links haven't changed

  // No-op if we've seen a newer resolve event for this file.
  if (data.modTimes[sourcePath] >= modTime) {
    return
  } else {
    data.modTimes[sourcePath] = modTime
  }
  // TODO: skip if the file is on our disallow list
  sourceLinks.forEach((targetPath) => {
    let linksToTarget = data.backlinkIndex[targetPath]
    if (linksToTarget === undefined) {
      data.backlinkIndex[targetPath] = {
        path: targetPath,
        name: pathToLinkText(targetPath),
        linksBySource: {[sourcePath]: modTime},
      }
    } else {
      linksToTarget.linksBySource[sourcePath] = modTime
    }
  })

  // Remove dead links
  // TODO: inefficient. Two-sided index?
  Object.entries(data.backlinkIndex)
    .forEach(([targetPath, targetLinks]) => {
      if (
        targetLinks.linksBySource[sourcePath] !== undefined 
        && !sourceLinks.includes(targetPath)
      ) {
        delete targetLinks.linksBySource[sourcePath]
        // Remove the entry entirely if no links remain
        if (Object.keys(targetLinks.linksBySource).length == 0) {
          delete data.backlinkIndex[targetPath]
        }
      }
    })
}

/**
 * Update state to reflect the renaming of a file. 
 * - Update its existing outgoing links to use the new path. (Implemented as delete + update)
 */
export function renamePath(
  path: PathStr,
  oldPath: PathStr,
  modTime: DateNumber,
  newLinks: Links,
  data: FileActivityPluginData
) {
  deletePath(oldPath, data)
  updateOutgoingLinks(path, modTime, newLinks, data)
}

/**
 * Update state to reflect the deleting of a file. 
 * - Remove its name from the backlink state
 * - Delete any backlinks using the old name.
 * - Delete it from the modtime cache.
 */
export function deletePath(
  path: PathStr, 
  data: FileActivityPluginData
) {
  // Obsidian will re-resolve any files which linked to this one.
  delete data.backlinkIndex[path]
  delete data.modTimes[path]

  // Remove the outgoing links from our deleted file
  // TODO: Inefficient: two-sided index would help here.
  let backlinks = Object.values(data.backlinkIndex)
  Object.entries(backlinks).forEach(([targetPath, targetLinks]) => {
      delete targetLinks.linksBySource[path]
      if (Object.keys(targetLinks.linksBySource).length == 0) {
        delete data.backlinkIndex[targetPath]
      }
    }
  )
}

// TODO can we use Obsidian's own function for this?
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
  let counts = Object.values(data.backlinkIndex)
    .reduce((acc: Record<PathStr, number>, cur: BacklinkIndexEntry) => {
      let len = Object.values(cur.linksBySource).length
      if (len > 0) { acc[cur.path] = len}
      return acc
    }, {})

  // Sort descending
  return Object.entries(counts)
    .sort((([k1, c1], [k2, c2]) => c2 - c1))
    .slice(0, data.maxLength)
    .map(([path, ct]) => [path, data.backlinkIndex[path].name, ct] as [string, string, number ])
}
