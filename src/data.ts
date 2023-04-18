import { moment } from 'obsidian';

type LinkText = string;
type PathStr = string;
type DateStr = string;
type DateNumber = number;
const DATE_FORMAT = "YYYY-MM-DD";

// TODO tags, unresolved names
export interface Backlinks {
  path: PathStr;
  name: string;
  backlinksBySource: Record<PathStr, DateNumber>;

  // Computed state
  backlinksByDate: Record<DateStr, number>;
}

export interface FileActivityPluginData {
  // State
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
 * Update state so that the only backlinks associated with the
 * provided path are those in newLinks.
 * 
 * This is triggered:
 * - when a file is modified (including response to the rename of a file it links to)
 * - when a file is renamed, for any files pointing to it.
 * - when a file is deleted (with an empty newLinks)
 */
export function updateOutgoingLinks(
  path: PathStr, 
  modTime: DateNumber,
  newLinks: Array<PathStr>,
  data: FileActivityPluginData
) {
  if (data.cachedModificationTimes[path] === modTime) {
    return
  } else {
    data.cachedModificationTimes[path] = modTime
  }

  newLinks.forEach((otherPath) => {
    let otherEntry = data.backlinksByDestination[otherPath]
    if (otherEntry === undefined) {
      let backlinksBySource = {[path]: modTime}
      data.backlinksByDestination[otherPath] = {
        path: otherPath,
        name: pathToLinkText(otherPath),
        backlinksBySource: backlinksBySource,
        backlinksByDate: countLinksByDate(backlinksBySource)
      }
    } else {
      otherEntry.backlinksBySource[path] = modTime
      otherEntry.backlinksByDate = countLinksByDate(otherEntry.backlinksBySource)
    }
  })

  Object.entries(data.backlinksByDestination).forEach(([otherPath, otherEntry]) => {
    if (otherEntry.backlinksBySource[path] !== undefined && !newLinks.includes(otherPath)) {
      delete otherEntry.backlinksBySource[path]
      // okay to mutate here?
      // if (links.inboundLinks[path].length == 0) {
      //   delete data.backlinks[k]
      // }
      otherEntry.backlinksByDate = countLinksByDate(otherEntry.backlinksBySource)
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
  delete data.backlinksByDestination[path]
  let backlinks = Object.values(data.backlinksByDestination)
  Object.entries(backlinks).forEach(([k, links]) => {
      delete links.backlinksBySource[path]
      // okay to mutate here?
      // if (links.inboundLinks[path].length == 0) {
      //   delete data.backlinks[k]
      // }
      links.backlinksByDate = countLinksByDate(links.backlinksBySource)
    }
  )
}

/**
 * Update state to reflect the renaming of a file. 
 * 
 * This should:
 * - update its name in the backlink state, merging with any entry at the new name
 *   - actually if we rename the file, it appears that incoming links are updated in separate
 *     update cache operations, so we could just use the old data.
 *   - what happens if the new or old name collides with another file?
 * - update its existing outgoing links to use the new name. (Implemented
 *   as delete + update)
 */
export function renamePath(
  path: PathStr,
  oldPath: PathStr,
  modTime: DateNumber,
  newLinks: Array<PathStr>,
  data: FileActivityPluginData
) {
  let newInboundLinks = {
    ...data.backlinksByDestination[path]?.backlinksBySource,
    ...data.backlinksByDestination[oldPath]?.backlinksBySource
  }
  data.backlinksByDestination[path] = {
    path: path,
    name: pathToLinkText(path),
    backlinksBySource: newInboundLinks,
    backlinksByDate: countLinksByDate(newInboundLinks)
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
  let counts = Object.values(data.backlinksByDestination)
    .reduce((acc: Record<PathStr, number>, cur: Backlinks) => {
      let len = Object.values(cur.backlinksBySource).length
      if (len > 0) { acc[cur.path] = len}
      return acc
    }, {})

  // Note sort is reversed to take top N
  return Object.entries(counts).sort((([k1, c1], [k2, c2]) => c2 - c1))
    .slice(0, data.maxLength)
    .map(([path, ct]) => [data.backlinksByDestination[path].name, ct] as [string, number])
}
