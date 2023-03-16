
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, ItemView, getIcon, Menu, TFile, WorkspaceLeaf, CachedMetadata } from 'obsidian';
import { moment } from "obsidian";
import FileActivitySettingTab from './settings';
import FileActivityListView from './view';

// Remember to rename these classes and interfaces!

type PathStr = string;
type DateStr = string;

export interface FileActivity {
  path: PathStr;
  basename: string;
  byDate: Record<DateStr, number>;
}

interface LinkCacheEntry {
  date: DateStr;
  // TODO: do we even need numbers?
  resolvedLinks: Record<PathStr, number>
  unresolvedLinks: Record<string, number>
}

interface LinkCacheDiff {
  resolvedLinks: Record<PathStr, number> | null
  unresolvedLinks: Record<string, number> | null
}

// TODO tags?
interface FileActivityPluginData {
  fileActivity: Record<PathStr, FileActivity>;
  activityTTLdays: number;
  omittedPaths: string[];
  maxLength: number;
  openType: string;
  cachedLinks: Record<PathStr, LinkCacheEntry>;
}

const DATE_FORMAT = "YYYY-MM-DD"
export const DEFAULT_DATA: FileActivityPluginData = {
  fileActivity: {},
  activityTTLdays: 21,
  omittedPaths: [],
  maxLength: 50,
  openType: 'tab',
  cachedLinks: {}
};

export const LIST_VIEW_TYPE = 'file-activity';


export default class FileActivityPlugin extends Plugin {
  public data: FileActivityPluginData;
  public view: FileActivityListView;
  public regexps: Array<RegExp>
  
  public async onload(): Promise<void> {
    console.log('File Activity: Loading plugin v' + this.manifest.version);
    
    await this.loadData();
    
    this.registerView(
      LIST_VIEW_TYPE,
      (leaf) => (this.view = new FileActivityListView(leaf, this)),
      );
      
      this.initView();
      this.addCommand({
        id: 'file-activity-open',
        name: 'Open File Activity Panel',
        callback: this.revealView
      });
      this.registerEvent(this.app.workspace.on('file-open', this.handleOpen));
      this.registerEvent(this.app.vault.on('modify', this.handleModify));
      this.registerEvent(this.app.vault.on('rename', this.handleRename));
      this.registerEvent(this.app.vault.on('delete', this.handleDelete));
      this.registerEvent(this.app.metadataCache.on('changed', this.handleUpdateCache));
      this.addSettingTab(new FileActivitySettingTab(this.app, this));
  }
    
  public onunload(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.app.workspace as any).unregisterHoverLinkSource(
      LIST_VIEW_TYPE,
      );
  }
  
  public async loadData(): Promise<void> {
    this.data = Object.assign(DEFAULT_DATA, await super.loadData());
    this.regexps = this.data.omittedPaths
    .filter((path) => path.length > 0)
    .map((pattern) => new RegExp(pattern))
  }
  
  public async saveData(): Promise<void> {
    await super.saveData(this.data);
  }
  
  private readonly initView = async (): Promise<void> => {
    let leaf: WorkspaceLeaf | null = null;
    for (leaf of this.app.workspace.getLeavesOfType(LIST_VIEW_TYPE)) {
      if (leaf.view instanceof FileActivityListView) return;
      // The view instance was created by an older version of the plugin,
      // so clear it and recreate it (so it'll be the new version).
      // This avoids the need to reload Obsidian to update the plugin.
      await leaf.setViewState({ type: 'empty' });
      break;
    }
    (leaf ?? this.app.workspace.getLeftLeaf(false)).setViewState({
      type: LIST_VIEW_TYPE,
      active: true,
    });
  };
  
  private readonly revealView = async () => {
    let [leaf] = this.app.workspace.getLeavesOfType(LIST_VIEW_TYPE);
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: LIST_VIEW_TYPE });
    }
    
    this.app.workspace.revealLeaf(leaf);
  }

  /** STATE MODIFIERS */
  
  private readonly applyDiff = async (diff: LinkCacheDiff) => {
    // For now only resolved links
    if (diff.resolvedLinks === null) { return; }

    let today = moment().format(DATE_FORMAT)

    // Add our delta to activity for each file this one links to.
    Object.entries(diff.resolvedLinks).forEach(
      ([path, delta]) => {
        let activity = this.data.fileActivity[path]
        let newByDate = activity.byDate;
        if (activity !== undefined) {
          if (activity.byDate[today] !== undefined) {
            newByDate = {
              ...activity.byDate,
              today: delta
            }
          } else if (delta > 0) {
            newByDate = {
              ...activity.byDate,
              today: activity.byDate[today] + delta
            }
          }
        }

        this.data.fileActivity[path] = {
          ...activity,
          byDate: newByDate
        }
      }
    )
  }
  
  /** 
   * Make sure we have a LinkCache entry for this file. 
   */
  private readonly initLinkCache = async (file: TAbstractFile) => {
    let oldCachedLinks = this.data.cachedLinks[file.path];
    if (oldCachedLinks !== undefined) {
      this.data.cachedLinks[file.path] = {
        date: moment().format(DATE_FORMAT),
        resolvedLinks: app.metadataCache.resolvedLinks[file.path],
        unresolvedLinks: app.metadataCache.unresolvedLinks[file.path]
      }
    }
  }
  
  /**
   * Remove link cache entries from previous days.
   */
  private readonly updateDate = async (today: DateStr) => {
    // Clear cache of anything older than today
    this.data.cachedLinks = Object.fromEntries( 
      Object.entries(this.data.cachedLinks).filter(
        ([key, value]) => value.date != today
      ) 
    )

    // Remove activity older than TTL?
    // TODO
  }
  
  /** EVENT HANDLERS IMPLEMENTING PLUGIN LOGIC */
  
  /**
   * Just init our link cache on file open.
   *  Hopefully this fires on workspace load.
   */ 
  private readonly handleOpen = async (file: TFile): Promise<void> => {
    await this.initLinkCache(file)
  }
  /**
   * Also make sure link cache is inited on edits.
   */ 
  private readonly handleModify = this.initLinkCache
  
  /**
   * We keep our own cache of the MetadataCache links for any file opened or edited.
   * When a file's cached links change, we diff vs our link cache,
   * then apply that delta to our file statistics (counting inbound links.)
   * 
   * However, this can't actually CREATE entries in our linke cache, because
   * this event fires for every file on startup and we don't want to cache 
   * everything--so we only init our cache on file open, rename, or edit.
   */
  private readonly handleUpdateCache = async (
    file: TFile, 
    data: string, 
    cacheMetadata: CachedMetadata
  ): Promise<void> => {

    let today = moment().format(DATE_FORMAT)
    let oldCachedLinks = this.data.cachedLinks[file.path];
    
    console.log('oldCachedLinks: ' + JSON.stringify(oldCachedLinks))
    // What is this? Don't think we need it, better to distinguish resolved/unresolved.
    console.log('cache: ' + JSON.stringify(cacheMetadata))
    
    if (oldCachedLinks !== undefined) {
      // Don't fire on app start
      return;
    }
    
    let newCachedLinks: LinkCacheEntry = {
      date: today,
      resolvedLinks: app.metadataCache.resolvedLinks[file.path],
      unresolvedLinks: app.metadataCache.unresolvedLinks[file.path]
    }
    
    console.log('newCachedLinks: ' + JSON.stringify(app.metadataCache.resolvedLinks[file.path]))
    this.updateDate(today)
    this.data.cachedLinks[file.path as PathStr] = newCachedLinks
    
    let diff: LinkCacheDiff = this.diffCache(oldCachedLinks, newCachedLinks)
    console.log('diff: ' + JSON.stringify(diff))
    if (diff.resolvedLinks !== null || diff.unresolvedLinks !== null) {
      await this.applyDiff(diff)
    }
    
    this.saveData()
    // TODO redraw view
  };

            
  /**
   * What does the metadata cache do on rename?
   *  
   */
  private readonly handleRename = async (
    file: TAbstractFile,
    oldPath: string,
  ): Promise<void> => {
    
    // make sure newName is not omitted

    // Update link cache entry to new name
    let cachedLinks = this.data.cachedLinks[oldPath]
    if (cachedLinks !== undefined) {
      delete this.data.cachedLinks[oldPath]
      this.data.cachedLinks[file.path] = cachedLinks
    }

    // Update activity entry to new name
    let activity = this.data.fileActivity[oldPath]
    if (activity !== undefined) {
      delete this.data.fileActivity[oldPath]
      this.data.fileActivity[file.path] = {
        ...activity,
        basename: file.name.replace(/\.[^/.]+$/, '')
      }
    }
   
    // update OTHER cache entries? hopefully not
    // update app state?
    // redraw view?
    await this.saveData();
  };
            
            
  /**
   * What does the metadata cache do on deletes?
   * Does it change existing links to unresolved?
   * 
   * If we have cached links pointing TO this file, don't do anything,
   * they're still useful, they can point to nothing. (Should they
   * change to unresolved?)
   *  
   */
  private readonly handleDelete = async (
    file: TAbstractFile,
  ): Promise<void> => {
    
    // Cancel all links FROM this file--if the file is re-created we want to
    // end up with the right counts.
    let cachedLinks = this.data.cachedLinks[file.path]
    if (cachedLinks !== undefined) {
      // create a diff of all its links with negative counts
      let diff: LinkCacheDiff = {
        resolvedLinks: Object.fromEntries(
          Object.entries(cachedLinks.resolvedLinks).map(([key, value]) => [key, -1 * value])),
        unresolvedLinks: Object.fromEntries(
          Object.entries(cachedLinks.unresolvedLinks).map(([key, value]) => [key, -1 * value]))
      }

      console.log('diff: ' + JSON.stringify(diff))
      await this.applyDiff(diff)
      delete this.data.cachedLinks[file.path]
    }
   
    // update app state?
    // redraw view?
    await this.saveData();
  };
      
              
  
  // TODO where is this called?
  // readonly removeFile = async (file: FileActivity): Promise<void> => {
  //   this.data.fileActivity = this.data.fileActivity.filter(
  //     (currFile) => currFile.path !== file.path,
  //     );
  //     await this.pruneLength();
  //     await this.saveData();
  // }
  
  // public readonly pruneOmittedFiles = async (): Promise<void> => {
  //   this.data.fileActivity = this.data.fileActivity.filter(
  //     (file) => !this.regexps.some((r) => r.test(file.path))
  //   );
  // };

  // public readonly pruneLength = async (): Promise<void> => {
  //   const toRemove =
  //   this.data.fileActivity.length - (this.data.maxLength || DEFAULT_DATA.maxLength);
  //   if (toRemove > 0) {
  //     this.data.fileActivity.splice(
  //       this.data.fileActivity.length - toRemove,
  //       toRemove,
  //       );
  //     }
  // };

  /** UTILITY FUNCTIONS */

  private readonly diffCache = (oldCache: LinkCacheEntry, newCache: LinkCacheEntry): LinkCacheDiff => {
    return {
      resolvedLinks: this.diffCacheEntries(oldCache.resolvedLinks, newCache.resolvedLinks),
      unresolvedLinks: this.diffCacheEntries(oldCache.unresolvedLinks, newCache.unresolvedLinks),
    }
  }

  /** 
   * For each key, calculate the delta in its number of cached links.
   * Implemented as a reduce over the old entries, subtracting each number from new entries
   */
  private readonly diffCacheEntries = (
    oldEntries: Record<string, number>, 
    newEntries: Record<string, number>
    ): Record<string, number> | null => {
      if (oldEntries === newEntries) { return null; }
      return Object.entries(oldEntries).reduce<Record<string, number>>(
        (acc: Record<string, number>, [k, v], i): Record<string, number> => {
          if (acc[k] !== undefined) { 
            let diff = acc[k] - v;
            if (diff == 0) { 
              delete acc[k];
            } else {
              acc[k] = diff;
            }
        } else {
          acc[k] = -1 * v
        }
        return acc;
      },
      // Clone newEntries as initial accumulator
      {... newEntries}
    )
  }
}
