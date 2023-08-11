import { moment } from 'obsidian';

type LinkText = string;
export type PathStr = string;
export type Links = Array<PathStr>
type DateStr = string;
type DateNumber = number;
const DATE_FORMAT = "YYYY-MM-DD";

export interface Backlinks {
  // contains either a path + name, a tag, or an unresolved name
  path: PathStr;
  name: string;
  // only contains paths
  backlinksBySource: Record<PathStr, DateNumber>;
}

export interface FileActivityPluginData {
  // State
  // TODO  keys can be either paths, tags, or names
  backlinksByDestination: Record<PathStr, Backlinks>;
  cachedModificationTimes: Record<PathStr, DateNumber>;

  // Behavior Settings
  activityTTLdays: number;
  omittedPaths: string[];
  
  // UI settings
  maxLength: number;
  openType: string;
}


export const DEFAULT_DATA: FileActivityPluginData = {
  backlinksByDestination: {},
  activityTTLdays: 21,
  omittedPaths: [],
  maxLength: 50,
  openType: 'tab',
  cachedModificationTimes: {}
};

/**
 * Update state for path to contain only the provided links,
 * if it modTime is newer than the cached value.
 */
export function updateOutgoingLinks(
  path: PathStr, 
  modTime: DateNumber,
  newLinks: Links,
  data: FileActivityPluginData
) {
  if (data.cachedModificationTimes[path] === modTime) {
    return
  } else {
    data.cachedModificationTimes[path] = modTime
  }
  // TODO has to update paths, tags, and names
  // it may be that a link that was formerly a path is now a name
  // or a name is now a path. as long as we canonicalize on every pass
  // this is fine.
  newLinks.forEach((otherPath) => {
    let otherEntry = data.backlinksByDestination[otherPath]
    if (otherEntry === undefined) {
      let backlinksBySource = {[path]: modTime}
      data.backlinksByDestination[otherPath] = {
        path: otherPath,
        name: pathToLinkText(otherPath),
        backlinksBySource: backlinksBySource,
      }
    } else {
      otherEntry.backlinksBySource[path] = modTime
    }
  })

  Object.entries(data.backlinksByDestination).forEach(([otherPath, otherEntry]) => {
    if (otherEntry.backlinksBySource[path] !== undefined && !newLinks.includes(otherPath)) {
      delete otherEntry.backlinksBySource[path]
    }
  })
}

/**
 * Update state to reflect the deleting of a file. 
 * 
 * This should:
 * - remove its name from the backlink state
 * - delete any backlinks using the old name.
 * - delete it from the modtime cache.
 */
export function deletePath(
  path: PathStr, 
  data: FileActivityPluginData
) {
  delete data.cachedModificationTimes[path]

  // TODO This should switch its backlinks to an unresolved state.
  // Perhaps obsidian will re-resolve them for us?
  delete data.backlinksByDestination[path]
  let backlinks = Object.values(data.backlinksByDestination)
  Object.entries(backlinks).forEach(([k, links]) => {
      delete links.backlinksBySource[path]
    }
  )
}

/**
 * Update state to reflect the renaming of a file. 
 * 
 * This should:
 * - update its path in the backlink state, merging with any data at the new name
 *   - if the old or new name is shared with another file this might not be quite right.
 * - update its existing outgoing links to use the new path. (Implemented as delete + update)
 */
export function renamePath(
  path: PathStr,
  oldPath: PathStr,
  modTime: DateNumber,
  newLinks: Links,
  data: FileActivityPluginData
) {

  data.backlinksByDestination[path] = {
    path: path,
    // TODO can tags be renamed?
    name: pathToLinkText(path),
    // Use the links already at the new name, counting on Obsidian
    // to update any links pointing to this file already.
    // TODO 
    backlinksBySource: data.backlinksByDestination[path]?.backlinksBySource || {}
  }

  deletePath(oldPath, data)

  updateOutgoingLinks(path, modTime, newLinks, data)
}


// TODO correct impl here, handle unresolved links
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
  let counts = Object.values(data.backlinksByDestination)
    .reduce((acc: Record<PathStr, number>, cur: Backlinks) => {
      let len = Object.values(cur.backlinksBySource).length
      if (len > 0) { acc[cur.path] = len}
      return acc
    }, {})

  // Sort descending
  return Object.entries(counts).sort((([k1, c1], [k2, c2]) => c2 - c1))
    .slice(0, data.maxLength)
    .map(([path, ct]) => [data.backlinksByDestination[path].name, ct] as [string, number])
}
