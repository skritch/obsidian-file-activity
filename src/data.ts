import { moment } from 'obsidian';

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
 * 
 * TODO: probably maintain UI state separately
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


export const DEFAULT_DATA: FileActivityPluginData = {
  backlinkIndex: {},
  activityTTLdays: 21,
  disallowedPaths: [],
  maxLength: 50,
  openType: 'tab',
  modTimes: {}
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
  // If we've seen a newer version of this source, no-op.
  if (data.modTimes[sourcePath] >= modTime) {
    return
  } else {
    data.modTimes[sourcePath] = modTime
  }
  // TODO: skip if the file is on our disallow list

  sourceLinks.forEach((targetPath) => {
    let linksToTarget = data.backlinkIndex[targetPath]
    if (linksToTarget === undefined) {
      let backlinksBySource = {[sourcePath]: modTime}
      data.backlinkIndex[targetPath] = {
        path: targetPath,
        name: pathToLinkText(targetPath),
        linksBySource: backlinksBySource,
      }
    } else {
      linksToTarget.linksBySource[sourcePath] = modTime
    }
  })

  // Remove dead links
  Object.entries(data.backlinkIndex)
    .forEach(([targetPath, targetLinks]) => {
      if (
        targetLinks.linksBySource[sourcePath] !== undefined 
        && !sourceLinks.includes(targetPath)
      ) {
        delete targetLinks.linksBySource[sourcePath]
      }
    })
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
  delete data.modTimes[path]

  // TODO This should switch its backlinks to an unresolved state.
  // Perhaps obsidian will re-resolve them for us?
  delete data.backlinkIndex[path]
  let backlinks = Object.values(data.backlinkIndex)
  Object.entries(backlinks).forEach(([k, links]) => {
      delete links.linksBySource[path]
    }
  )
}

/**
 * Update state to reflect the renaming of a file. 
 * - Update its path in the links-by-target state, merging with any data at the new path.
 *   When a file is renamed, Obsidian will update files which link TO it to change the name 
 *   of the link, we might index those before we handle the rename, in which case a record would
 *   already exist.
 * - Update its existing outgoing links to use the new path. (Implemented as delete + update)
 */
export function renamePath(
  path: PathStr,
  oldPath: PathStr,
  modTime: DateNumber,
  newLinks: Links,
  data: FileActivityPluginData
) {

  data.backlinkIndex[path] = {
    path: path,
    name: pathToLinkText(path),
    // Use the links already at the new name
    // TODO: merge data from oldPath!
    linksBySource: data.backlinkIndex[path]?.linksBySource || {}
  }

  deletePath(oldPath, data)

  updateOutgoingLinks(path, modTime, newLinks, data)
}

function pathToLinkText(path: PathStr): LinkText {
  return path.replace(/^.*\//, '').replace(/\.[^/.]+$/, '')
}

function countLinksByDate(links: Record<PathStr, DateNumber>) {
  return Object.values(links).reduce((acc: Record<DateStr, number>, cur: DateNumber) => {
    let curStr = dateNumberToString(cur)
    if (acc[curStr] !== undefined) {
      acc[curStr] = acc[curStr] + 1
    } else {
      acc[curStr] = 1
    }
    return acc
  }, {})
}

function dateNumberToString(n: DateNumber): DateStr {
  return moment.unix(n / 1000).format(DATE_FORMAT)
}

export function getTopLinks(data: FileActivityPluginData) {
  // TODO: remove empty entries here.
  // TODO: count backlinks by date here
  let counts = Object.values(data.backlinkIndex)
    .reduce((acc: Record<PathStr, number>, cur: BacklinkIndexEntry) => {
      let len = Object.values(cur.linksBySource).length
      if (len > 0) { acc[cur.path] = len}
      return acc
    }, {})

  // Sort descending
  return Object.entries(counts).sort((([k1, c1], [k2, c2]) => c2 - c1))
    .slice(0, data.maxLength)
    .map(([path, ct]) => [data.backlinkIndex[path].name, ct] as [string, number])
}
