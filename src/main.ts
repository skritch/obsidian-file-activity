
import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_DATA, remove, PathStr, rename, update, Link, LinkText, PluginData } from './data';
import FileActivitySettingTab from './settings';
import FileActivityListView from './view';

const PLUGIN_NAME = 'File Activity Plugin';
export const VIEW_TYPE = 'file-activity';

export default class FileActivityPlugin extends Plugin {
  public data: PluginData;
  public view: FileActivityListView;
  
  // Runs on app start and plugin load
  public async onload(): Promise<void> {
    console.log('File Activity: Loading plugin v' + this.manifest.version);
    
    await this.loadData();
    
    this.registerView(
      VIEW_TYPE,
      (leaf) => (this.view = new FileActivityListView(leaf, this)),
      );

      if (this.app.workspace.layoutReady) {
        this.initView();
      } else {
        this.registerEvent(this.app.workspace.on('layout-ready' as any, this.initView));
      }
      this.addCommand({
        id: 'file-activity-open',
        name: 'Open File Activity Panel',
        callback: this.revealView
      });
      this.registerEvent(this.app.vault.on('rename', this.handleRename));
      this.registerEvent(this.app.vault.on('delete', this.handleDelete));
      this.registerEvent(this.app.metadataCache.on('resolve', this.handleResolve));
      this.registerEvent(this.app.metadataCache.on('resolved', this.handleResolved));
      this.addSettingTab(new FileActivitySettingTab(this.app, this));

      await this.indexAll()
      await this.saveData()
      this.view.redraw()
  }
  
  public onunload(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.app.workspace as any).unregisterHoverLinkSource(
      VIEW_TYPE,
    );
  }
  
  public async loadData(): Promise<void> {
    const data = DEFAULT_DATA();
    data.config = Object.assign(data.config, await super.loadData())
    this.data = data;
  }
  
  public async saveData(): Promise<void> {
    // Only save the config; regenerate the state at startup.
    await super.saveData(this.data.config);
  }
  
  private readonly initView = async (): Promise<void> => {
    let leaf: WorkspaceLeaf | null = null;
    for (leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof FileActivityListView) return;
      // The view instance was created by an older version of the plugin,
      // so clear it and recreate it (so it'll be the new version).
      // This avoids the need to reload Obsidian to update the plugin.
      await leaf.setViewState({ type: 'empty' });
      break;
    }
    (leaf ?? this.app.workspace.getLeftLeaf(false)).setViewState({
      type: VIEW_TYPE,
      active: true,
    });
  };
  
  private readonly revealView = async () => {
    let [leaf] = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE });
    }
    
    this.app.workspace.revealLeaf(leaf);
  }

  private indexAll = async (): Promise<void> => {
    const mdFiles = app.vault.getMarkdownFiles()
    console.log(PLUGIN_NAME + ': Indexing ' + mdFiles.length + ' files.')
    mdFiles.forEach((file) => {
      const links = this.getLinksForPath(file.path)
      // For a bulk index, skip anything that doesn't have links.
      if (links.length > 0) {
        update(
          file.path,
          file.stat.mtime,
          links,
          this.data.state
        )
      }
    })
  }
  
  /** EVENT HANDLERS */
  // Note event handlers currently *mutate* the plugin .data object.
  
  /**
   * This appears to fire:
   * - On edits
   *   - Including when a file this file links to is renamed, which triggers an edit for this file
   *   - Including when a file is renamed to match an unresolved link in this file, even though 
   *     this doesn't trigger a rename
   * - For all files at app startup
   * - Occasionally at other times, it appears.
   */
  private readonly handleResolve = async (file: TFile): Promise<void> => {
    // TODO: if daily notes plugin, parse date from the path instead of using modtime.
    // Same for frontmatter?
    // If not that, use create time globally, or just for daily notes
    update(
      file.path,
      file.stat.mtime,
      this.getLinksForPath(file.path),
      this.data.state
    )
  }

  /**
   * Fires when all queued files have been resolved. 
   * 
   * We save and update view here to avoid duplicate work when 
   * there are a lot of changes, particularly at app startup.
   */
  private handleResolved = async (): Promise<void> => {
    this.saveData()
    this.view.redraw()
  }
  
  private handleRename = async (
    file: TAbstractFile,
    oldPath: string,
  ): Promise<void> => {
    const modTime = (await app.vault.adapter.stat(file.path))?.mtime

    if (modTime === undefined) {
      return
    }

    rename(
      file.path,
      oldPath,
      modTime,
      this.getLinksForPath(file.path),
      this.data.state
    )

    await this.saveData();
    this.view.redraw()
  };
            
  private handleDelete = async (
    file: TAbstractFile,
  ): Promise<void> => {
    remove(file.path, this.data.state)
    await this.saveData();
    this.view.redraw();
  };


  // TODO: can we use Obsidian's own function for this? MetadataCache.fileToLinktext?
  // TODO: cache Regex at least
  // TODOL strip path#heading suffixes
  pathToLinkText = (path: PathStr): LinkText => {
    return path.replace(/^.*\//, '').replace(/\.[^/.]+$/, '')
  }
      
  /**
   * Returns [[resolved links], [unresolved links]]
   */
  private getLinksForPath = (path: PathStr): Array<Link> => {
    let links: Array<Link> = []
    const resolvedlinks = app.metadataCache.resolvedLinks[path];
    const unresolvedLinks = app.metadataCache.unresolvedLinks[path]

    if (resolvedlinks !== undefined) {
      links = links.concat(Object.keys(resolvedlinks).map((path) => {
        return {
          isResolved: true,
          path: path,
          text: this.pathToLinkText(path)
        }}
      ))
    }
    if (unresolvedLinks !== undefined) {
      links = links.concat(Object.keys(unresolvedLinks).map((text) => {
        return {
          isResolved: false,
          text: text,
        }}
      ))
    }
    return links
  }
}
