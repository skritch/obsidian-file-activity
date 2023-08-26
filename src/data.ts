
/** DATA TYPES */

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
export type Link = ResolvedLink | UnresolvedLink
export type LinkKey = PathStr | LinkText
const keyForLink = (link: Link): LinkKey => {return (link.isResolved) ? link.path : link.text};

export interface ReverseIndexEntry {
  link: Link,
  linksBySource: Record<PathStr, DateNumber>,
}
// Reverse index of path/link text => everything that links to it.
export type ReverseIndex = Record<LinkKey, ReverseIndexEntry>

export interface PluginConfig {
  displayDays: number,
  displayCount: number,
  weightHalflife: number,
  disallowedPaths: string[],
  openType: "split" | "window" | "tab"
}

export const DEFAULT_CONFIG: PluginConfig = {
  displayDays: 31,
  weightHalflife: 10,
  disallowedPaths: [],
  displayCount: 50,
  openType: 'tab'
};

// Data for entries in the UI
export interface DisplayEntry {
  link: Link,
  counts: LinksByDay,
  total: number,
  weight: number,
}

/* INDEXING EVENT HANDLERS */

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
