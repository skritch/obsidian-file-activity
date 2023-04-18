
import { CachedMetadata, LinkCache, moment, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import { FileActivityPluginData, DEFAULT_DATA, updateOutgoingLinks, renamePath, deletePath } from './data';
import FileActivitySettingTab from './settings';
import FileActivityListView from './view';

export const LIST_VIEW_TYPE = 'file-activity';

export default class FileActivityPlugin extends Plugin {
  public data: FileActivityPluginData;
  public view: FileActivityListView;
  
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
      this.registerEvent(this.app.vault.on('create', this.handleCreate));
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
  
  /** EVENT HANDLERS */
  
  /**
   * Do we need to do anything? For new files?
   * 
   * - Existing unresolved links that point to this name will be updated in the background
   *   to point to this file, but not updateCache fires.
   */ 
  private readonly handleCreate = async (file: TAbstractFile): Promise<void> => {
    // console.log('handleCreate path: ' + file?.path)
  }
  
  /**
   * Called when a MetadataCache entry is updated for a file. 
   */
  private readonly handleUpdateCache = async (
    file: TFile, 
    data: string, 
    cacheMetadata: CachedMetadata
  ): Promise<void> => {

    let links: string[] = []
    cacheMetadata.links?.forEach((e: LinkCache) => {
      // Resolve the link so we key everything by path
      let link = app.metadataCache.getFirstLinkpathDest(e.link, file.path)
      if (link !== null) { links.push(link.path)}
    })
    
    console.log('handleUpdate path: ' + file?.path)

    updateOutgoingLinks(
      file.path,
      file.stat.mtime,
      links,
      this.data
    )

    this.saveData()
    this.view.redraw()
  };

            
  /**
   * 1. Update our modification time cache to use the new name.
   * 2. Update our backlink cache to use the new name.
   * 3. Recompute everything that links to this name it.
   * 
   * A move = a rename that only changes the path.
   * 
   * Cases to handle:
   * * Rename to the name of a current unresolved link
   * * Rename to the same name as another file
   * * Move without rename
   * 
   */
  private readonly handleRename = async (
    file: TAbstractFile,
    oldPath: string,
  ): Promise<void> => {

    console.log('handleRename path: ' + file.path + ' oldPath: ' + oldPath)
    let modTime = (await app.vault.adapter.stat(file.path))?.mtime
    if (modTime === undefined) {
      console.log("No modtime for " + file.path)
      return
    }

    let links = Object.keys({
      // vault absolute paths
      ...app.metadataCache.resolvedLinks[file.path],
      // just the string, I presume
      // ...app.metadataCache.unresolvedLinks[file.path]
    })

    renamePath(
      file.path,
      oldPath,
      modTime,
      links,
      this.data
    )
   
    // TODO redraw view

    await this.saveData();
    this.view.redraw()
  };
            
            
  /**
   * What does the builtin metadata cache do on deletes?
   * Does it change existing links to unresolved?
   * 
   * Fires after previous file has a cache update. (EDIT NOT ALWAYS!) Does change old links to unresolved.
   * When this fires have the old links been cleaned up—if we look up their metadataCache
   * will they be gone?
   * 
   */
  private readonly handleDelete = async (
    file: TAbstractFile,
  ): Promise<void> => {
    console.log('handleDelete path: ' + file.path)
    
    deletePath(file.path, this.data)

    await this.saveData();
    this.view.redraw();
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
  // let regexps = this.data.omittedPaths
  // .filter((path) => path.length > 0)
  // .map((pattern) => new RegExp(pattern))
  //   this.data.fileActivity = this.data.fileActivity.filter(
  //     (file) => !regexps.some((r) => r.test(file.path))
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
}
